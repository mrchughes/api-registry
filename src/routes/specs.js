const express = require('express');
const router = express.Router();
const specsController = require('../controllers/specsController');
const { flexibleAuth, optionalAuth } = require('../utils/auth');

// Register or update API specification (requires authentication)
router.post('/', flexibleAuth, specsController.registerSpec);

// Get latest API specification (optional authentication for enhanced features)
router.get('/:serviceName/latest', optionalAuth, specsController.getLatestSpec);

// Get specific API specification (optional authentication for enhanced features)
router.get('/:serviceName/:version', optionalAuth, specsController.getSpec);

module.exports = router;
