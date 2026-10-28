const express = require('express');
const {
  handleSearchDiscover,
  handleStageDiscoveredTrack,
} = require('../controllers/discoverController');

const router = express.Router();

// GET /api/discover/search?q=<term>&source=both|archive|wikimedia
router.get('/search', handleSearchDiscover);

// POST /api/discover/stage
router.post('/stage', handleStageDiscoveredTrack);

module.exports = router;
