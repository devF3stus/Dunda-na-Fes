const fs = require('fs');
const {
  listStagedFiles,
  getStagedFileById,
  stageAudioFileFromTemp,
  deleteStagedFile,
  resolveSafeStagingFilePath,
} = require('../services/stagingService');
const { AppError } = require('../utils/errors');

function handleListStaged(req, res, next) {
  try {
    const items = listStagedFiles();
    res.status(200).json({ items, total: items.length });
  } catch (err) {
    next(err);
  }
}

function handleGetStaged(req, res, next) {
  try {
    const item = getStagedFileById(req.params.id);
    res.status(200).json({ item });
  } catch (err) {
    next(err);
  }
}

function handleUploadToStaging(req, res, next) {
  try {
    if (!req.file || !req.file.path) {
      throw new AppError(
        'UPLOAD_MISSING',
        'Please select an audio file (field name "file") to upload.',
        400
      );
    }

    const staged = stageAudioFileFromTemp({
      tempFilePath: req.file.path,
      originalName: req.file.originalname,
      source: 'upload',
      licenseInfo: req.body?.licenseInfo || 'Personal Local File',
    });

    res.status(201).json({ item: staged });
  } catch (err) {
    next(err);
  }
}

function handleDeleteStaged(req, res, next) {
  try {
    const result = deleteStagedFile(req.params.id);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

function handleStreamStagedAudio(req, res, next) {
  try {
    const item = getStagedFileById(req.params.id);
    const absPath = resolveSafeStagingFilePath(item.storedFilename);

    if (!fs.existsSync(absPath)) {
      throw new AppError(
        'AUDIO_FILE_MISSING',
        'The staged audio file could not be found on disk.',
        404
      );
    }

    res.sendFile(absPath);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleListStaged,
  handleGetStaged,
  handleUploadToStaging,
  handleDeleteStaged,
  handleStreamStagedAudio,
};
