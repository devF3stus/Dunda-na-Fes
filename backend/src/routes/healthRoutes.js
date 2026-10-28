const express = require('express');
const { getHealthReport } = require('../controllers/healthController');

const router = express.Router();

router.get('/', getHealthReport);

module.exports = router;
