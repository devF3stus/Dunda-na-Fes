const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { AppError } = require('../utils/errors');
const { suggestDisplayName } = require('../utils/naming');
const { stageAudioFileFromTemp } = require('./stagingService');

const USER_AGENT =
  'DundaNaFes/0.1.0 (Local Single-User Vocal Separator; http://127.0.0.1)';

const ALLOWED_AUDIO_HOSTS = new Set([
  'archive.org',
  'upload.wikimedia.org',
  'commons.wikimedia.org',
]);

/**
 * Strip HTML tags and decode basic HTML entities from Wikimedia metadata strings.
 */
function stripHtml(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Convert a Creative Commons or Public Domain URL into a concise, human-readable
 * license label (e.g., "CC BY 4.0", "Public Domain Mark 1.0", "CC0 1.0").
 */
function formatLicenseLabelFromUrl(licenseUrl, fallbackLabel = 'Public Domain / CC') {
  if (!licenseUrl) return fallbackLabel;
  const lower = String(licenseUrl).toLowerCase();

  if (lower.includes('publicdomain/zero') || lower.includes('/cc0/')) {
    return 'CC0 1.0 Public Domain';
  }
  if (lower.includes('publicdomain/mark') || lower.includes('/publicdomain')) {
    return 'Public Domain';
  }

  // Match /licenses/<type>/<version>
  const match = lower.match(/creativecommons\.org\/licenses\/([a-z-]+)(?:\/([0-9.]+))?/);
  if (match) {
    const code = match[1].toUpperCase();
    const ver = match[2] ? ` ${match[2]}` : '';
    return `CC ${code}${ver}`;
  }

  return fallbackLabel;
}

/**
 * Parse duration from Internet Archive file metadata (can be float seconds "174.2"
 * or "MM:SS" / "HH:MM:SS").
 */
function parseArchiveDuration(rawLength) {
  if (rawLength === undefined || rawLength === null) return null;
  const str = String(rawLength).trim();
  if (!str) return null;

  if (/^\d+(\.\d+)?$/.test(str)) {
    const val = Number.parseFloat(str);
    return Number.isFinite(val) && val > 0 ? Math.round(val * 100) / 100 : null;
  }

  const parts = str.split(':').map((p) => Number.parseFloat(p));
  if (parts.every((n) => Number.isFinite(n))) {
    if (parts.length === 2) {
      return Math.round((parts[0] * 60 + parts[1]) * 100) / 100;
    }
    if (parts.length === 3) {
      return Math.round((parts[0] * 3600 + parts[1] * 60 + parts[2]) * 100) / 100;
    }
  }
  return null;
}

/**
 * Validate that a remote audio URL belongs strictly to our allowlisted legal
 * HTTPS hosts (Internet Archive or Wikimedia Commons) to prevent SSRF.
 */
function validateAllowedDiscoverAudioUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new AppError(
      'INVALID_AUDIO_URL',
      'A valid audio download URL is required.',
      400
    );
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new AppError(
      'INVALID_AUDIO_URL',
      'The provided audio URL is malformed.',
      400
    );
  }

  if (parsed.protocol !== 'https:') {
    throw new AppError(
      'UNSAFE_AUDIO_URL',
      'Only HTTPS audio URLs from approved legal catalogues are permitted.',
      400
    );
  }

  const host = parsed.hostname.toLowerCase();
  const isArchiveSubdomain = host.endsWith('.archive.org');
  if (!ALLOWED_AUDIO_HOSTS.has(host) && !isArchiveSubdomain) {
    throw new AppError(
      'UNAPPROVED_SOURCE_DOMAIN',
      `Domain "${host}" is not an approved legal Discover source. Only Internet Archive and Wikimedia Commons URLs are permitted.`,
      400
    );
  }

  return parsed.toString();
}

/**
 * Determine a safe file extension (.mp3, .wav, .flac, .m4a, .ogg) from a URL or filename.
 * Maps Wikimedia's `.oga` (Ogg Vorbis Audio) to `.ogg`.
 */
function inferSupportedAudioExtension(urlOrFilename) {
  try {
    const pathname = urlOrFilename.startsWith('http')
      ? new URL(urlOrFilename).pathname
      : urlOrFilename;
    let ext = path.extname(decodeURIComponent(pathname)).toLowerCase();
    if (ext === '.oga') {
      ext = '.ogg';
    }
    if (config.upload.allowedExtensions.includes(ext)) {
      return ext;
    }
  } catch {
    // Fall through
  }
  return '.mp3';
}

/**
 * Search Internet Archive's Advanced Search + Item Metadata APIs for openly licensed audio.
 */
