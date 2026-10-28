const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { getDb } = require('../db');
const { AppError } = require('../utils/errors');
const { suggestDisplayName } = require('../utils/naming');
const {
  validateUploadedAudioFile,
  probeAudioDurationSeconds,
} = require('../utils/audioValidation');

function formatStagedRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    originalName: row.original_name,
    suggestedName: row.suggested_name,
    storedFilename: row.stored_filename,
    source: row.source,
    licenseInfo: row.license_info,
    sizeBytes: row.size_bytes,
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
  };
}

/**
 * Ensure a stored filename resolves strictly inside `storage/staging/`
 * so path traversal (`../`) is impossible.
 */
function resolveSafeStagingFilePath(
  storedFilename,
  stagingDir = config.paths.stagingDir
) {
  const rootResolved = path.resolve(stagingDir);
  const fullResolved = path.resolve(rootResolved, String(storedFilename || ''));

  if (
    !fullResolved.startsWith(rootResolved + path.sep) ||
    fullResolved === rootResolved
  ) {
    throw new AppError(
      'INVALID_PATH',
      'Invalid staged file path.',
      400
    );
  }
  return fullResolved;
}

/**
 * List all currently staged files (newest first).
 */
function listStagedFiles(db = getDb()) {
  const rows = db
    .prepare('SELECT * FROM staged_files ORDER BY created_at DESC')
    .all();
  return rows.map(formatStagedRow);
}

/**
 * Get a single staged file by ID, or throw 404 AppError.
 */
function getStagedFileById(id, db = getDb()) {
  const row = db
    .prepare('SELECT * FROM staged_files WHERE id = ?')
    .get(String(id || ''));

  if (!row) {
    throw new AppError(
      'STAGED_FILE_NOT_FOUND',
      'The requested staged song was not found.',
      404
    );
  }
  return formatStagedRow(row);
}

/**
 * Validate an uploaded or downloaded temp file, move it into `storage/staging/<uuid>.<ext>`,
 * probe its duration via `ffprobe`, and insert a row into `staged_files`.
 * Always deletes `tempFilePath` if validation fails.
 */
function stageAudioFileFromTemp(
  {
    tempFilePath,
    originalName,
    source = 'upload',
    licenseInfo = 'Personal Local File',
    suggestedName = null,
  },
  db = getDb(),
  stagingDir = config.paths.stagingDir
) {
  if (!tempFilePath || !fs.existsSync(tempFilePath)) {
    throw new AppError(
      'UPLOAD_MISSING',
      'No audio file was received by the server.',
      400
    );
  }

  try {
    const stat = fs.statSync(tempFilePath);
    if (stat.size === 0) {
      throw new AppError(
        'EMPTY_FILE',
        'The uploaded file is empty (0 bytes).',
        400
      );
    }

    const maxBytes = config.upload.maxFileSizeMb * 1024 * 1024;
    if (stat.size > maxBytes) {
      throw new AppError(
        'FILE_TOO_LARGE',
        `File exceeds the maximum allowed size of ${config.upload.maxFileSizeMb} MB.`,
        413
      );
    }

    // Validate extension + binary magic bytes
    const { extension } = validateUploadedAudioFile(tempFilePath, originalName);

    // Probe duration via ffprobe
    const durationSeconds = probeAudioDurationSeconds(tempFilePath);

    const id = crypto.randomUUID();
    const storedFilename = `${id}${extension}`;
    fs.mkdirSync(stagingDir, { recursive: true });
    const destPath = resolveSafeStagingFilePath(storedFilename, stagingDir);

    // Move (or copy+unlink across drives) into storage/staging/
    try {
      fs.renameSync(tempFilePath, destPath);
    } catch {
      fs.copyFileSync(tempFilePath, destPath);
      fs.rmSync(tempFilePath, { force: true });
    }

    const cleanOriginal = String(originalName || 'track.mp3').trim();
    const cleanSuggested = suggestedName
      ? suggestDisplayName(suggestedName)
      : suggestDisplayName(cleanOriginal);
    const now = new Date().toISOString();

    db.prepare(
      `
      INSERT INTO staged_files (
        id, original_name, suggested_name, stored_filename,
        source, license_info, size_bytes, duration_seconds, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      cleanOriginal,
      cleanSuggested,
      storedFilename,
      source === 'discover' ? 'discover' : 'upload',
      String(licenseInfo || 'Personal Local File').trim(),
      stat.size,
      durationSeconds,
      now
    );

    return getStagedFileById(id, db);
  } catch (err) {
    // Always remove the temp upload file if validation or DB insertion fails
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

/**
 * Delete a staged file from SQLite and remove its audio file from `storage/staging/`.
 * Blocks deletion if an active ('queued' or 'running') job is currently using it.
 */
function deleteStagedFile(
  id,
  { allowIfJobActive = false } = {},
  db = getDb(),
  stagingDir = config.paths.stagingDir
) {
  const existing = getStagedFileById(id, db);

  if (!allowIfJobActive) {
    const activeJob = db
      .prepare(
        "SELECT id FROM jobs WHERE staged_file_id = ? AND status IN ('queued', 'running') LIMIT 1"
      )
      .get(existing.id);

    if (activeJob) {
      throw new AppError(
        'STAGED_FILE_IN_USE',
        `Cannot remove "${existing.originalName}" while it is queued or being processed. Cancel the active job first.`,
        409
      );
    }
  }

  try {
    const absPath = resolveSafeStagingFilePath(
      existing.storedFilename,
      stagingDir
    );
    if (fs.existsSync(absPath)) {
      fs.rmSync(absPath, { force: true });
    }
  } catch {
    // Ignore missing file on disk so DB row cleanup always succeeds
  }

  db.prepare('DELETE FROM staged_files WHERE id = ?').run(existing.id);

  return {
    deleted: true,
    id: existing.id,
    originalName: existing.originalName,
  };
}

module.exports = {
  listStagedFiles,
  getStagedFileById,
  stageAudioFileFromTemp,
  deleteStagedFile,
  resolveSafeStagingFilePath,
};
