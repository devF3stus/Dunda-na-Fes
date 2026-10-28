const fs = require('fs');
const path = require('path');
const {
  listLibraryEntries,
  getLibraryEntryById,
  createLibraryEntry,
  updateLibraryEntry,
  deleteLibraryEntry,
  resolveSafeLibraryFilePath,
} = require('../services/libraryService');
const { AppError } = require('../utils/errors');
const { buildDownloadFilename } = require('../utils/naming');

function handleListLibrary(req, res, next) {
  try {
    const search = req.query.search || '';
    const items = listLibraryEntries({ search });
    res.status(200).json({ items, total: items.length });
  } catch (err) {
    next(err);
  }
}

function handleGetLibraryEntry(req, res, next) {
  try {
    const entry = getLibraryEntryById(req.params.id);
    res.status(200).json({ item: entry });
  } catch (err) {
    next(err);
  }
}

function handleCreateLibraryEntry(req, res, next) {
  try {
    const created = createLibraryEntry(req.body);
    res.status(201).json({ item: created });
  } catch (err) {
    next(err);
  }
}

function handleUpdateLibraryEntry(req, res, next) {
  try {
    const updated = updateLibraryEntry(req.params.id, req.body);
    res.status(200).json({ item: updated });
  } catch (err) {
    next(err);
  }
}

function handleDeleteLibraryEntry(req, res, next) {
  try {
    const result = deleteLibraryEntry(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * Stream or download an individual stem (`vocals` or `instrumental`).
 * Supports `?download=1` to set `Content-Disposition: attachment; filename="..."`.
 */
function handleStreamLibraryStem(req, res, next) {
  try {
    const { id, stem } = req.params;
    const normalizedStem = String(stem || '').toLowerCase();

    if (!['vocals', 'instrumental'].includes(normalizedStem)) {
      throw new AppError(
        'INVALID_STEM',
        "Stem must be either 'vocals' or 'instrumental'.",
        400
      );
    }

    const entry = getLibraryEntryById(id);
    const relativePath =
      normalizedStem === 'vocals' ? entry.vocalsPath : entry.instrumentalPath;
    const absolutePath = resolveSafeLibraryFilePath(relativePath);

    if (!fs.existsSync(absolutePath)) {
      throw new AppError(
        'AUDIO_FILE_MISSING',
        `The ${normalizedStem} audio file for "${entry.displayName}" could not be found on disk.`,
        404
      );
    }

    const ext = path.extname(absolutePath) || '.wav';
    const downloadName = buildDownloadFilename(
      entry.displayName,
      normalizedStem,
      ext
    );

    if (req.query.download === '1' || req.query.download === 'true') {
      res.download(absolutePath, downloadName);
    } else {
      res.sendFile(absolutePath);
    }
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleListLibrary,
  handleGetLibraryEntry,
  handleCreateLibraryEntry,
  handleUpdateLibraryEntry,
  handleDeleteLibraryEntry,
  handleStreamLibraryStem,
};
