const path = require('path');

// Characters forbidden in Windows filenames: < > : " / \ | ? * and ASCII control chars (0-31)
const WINDOWS_FORBIDDEN_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

// Reserved Windows device names (cannot be used as bare filenames on Windows)
const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

/**
 * Derive a clean suggested display name from an uploaded filename or track title.
 * Example: "03_Swanee_(Remastered).mp3" -> "03 Swanee (Remastered)"
 */
function suggestDisplayName(originalName) {
  if (!originalName || typeof originalName !== 'string') {
    return 'Untitled Track';
  }
  const parsed = path.parse(originalName);
  const base = parsed.name || originalName;
  const cleaned = base
    .replace(WINDOWS_FORBIDDEN_CHARS, ' ')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitizeDisplayName(cleaned || 'Untitled Track');
}

/**
 * Sanitize a user-provided or suggested display name so it is safe for both
 * UI display and Windows download filenames.
 */
function sanitizeDisplayName(rawName) {
  if (!rawName || typeof rawName !== 'string') {
    return 'Untitled Track';
  }

  // Strip Windows forbidden characters and trailing dots/spaces (which Windows dislikes)
  let cleaned = rawName
    .replace(WINDOWS_FORBIDDEN_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');

  if (!cleaned) {
    cleaned = 'Untitled Track';
  }

  // Limit length to 120 characters so Windows MAX_PATH (260 chars) is never exceeded
  if (cleaned.length > 120) {
    cleaned = cleaned.slice(0, 120).trim().replace(/[. ]+$/g, '');
  }

  if (WINDOWS_RESERVED_NAMES.has(cleaned.toUpperCase())) {
    cleaned = `${cleaned} Track`;
  }

  return cleaned || 'Untitled Track';
}

/**
 * Given a desired display name and a list of existing display names in the Library,
 * return a unique name by appending " (2)", " (3)", etc. if a duplicate exists.
 * Comparison is case-insensitive because Windows filenames are case-insensitive.
 */
function resolveUniqueDisplayName(desiredName, existingNames = []) {
  const baseName = sanitizeDisplayName(desiredName);
  const lowerExisting = new Set(
    existingNames.map((n) => String(n).toLowerCase())
  );

  if (!lowerExisting.has(baseName.toLowerCase())) {
    return baseName;
  }

  let counter = 2;
  while (lowerExisting.has(`${baseName} (${counter})`.toLowerCase())) {
    counter += 1;
  }
  return `${baseName} (${counter})`;
}

/**
 * Build a safe download filename for HTTP Content-Disposition headers on Windows.
 * Example: ("Swanee (2)", "vocals", ".wav") -> "Swanee (2) - vocals.wav"
 */
function buildDownloadFilename(displayName, stemType, extWithDot) {
  const safeBase = sanitizeDisplayName(displayName);
  const safeStem = stemType === 'vocals' ? 'vocals' : 'instrumental';
  const ext = extWithDot.startsWith('.') ? extWithDot : `.${extWithDot}`;
  return `${safeBase} - ${safeStem}${ext}`;
}

module.exports = {
  suggestDisplayName,
  sanitizeDisplayName,
  resolveUniqueDisplayName,
  buildDownloadFilename,
};
