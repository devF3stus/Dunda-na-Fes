const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config');
const { getDb } = require('../db');
const { AppError } = require('../utils/errors');
const {
  sanitizeDisplayName,
  resolveUniqueDisplayName,
} = require('../utils/naming');

/**
 * Convert a database snake_case row into a clean camelCase API object.
 */
function formatLibraryRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    originalName: row.original_name,
    source: row.source,
    licenseInfo: row.license_info,
    durationSeconds: row.duration_seconds,
    vocalsPath: row.vocals_path,
    instrumentalPath: row.instrumental_path,
    modelUsed: row.model_used,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    audioUrls: {
      vocals: `/api/library/${row.id}/audio/vocals`,
      instrumental: `/api/library/${row.id}/audio/instrumental`,
    },
  };
}

/**
 * Ensure a relative stem path resolves strictly inside `storage/library/`
 * so path traversal (`../`) is mathematically impossible.
 */
function resolveSafeLibraryFilePath(relativeStemPath, libraryDir = config.paths.libraryDir) {
  const rootResolved = path.resolve(libraryDir);
  const fullResolved = path.resolve(rootResolved, relativeStemPath);

  if (
    !fullResolved.startsWith(rootResolved + path.sep) &&
    fullResolved !== rootResolved
  ) {
    throw new AppError(
      'INVALID_PATH',
      'The requested audio file path is invalid or outside the library folder.',
      400
    );
  }
  return fullResolved;
}

/**
 * List all library entries (newest first), optionally filtered by a search query.
 */
function listLibraryEntries({ search = '' } = {}, db = getDb()) {
  const trimmedSearch = String(search || '').trim();

  if (trimmedSearch) {
    const pattern = `%${trimmedSearch}%`;
    const rows = db
      .prepare(
        `
        SELECT * FROM library_entries
        WHERE display_name LIKE ? COLLATE NOCASE
           OR original_name LIKE ? COLLATE NOCASE
           OR notes LIKE ? COLLATE NOCASE
        ORDER BY created_at DESC
      `
      )
      .all(pattern, pattern, pattern);
    return rows.map(formatLibraryRow);
  }

  const rows = db
    .prepare('SELECT * FROM library_entries ORDER BY created_at DESC')
    .all();
  return rows.map(formatLibraryRow);
}

/**
 * Get a single library entry by ID, or throw 404 AppError.
 */
function getLibraryEntryById(id, db = getDb()) {
  const row = db
    .prepare('SELECT * FROM library_entries WHERE id = ?')
    .get(String(id || ''));

  if (!row) {
    throw new AppError(
      'LIBRARY_ENTRY_NOT_FOUND',
      'Could not find the requested song in your Library.',
      404
    );
  }
  return formatLibraryRow(row);
}

/**
 * Create a new Library entry.
 * Automatically sanitizes `displayName` for Windows safety and appends `(2)`, `(3)`
 * if an entry with that display name already exists.
 */