async function searchInternetArchive(query, limit = 8, fetchImpl = fetch) {
  const cleanQ = String(query || '').trim();
  const luceneQuery = [
    'mediatype:audio',
    'licenseurl:(*creativecommons* OR *publicdomain*)',
    'NOT collection:librivoxaudio',
    `(${cleanQ})`,
  ].join(' AND ');

  const searchUrl = new URL('https://archive.org/advancedsearch.php');
  searchUrl.searchParams.set('q', luceneQuery);
  searchUrl.searchParams.append('fl[]', 'identifier');
  searchUrl.searchParams.append('fl[]', 'title');
  searchUrl.searchParams.append('fl[]', 'creator');
  searchUrl.searchParams.append('fl[]', 'licenseurl');
  searchUrl.searchParams.append('sort[]', 'downloads desc');
  searchUrl.searchParams.set('rows', String(Math.min(limit, 12)));
  searchUrl.searchParams.set('page', '1');
  searchUrl.searchParams.set('output', 'json');

  const response = await fetchImpl(searchUrl.toString(), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });

  if (response.status === 429) {
    throw new AppError(
      'DISCOVER_RATE_LIMITED',
      'Internet Archive is temporarily rate-limiting requests. Please wait a few seconds and try again.',
      429
    );
  }

  if (!response.ok) {
    throw new AppError(
      'DISCOVER_UPSTREAM_ERROR',
      `Internet Archive search returned HTTP ${response.status}.`,
      502
    );
  }

  const data = await response.json();
  const docs = data?.response?.docs || [];
  if (docs.length === 0) {
    return [];
  }

  const maxBytes = config.upload.maxFileSizeMb * 1024 * 1024;
  const preferredOrder = ['.mp3', '.m4a', '.ogg', '.flac', '.wav'];

  const detailPromises = docs.slice(0, limit).map(async (doc) => {
    const identifier = doc.identifier;
    if (!identifier) return null;

    const metaUrl = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
    const metaRes = await fetchImpl(metaUrl, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!metaRes.ok) return null;

    const meta = await metaRes.json();
    const files = Array.isArray(meta?.files) ? meta.files : [];

    // Filter to supported audio files within our size limit
    const candidates = files.filter((f) => {
      if (!f || !f.name) return false;
      const ext = path.extname(String(f.name)).toLowerCase();
      if (!preferredOrder.includes(ext)) return false;
      const size = Number.parseInt(f.size, 10);
      if (Number.isFinite(size) && (size <= 0 || size > maxBytes)) return false;
      return true;
    });

    if (candidates.length === 0) return null;

    // Sort candidates so .mp3 is preferred for fast preview & download
    candidates.sort((a, b) => {
      const extA = path.extname(String(a.name)).toLowerCase();
      const extB = path.extname(String(b.name)).toLowerCase();
      return preferredOrder.indexOf(extA) - preferredOrder.indexOf(extB);
    });

    const chosenFile = candidates[0];
    const encodedFilePath = String(chosenFile.name)
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');

    const audioUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedFilePath}`;
    const licenseUrl =
      doc.licenseurl ||
      meta?.metadata?.licenseurl ||
      'https://creativecommons.org/publicdomain/mark/1.0/';
    const licenseShort = formatLicenseLabelFromUrl(licenseUrl, 'Open License');
    const artist = Array.isArray(doc.creator)
      ? doc.creator.join(', ')
      : doc.creator || meta?.metadata?.creator || 'Unknown Artist';
    const title =
      doc.title ||
      chosenFile.title ||
      meta?.metadata?.title ||
      identifier;

    const ext = path.extname(String(chosenFile.name)).toLowerCase() || '.mp3';
    const sizeBytes = Number.parseInt(chosenFile.size, 10);

    return {
      id: `ia:${identifier}:${chosenFile.name}`,
      sourceId: 'archive',
      sourceLabel: 'Internet Archive',
      title: String(title).trim(),
      artist: String(artist).trim(),
      durationSeconds: parseArchiveDuration(chosenFile.length),
      sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
      format: ext.replace('.', '').toUpperCase(),
      licenseLabel: licenseShort,
      licenseUrl: String(licenseUrl),
      licenseInfo: `${licenseShort} (Internet Archive • ${licenseUrl})`,
      audioUrl,
      pageUrl: `https://archive.org/details/${encodeURIComponent(identifier)}`,
    };
  });

  const settled = await Promise.allSettled(detailPromises);
  return settled
    .filter((r) => r.status === 'fulfilled' && r.value !== null)
    .map((r) => r.value);
}

/**
 * Search Wikimedia Commons MediaWiki API for Public Domain and CC-licensed audio files.
 */
