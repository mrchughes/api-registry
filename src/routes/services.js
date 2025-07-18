const express = require('express');
const router = express.Router();
const { flexibleAuth, optionalAuth } = require('../utils/auth');
const serviceController = require('../controllers/serviceController');


// PATCH routes must come before GET/POST routes
router.patch('/:serviceName/status', flexibleAuth, serviceController.updateServiceStatus);
router.patch('/:serviceName', flexibleAuth, serviceController.updateServiceDetails);

// Register a service (requires authentication)
router.post('/', flexibleAuth, serviceController.registerService);

// Get service details (public)
router.get('/:serviceName', serviceController.getServiceDetails);

// List all services (public)
router.get('/', serviceController.listServices);

module.exports = router;
