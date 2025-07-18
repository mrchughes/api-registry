// PATCH /services/:serviceName
exports.updateServiceDetails = async (req, res) => {
    try {
        const { serviceName } = req.params;
        const updateFields = req.body;

        // Only allow certain fields to be updated
        const allowedFields = ['description', 'baseUrl', 'healthCheckUrl', 'status', 'owner', 'documentation'];
        const updates = {};
        for (const key of allowedFields) {
            if (updateFields[key] !== undefined) {
                updates[key] = updateFields[key];
            }
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json(
                errors.format('validation/no-fields', 'No valid fields provided for update')
            );
        }

        // Debug log
        logger.info(`[PATCH] updateServiceDetails called for serviceName: '${serviceName}' with updates:`, updates);
        // Update service details
        const service = await serviceService.updateServiceDetails(serviceName, updates);
        if (!service) {
            logger.warn(`[PATCH] updateServiceDetails: Service not found for serviceName: '${serviceName}'`);
            return res.status(404).json(
                errors.format('service/not-found', `Service '${serviceName}' not found`)
            );
        }
        logger.info(`Service details updated: ${serviceName}`);
        res.json(service);
    } catch (err) {
        logger.error(`Error updating service details: ${err.message}`, { error: err.stack });
        res.status(500).json(
            errors.format('internal/server-error', 'Error updating service details')
        );
    }
};
const serviceService = require('../services/serviceService');
const specsService = require('../services/specsService');
const { errors } = require('../lib/shared-libraries');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/api-registry.log' })
    ]
});

// POST /services
exports.registerService = async (req, res) => {
    try {
        const { name, description, baseUrl, healthCheckUrl, status, owner, documentation } = req.body;

        // Validate required fields
        if (!name || !baseUrl) {
            return res.status(400).json(
                errors.format('validation/missing-fields', 'Service name and baseUrl are required')
            );
        }

        // Register service
        const result = await serviceService.saveService({
            name,
            description,
            baseUrl,
            healthCheckUrl,
            status: status || 'active',
            owner,
            documentation
        });

        logger.info(`Service registered: ${name}`, { serviceName: name });
        res.status(201).json(result);
    } catch (err) {
        logger.error(`Error registering service: ${err.message}`, { error: err.stack });

        if (err.code === 'service/already-exists') {
            return res.status(409).json(
                errors.format(err.code, err.message)
            );
        }

        res.status(500).json(
            errors.format('internal/server-error', 'Error registering service')
        );
    }
};

// GET /services/:serviceName
exports.getServiceDetails = async (req, res) => {
    try {
        const { serviceName } = req.params;

        // Get service details
        const service = await serviceService.getService(serviceName);

        if (!service) {
            return res.status(404).json(
                errors.format('service/not-found', `Service '${serviceName}' not found`)
            );
        }

        // Get specs for this service
        const specs = await specsService.getSpecsForService(serviceName);

        // Build the response
        const response = {
            ...service,
            specs: specs.map(spec => ({
                id: spec.id,
                version: spec.version,
                url: spec.url,
                docsUrl: spec.docsUrl,
                deprecated: spec.deprecated
            }))
        };

        res.json(response);
    } catch (err) {
        logger.error(`Error getting service details: ${err.message}`, { error: err.stack });
        res.status(500).json(
            errors.format('internal/server-error', 'Error retrieving service details')
        );
    }
};

// GET /services
exports.listServices = async (req, res) => {
    try {
        const { status, owner } = req.query;

        // Get services with optional filters
        const services = await serviceService.listServices({ status, owner });

        // For each service, get the latest spec
        const response = await Promise.all(services.map(async (service) => {
            const latestSpec = await specsService.getLatestSpec(service.name);

            return {
                id: service.id,
                name: service.name,
                description: service.description,
                baseUrl: service.baseUrl,
                status: service.status,
                latestSpec: latestSpec ? {
                    version: latestSpec.version,
                    url: latestSpec.url,
                    docsUrl: latestSpec.docsUrl
                } : null
            };
        }));

        res.json(response);
    } catch (err) {
        logger.error(`Error listing services: ${err.message}`, { error: err.stack });
        res.status(500).json(
            errors.format('internal/server-error', 'Error retrieving services list')
        );
    }
};

// PATCH /services/:serviceName/status
exports.updateServiceStatus = async (req, res) => {
    try {
        const { serviceName } = req.params;
        const { status } = req.body;

        // Validate status
        const validStatuses = ['active', 'maintenance', 'deprecated'];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json(
                errors.format('validation/invalid-status', `Status must be one of: ${validStatuses.join(', ')}`)
            );
        }

        // Update service status
        const service = await serviceService.updateServiceStatus(serviceName, status);

        if (!service) {
            return res.status(404).json(
                errors.format('service/not-found', `Service '${serviceName}' not found`)
            );
        }

        logger.info(`Service status updated: ${serviceName} -> ${status}`);
        res.json(service);
    } catch (err) {
        logger.error(`Error updating service status: ${err.message}`, { error: err.stack });
        res.status(500).json(
            errors.format('internal/server-error', 'Error updating service status')
        );
    }
};