async function searchWikimediaCommons(query, limit = 8, fetchImpl = fetch) {
  const cleanQ = String(query || '').trim();
  const apiUrl = new URL('https://commons.wikimedia.org/w/api.php');
  apiUrl.searchParams.set('action', 'query');
  apiUrl.searchParams.set('generator', 'search');
  apiUrl.searchParams.set('gsrnamespace', '6');
  apiUrl.searchParams.set('gsrsearch', `filetype:audio ${cleanQ}`);
  apiUrl.searchParams.set('gsrlimit', String(Math.min(limit, 15)));
  apiUrl.searchParams.set('prop', 'imageinfo');
  apiUrl.searchParams.set('iiprop', 'url|size|mime|extmetadata');
  apiUrl.searchParams.set('format', 'json');

  const response = await fetchImpl(apiUrl.toString(), {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  });

  if (response.status === 429) {
    throw new AppError(
      'DISCOVER_RATE_LIMITED',
      'Wikimedia Commons is temporarily rate-limiting requests. Please wait a few seconds and try again.',
      429
    );
  }

  if (!response.ok) {
    throw new AppError(
      'DISCOVER_UPSTREAM_ERROR',
      `Wikimedia Commons search returned HTTP ${response.status}.`,
      502
    );
  }

  const data = await response.json();
  const pagesObj = data?.query?.pages || {};
  const pages = Object.values(pagesObj);
  if (pages.length === 0) {
    return [];
  }

  const maxBytes = config.upload.maxFileSizeMb * 1024 * 1024;
  const results = [];

  for (const page of pages) {
    const info = page?.imageinfo?.[0];
    if (!info || !info.url) continue;

    const sizeBytes = Number(info.size);
    if (Number.isFinite(sizeBytes) && (sizeBytes <= 0 || sizeBytes > maxBytes)) {
      continue;
    }

    const rawUrl = String(info.url);
    const ext = inferSupportedAudioExtension(rawUrl);
    if (!config.upload.allowedExtensions.includes(ext)) {
      continue;
    }

    const extMeta = info.extmetadata || {};
    const rawTitle =
      extMeta.ObjectName?.value ||
      String(page.title || '').replace(/^File:/i, '');
    const cleanTitle = stripHtml(rawTitle).replace(/\.(ogg|oga|wav|mp3|flac|m4a)$/i, '');
    const artist =
      stripHtml(extMeta.Artist?.value) ||
      stripHtml(extMeta.Attribution?.value) ||
      'Wikimedia Commons Contributor';

    const licenseShort =
      stripHtml(extMeta.LicenseShortName?.value) ||
      stripHtml(extMeta.UsageTerms?.value) ||
      'Creative Commons / Public Domain';
    const licenseUrl =
      stripHtml(extMeta.LicenseUrl?.value) ||
      info.descriptionurl ||
      'https://commons.wikimedia.org/wiki/Commons:Licensing';

    const duration =
      typeof info.duration === 'number' && Number.isFinite(info.duration)
        ? Math.round(info.duration * 100) / 100
        : null;

    results.push({
      id: `wm:${page.pageid}`,
      sourceId: 'wikimedia',
      sourceLabel: 'Wikimedia Commons',
      title: cleanTitle || 'Untitled Audio',
      artist,
      durationSeconds: duration,
      sizeBytes: Number.isFinite(sizeBytes) ? sizeBytes : null,
      format: ext.replace('.', '').toUpperCase(),
      licenseLabel: licenseShort,
      licenseUrl,
      licenseInfo: `${licenseShort} (Wikimedia Commons${
        licenseUrl ? ` • ${licenseUrl}` : ''
      })`,
      audioUrl: rawUrl,
      pageUrl:
        info.descriptionurl ||
        `https://commons.wikimedia.org/?curid=${page.pageid}`,
    });
  }

  return results;
}

/**
 * Search one or both legal catalogues ('both', 'archive', 'wikimedia').
 * Handles partial upstream failures gracefully if 'both' is selected.
 */
