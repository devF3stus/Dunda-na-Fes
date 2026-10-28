const express = require('express');
const {
  handleListJobs,
  handleGetJob,
  handleCreateJob,
  handleCancelJob,
} = require('../controllers/jobController');

const router = express.Router();

// GET /api/jobs — List all processing jobs (newest first)
router.get('/', handleListJobs);

// POST /api/jobs — Queue a new audio separation job from a staged file
router.post('/', handleCreateJob);

// GET /api/jobs/:id — Get live status/progress for a specific job
router.get('/:id', handleGetJob);

// POST /api/jobs/:id/cancel — Cancel a queued or running job
router.post('/:id/cancel', handleCancelJob);

module.exports = router;
