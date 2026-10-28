const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config');
const { AppError } = require('../utils/errors');

function createUploadMiddleware() {
  const storage = multer.diskStorage({
    destination(req, file, cb) {
      try {
        fs.mkdirSync(config.paths.tempDir, { recursive: true });
        cb(null, config.paths.tempDir);
      } catch (err) {
        cb(err);
      }
    },
    filename(req, file, cb) {
      // Never trust the user's filename on disk—always use a random server UUID
      const tempName = `upload-${crypto.randomUUID()}.tmp`;
      cb(null, tempName);
    },
  });

  return (req, res, next) => {
    const maxBytes = Math.floor(config.upload.maxFileSizeMb * 1024 * 1024);
    const uploader = multer({
      storage,
      limits: {
        fileSize: maxBytes,
        files: 1,
      },
    }).single('file');

    uploader(req, res, (err) => {
      if (!err) {
        return next();
      }

      if (err.code === 'ENOSPC') {
        return next(
          new AppError(
            'DISK_FULL',
            'Your disk is full (not enough free storage space to save the uploaded audio file). Please free up disk space and try again.',
            507
          )
        );
      }

      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return next(
            new AppError(
              'FILE_TOO_LARGE',
              `The uploaded file exceeds the maximum allowed size of ${config.upload.maxFileSizeMb} MB.`,
              413
            )
          );
        }
        return next(
          new AppError(
            'UPLOAD_ERROR',
            `Upload failed: ${err.message}`,
            400
          )
        );
      }

      return next(
        new AppError(
          'UPLOAD_ERROR',
          err.message || 'Could not process the file upload.',
          400
        )
      );
    });
  };
}

module.exports = {
  createUploadMiddleware,
};
