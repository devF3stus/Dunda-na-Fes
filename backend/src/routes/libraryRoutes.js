const express = require('express');
const {
  handleListLibrary,
  handleGetLibraryEntry,
  handleCreateLibraryEntry,
  handleUpdateLibraryEntry,
  handleDeleteLibraryEntry,
  handleStreamLibraryStem,
} = require('../controllers/libraryController');

const router = express.Router();

// GET /api/library?search=... — List or search Library entries
router.get('/', handleListLibrary);

// POST /api/library — Create a Library entry
router.post('/', handleCreateLibraryEntry);

// GET /api/library/:id — Get details for a single Library entry
router.get('/:id', handleGetLibraryEntry);

// PATCH /api/library/:id — Rename a Library entry or edit notes
router.patch('/:id', handleUpdateLibraryEntry);

// DELETE /api/library/:id — Delete a Library entry + its audio files on disk
router.delete('/:id', handleDeleteLibraryEntry);

// GET /api/library/:id/audio/:stem — Stream or download 'vocals' or 'instrumental'
router.get('/:id/audio/:stem', handleStreamLibraryStem);

module.exports = router;
