const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const config = require('../config');
const { AppError } = require('./errors');

const ALLOWED_EXTENSIONS = new Set(['.mp3', '.wav', '.flac', '.m4a', '.ogg']);

/**
 * Inspect the first 64 bytes of a file on disk to verify its binary signature
 * ("magic bytes") matches a real audio container (MP3, WAV, FLAC, M4A, or OGG).
 *
 * Teaching Note: Browsers set `Content-Type` based only on the filename extension.
 * If a user renames `virus.exe` or `notes.txt` to `song.mp3`, checking the first
 * bytes of the file catches the fake immediately before it ever reaches Python/FFmpeg.
 */
function detectAudioFormatByMagicBytes(filePath) {
  let fd = null;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 12) {
      return null;
    }

    const buffer = Buffer.alloc(64);
    fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 64, 0);
    const slice = buffer.subarray(0, bytesRead);

    // 1. WAV: starts with "RIFF" (0..3) and "WAVE" (8..11)
    if (
      slice.subarray(0, 4).toString('ascii') === 'RIFF' &&
      slice.subarray(8, 12).toString('ascii') === 'WAVE'
    ) {
      return '.wav';
    }

    // 2. FLAC: starts with "fLaC" (0..3)
    if (slice.subarray(0, 4).toString('ascii') === 'fLaC') {
      return '.flac';
    }

    // 3. OGG: starts with "OggS" (0..3)
    if (slice.subarray(0, 4).toString('ascii') === 'OggS') {
      return '.ogg';
    }

    // 4. M4A / MP4 audio: bytes 4..7 equal "ftyp"
    if (slice.subarray(4, 8).toString('ascii') === 'ftyp') {
      return '.m4a';
    }

    // 5. MP3: either starts with "ID3" tag header (0..2) OR MPEG audio frame sync
    // (0xFF followed by top 3 bits 111 = 0xE0, with layer bits != 00)
    if (slice.subarray(0, 3).toString('ascii') === 'ID3') {
      return '.mp3';
    }
    if (
      slice[0] === 0xff &&
      (slice[1] & 0xe0) === 0xe0 &&
      (slice[1] & 0x06) !== 0x00
    ) {
      return '.mp3';
    }

    return null;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * Resolve `ffprobe` or `ffmpeg` binary on Windows, including checking WinGet
 * installation folders if the shell PATH was not refreshed.
 */
function resolveMediaToolPath(toolName = 'ffprobe') {
  const configured =
    toolName === 'ffprobe' ? config.paths.ffprobePath : config.paths.ffmpegPath;

  if (configured && path.isAbsolute(configured) && fs.existsSync(configured)) {
    return configured;
  }

  // Check if directly callable on PATH
  const probeCheck = spawnSync(configured || toolName, ['-version'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  if (probeCheck.status === 0) {
    return configured || toolName;
  }

  // Fallback for Windows WinGet Links / Packages
  if (process.platform === 'win32') {
    const exeName = toolName.endsWith('.exe') ? toolName : `${toolName}.exe`;
    const localAppData = process.env.LOCALAPPDATA || '';
    if (localAppData) {
      const linkPath = path.join(
        localAppData,
        'Microsoft',
        'WinGet',
        'Links',
        exeName
      );
      if (fs.existsSync(linkPath)) {
        return linkPath;
      }

      const packagesDir = path.join(
        localAppData,
        'Microsoft',
        'WinGet',
        'Packages'
      );
      if (fs.existsSync(packagesDir)) {
        const found = findExecutableRecursive(packagesDir, exeName.toLowerCase());
        if (found) return found;
      }
    }
  }

  return configured || toolName;
}

function findExecutableRecursive(dir, targetLower) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile() && entry.name.toLowerCase() === targetLower) {
        return fullPath;
      }
      if (entry.isDirectory()) {
        const nested = findExecutableRecursive(fullPath, targetLower);
        if (nested) return nested;
      }
    }
  } catch {
    // Ignore permission errors
  }
  return null;
}

/**
 * Probe an audio file's duration in seconds using `ffprobe`.
 * Returns a positive number or `null` if ffprobe is unavailable, and throws
 * an AppError if the file has valid magic bytes yet is structurally corrupt/unreadable.
 */
function probeAudioDurationSeconds(filePath) {
  const ffprobeBin = resolveMediaToolPath('ffprobe');
  const result = spawnSync(
    ffprobeBin,
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      filePath,
    ],
    {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
    }
  );

  if (result.error) {
    // If ffprobe itself is missing on the machine, return null rather than blocking staging;
    // the separator job will report FFMPEG_MISSING clearly if needed.
    return null;
  }

  if (result.status !== 0) {
    throw new AppError(
      'CORRUPT_AUDIO_FILE',
      'The audio file appears to be corrupted, truncated, or unreadable and could not be decoded.',
      400
    );
  }

  const parsed = parseFloat(String(result.stdout || '').trim());
  if (!Number.isNaN(parsed) && Number.isFinite(parsed) && parsed > 0) {
    return Math.round(parsed * 100) / 100;
  }

  throw new AppError(
    'CORRUPT_AUDIO_FILE',
    'The audio file appears to be corrupted or contains no valid audio stream (0s duration).',
    400
  );
}

/**
 * Validate an uploaded audio file's extension and magic bytes.
 * Throws a friendly AppError if invalid.
 */
function validateUploadedAudioFile(filePath, originalFilename) {
  const ext = path.extname(String(originalFilename || '')).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new AppError(
      'UNSUPPORTED_AUDIO_FORMAT',
      `Unsupported file extension "${ext || '(none)'}". Please upload an audio file in one of these formats: mp3, wav, flac, m4a, ogg.`,
      400
    );
  }

  const detectedExt = detectAudioFormatByMagicBytes(filePath);
  if (!detectedExt) {
    throw new AppError(
      'INVALID_AUDIO_CONTENT',
      'The uploaded file is not a valid audio file (its file header does not match MP3, WAV, FLAC, M4A, or OGG).',
      400
    );
  }

  return {
    extension: detectedExt,
  };
}

module.exports = {
  ALLOWED_EXTENSIONS,
  detectAudioFormatByMagicBytes,
  resolveMediaToolPath,
  probeAudioDurationSeconds,
  validateUploadedAudioFile,
};