async function searchOpenMusic(
  { query, source = 'both', limit = 8 },
  fetchImpl = fetch
) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Please enter a search term (e.g., gospel, jazz, piano, choir, acoustic).',
      400
    );
  }

  const normalizedSource = String(source || 'both').toLowerCase();
  if (!['both', 'archive', 'wikimedia'].includes(normalizedSource)) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Invalid Discover source. Choose "both", "archive", or "wikimedia".',
      400
    );
  }

  if (normalizedSource === 'archive') {
    const items = await searchInternetArchive(cleanQuery, limit, fetchImpl);
    return { items, warnings: [] };
  }

  if (normalizedSource === 'wikimedia') {
    const items = await searchWikimediaCommons(cleanQuery, limit, fetchImpl);
    return { items, warnings: [] };
  }

  // 'both': query Internet Archive and Wikimedia Commons concurrently
  const perSourceLimit = Math.max(4, Math.ceil(limit / 2));
  const [iaRes, wmRes] = await Promise.allSettled([
    searchInternetArchive(cleanQuery, perSourceLimit, fetchImpl),
    searchWikimediaCommons(cleanQuery, perSourceLimit, fetchImpl),
  ]);

  if (iaRes.status === 'rejected' && wmRes.status === 'rejected') {
    const firstErr = iaRes.reason;
    if (firstErr instanceof AppError) {
      throw firstErr;
    }
    throw new AppError(
      'DISCOVER_NETWORK_ERROR',
      'Could not reach Internet Archive or Wikimedia Commons. Check your internet connection and try again.',
      502
    );
  }

  const warnings = [];
  const combined = [];

  if (iaRes.status === 'fulfilled') {
    combined.push(...iaRes.value);
  } else {
    warnings.push(
      `Internet Archive was temporarily unavailable (${
        iaRes.reason?.message || 'timeout'
      }), showing Wikimedia Commons results.`
    );
  }

  if (wmRes.status === 'fulfilled') {
    combined.push(...wmRes.value);
  } else {
    warnings.push(
      `Wikimedia Commons was temporarily unavailable (${
        wmRes.reason?.message || 'timeout'
      }), showing Internet Archive results.`
    );
  }

  return {
    items: combined,
    warnings,
  };
}

/**
 * Download an openly licensed track from an approved Discover source into a temporary file,
 * validate its binary magic-byte signature and duration via `stageAudioFileFromTemp`,
 * and store its license metadata in `staged_files`.
 */
async function downloadDiscoverTrackToStaging(
  { title, artist, audioUrl, licenseInfo },
  { db, stagingDir = config.paths.stagingDir, tempDir = config.paths.tempDir, fetchImpl = fetch } = {}
) {
  const safeUrl = validateAllowedDiscoverAudioUrl(audioUrl);

  const cleanTitle = String(title || 'Discovered Track').trim();
  const cleanArtist = String(artist || '').trim();
  const cleanLicense = String(licenseInfo || '').trim();

  if (!cleanLicense) {
    throw new AppError(
      'LICENSE_REQUIRED',
      'Per-track license metadata is required when importing from Discover.',
      400
    );
  }

  const ext = inferSupportedAudioExtension(safeUrl);
  const displayBase =
    cleanArtist &&
    !cleanTitle.toLowerCase().includes(cleanArtist.toLowerCase()) &&
    cleanArtist !== 'Unknown Artist' &&
    cleanArtist !== 'Wikimedia Commons Contributor'
      ? `${cleanArtist} - ${cleanTitle}`
      : cleanTitle;

  const cleanSuggested = suggestDisplayName(displayBase);
  const originalName = `${cleanSuggested}${ext}`;

  fs.mkdirSync(tempDir, { recursive: true });
  const tempFilePath = path.join(
    tempDir,
    `discover-${crypto.randomUUID()}${ext}`
  );

  try {
    let response;
    try {
      response = await fetchImpl(safeUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(60000),
      });
    } catch (netErr) {
      throw new AppError(
        'DISCOVER_DOWNLOAD_FAILED',
        `Could not download track from remote catalogue (${netErr.message || 'network timeout'}).`,
        502
      );
    }

    if (response.status === 429) {
      throw new AppError(
        'DISCOVER_RATE_LIMITED',
        'The remote music catalogue rate-limited this download. Please wait a moment and try again.',
        429
      );
    }

    if (!response.ok) {
      throw new AppError(
        'DISCOVER_DOWNLOAD_FAILED',
        `Remote server returned HTTP ${response.status} while downloading the audio file.`,
        502
      );
    }

    const maxBytes = config.upload.maxFileSizeMb * 1024 * 1024;
    const contentLength = Number.parseInt(
      response.headers?.get?.('content-length') || '',
      10
    );
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new AppError(
        'FILE_TOO_LARGE',
        `Remote audio file exceeds the maximum allowed size of ${config.upload.maxFileSizeMb} MB.`,
        413
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > maxBytes) {
      throw new AppError(
        'FILE_TOO_LARGE',
        `Remote audio file exceeds the maximum allowed size of ${config.upload.maxFileSizeMb} MB.`,
        413
      );
    }

    fs.writeFileSync(tempFilePath, buffer);

    return stageAudioFileFromTemp(
      {
        tempFilePath,
        originalName,
        source: 'discover',
        licenseInfo: cleanLicense,
        suggestedName: cleanSuggested,
      },
      db,
      stagingDir
    );
  } catch (err) {
    if (fs.existsSync(tempFilePath)) {
      try {
        fs.rmSync(tempFilePath, { force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
    throw err;
  }
}

module.exports = {
  searchOpenMusic,
  searchInternetArchive,
  searchWikimediaCommons,
  downloadDiscoverTrackToStaging,
  validateAllowedDiscoverAudioUrl,
  formatLicenseLabelFromUrl,
};
