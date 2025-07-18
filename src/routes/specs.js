const express = require('express');
const router = express.Router();
const specsController = require('../controllers/specsController');
const { flexibleAuth, optionalAuth } = require('../utils/auth');

// List all API specifications (public)
router.get('/', specsController.listSpecs);

// Register or update API specification (requires authentication)
router.post('/', flexibleAuth, specsController.registerSpec);

// Get latest API specification (public)
router.get('/:serviceName/latest', specsController.getLatestSpec);

// Get specific API specification (public)
router.get('/:serviceName/:version', specsController.getSpec);

// Delete API specification (requires authentication)
router.delete('/:serviceName/:version', flexibleAuth, specsController.deleteSpec);

// Mark API as deprecated (requires authentication)
router.patch('/:serviceName/:version/deprecate', flexibleAuth, specsController.deprecateSpec);

// Validate API specification (public)
router.post('/validate', specsController.validateSpecification);

module.exports = router;