function createLibraryEntry(payload, db = getDb()) {
  const {
    id = crypto.randomUUID(),
    displayName,
    originalName,
    source = 'upload',
    licenseInfo = 'Personal Local File',
    durationSeconds = null,
    vocalsPath,
    instrumentalPath,
    modelUsed = config.models.defaultModel,
    status = 'ready',
    notes = '',
  } = payload || {};

  if (!originalName || typeof originalName !== 'string' || !originalName.trim()) {
    throw new AppError(
      'VALIDATION_ERROR',
      'originalName is required to create a Library entry.',
      400
    );
  }

  if (!['upload', 'discover'].includes(source)) {
    throw new AppError(
      'VALIDATION_ERROR',
      "source must be either 'upload' or 'discover'.",
      400
    );
  }

  if (!vocalsPath || !instrumentalPath) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Both vocalsPath and instrumentalPath are required.',
      400
    );
  }

  // Validate that neither relative path escapes the library root
  resolveSafeLibraryFilePath(vocalsPath);
  resolveSafeLibraryFilePath(instrumentalPath);

  // Resolve a unique, Windows-safe display name
  const existingRows = db
    .prepare('SELECT display_name FROM library_entries')
    .all();
  const existingNames = existingRows.map((r) => r.display_name);
  const desiredBase = displayName && String(displayName).trim()
    ? displayName
    : originalName;
  const finalDisplayName = resolveUniqueDisplayName(desiredBase, existingNames);

  const now = new Date().toISOString();
  const safeDuration =
    durationSeconds !== null && durationSeconds !== undefined
      ? Number(durationSeconds)
      : null;

  db.prepare(
    `
    INSERT INTO library_entries (
      id, display_name, original_name, source, license_info,
      duration_seconds, vocals_path, instrumental_path, model_used,
      status, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    finalDisplayName,
    originalName.trim(),
    source,
    String(licenseInfo || 'Personal Local File').trim(),
    safeDuration,
    vocalsPath,
    instrumentalPath,
    String(modelUsed).trim(),
    status,
    String(notes || '').trim(),
    now,
    now
  );

  return getLibraryEntryById(id, db);
}

/**
 * Update a Library entry's displayName and/or notes.
 * If renamed to a name that collides with another entry, appends `(2)`, `(3)`, etc.
 */
function updateLibraryEntry(id, updates = {}, db = getDb()) {
  const existing = getLibraryEntryById(id, db);

  const hasDisplayName = Object.prototype.hasOwnProperty.call(
    updates,
    'displayName'
  );
  const hasNotes = Object.prototype.hasOwnProperty.call(updates, 'notes');

  if (!hasDisplayName && !hasNotes) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Provide displayName or notes to update the Library entry.',
      400
    );
  }

  let nextDisplayName = existing.displayName;
  if (hasDisplayName) {
    if (
      typeof updates.displayName !== 'string' ||
      !updates.displayName.trim()
    ) {
      throw new AppError(
        'VALIDATION_ERROR',
        'New display name cannot be empty.',
        400
      );
    }

    const sanitizedDesired = sanitizeDisplayName(updates.displayName);
    const otherRows = db
      .prepare('SELECT display_name FROM library_entries WHERE id != ?')
      .all(existing.id);
    const otherNames = otherRows.map((r) => r.display_name);
    nextDisplayName = resolveUniqueDisplayName(sanitizedDesired, otherNames);
  }

  let nextNotes = existing.notes;
  if (hasNotes) {
    if (typeof updates.notes !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'notes must be a string.', 400);
    }
    nextNotes = updates.notes.trim().slice(0, 1000);
  }

  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE library_entries
    SET display_name = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(nextDisplayName, nextNotes, now, existing.id);

  return getLibraryEntryById(existing.id, db);
}

/**
 * Delete a Library entry from SQLite AND remove its stem files (and entry folder)
 * from `storage/library/` on disk.
 */
function deleteLibraryEntry(
  id,
  db = getDb(),
  libraryDir = config.paths.libraryDir
) {
  const existing = getLibraryEntryById(id, db);

  // 1. Delete individual stem files if they exist inside storage/library/
  for (const relPath of [existing.vocalsPath, existing.instrumentalPath]) {
    try {
      const absPath = resolveSafeLibraryFilePath(relPath, libraryDir);
      if (fs.existsSync(absPath)) {
        fs.rmSync(absPath, { force: true });
      }
      // If the file lived in a per-entry subdirectory `<libraryDir>/<id>/`, remove the directory if empty
      const parentDir = path.dirname(absPath);
      const resolvedLibraryRoot = path.resolve(libraryDir);
      if (
        parentDir !== resolvedLibraryRoot &&
        parentDir.startsWith(resolvedLibraryRoot + path.sep) &&
        fs.existsSync(parentDir)
      ) {
        const remaining = fs.readdirSync(parentDir);
        if (remaining.length === 0) {
          fs.rmdirSync(parentDir);
        }
      }
    } catch {
      // Ignore missing files so database cleanup always succeeds
    }
  }

  // 2. Delete the row from SQLite
  db.prepare('DELETE FROM library_entries WHERE id = ?').run(existing.id);

  return {
    deleted: true,
    id: existing.id,
    displayName: existing.displayName,
  };
}

module.exports = {
  listLibraryEntries,
  getLibraryEntryById,
  createLibraryEntry,
  updateLibraryEntry,
  deleteLibraryEntry,
  resolveSafeLibraryFilePath,
};
