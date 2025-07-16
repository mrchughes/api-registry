const express = require('express');
const router = express.Router();
const specsController = require('../controllers/specsController');
const apiKeyAuth = require('../utils/auth');

// Register or update API specification (requires API key)
router.post('/', apiKeyAuth, specsController.registerSpec);

// Get latest API specification
router.get('/:serviceName/latest', specsController.getLatestSpec);

// Get specific API specification
router.get('/:serviceName/:version', specsController.getSpec);

module.exports = router;
