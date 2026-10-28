const express = require('express');
const { createUploadMiddleware } = require('../middleware/uploadMiddleware');
const {
  handleListStaged,
  handleGetStaged,
  handleUploadToStaging,
  handleDeleteStaged,
  handleStreamStagedAudio,
} = require('../controllers/stagingController');

const router = express.Router();

// GET /api/staging — List all staged files waiting to be processed
router.get('/', handleListStaged);

// POST /api/staging/upload — Upload a local audio file into Staging
router.post('/upload', createUploadMiddleware(), handleUploadToStaging);

// GET /api/staging/:id — Get metadata for a staged file
router.get('/:id', handleGetStaged);

// GET /api/staging/:id/audio — Stream a staged audio file for previewing
router.get('/:id/audio', handleStreamStagedAudio);

// DELETE /api/staging/:id — Remove a staged file from DB and disk
router.delete('/:id', handleDeleteStaged);

module.exports = router;
