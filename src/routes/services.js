/**
 * Services Router for API Registry - PDS 2.2
 * 
 * Enhanced service discovery with WebID-centric authentication flows,
 * dual authentication support, and comprehensive service metadata.
 */

const express = require('express');
const Joi = require('joi');
const winston = require('winston');
const { Service, ApiSpecification, ServiceHealthLog } = require('../database/models');

const router = express.Router();

// Get logger from main app
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console()
    ]
});

// Validation schemas
const serviceRegistrationSchema = Joi.object({
    name: Joi.string().min(2).max(100).required()
        .description('Unique service identifier'),

    displayName: Joi.string().min(2).max(100).required()
        .description('Human-readable service name'),

    description: Joi.string().max(500).required()
        .description('Brief description of the service'),

    baseUrl: Joi.string().uri().required()
        .description('Base URL where the service is accessible'),

    version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required()
        .description('Semantic version of the service'),

    category: Joi.string().valid('government', 'utility', 'healthcare', 'education', 'financial', 'other').required()
        .description('Service category for discovery'),

    healthCheckUrl: Joi.string().uri().required()
        .description('URL endpoint for health checking'),

    authenticationType: Joi.string().valid('solid-oidc-like', 'did-challenge-response', 'hybrid').required()
        .description('Primary authentication method used by this service'),

    webId: Joi.string().uri().allow('')
        .description('WebID for the service (PDS 2.2)'),

    didDocument: Joi.string().uri().allow('')
        .description('URL to the DID document'),

    apiSpecificationUrl: Joi.string().uri().allow('')
        .description('URL to the OpenAPI specification'),

    capabilities: Joi.alternatives().try(
        Joi.array().items(Joi.string()),
        Joi.string()
    ).description('Service capabilities'),

    dataTypes: Joi.alternatives().try(
        Joi.array().items(Joi.string()),
        Joi.string()
    ).description('Data types handled by the service'),

    contactEmail: Joi.string().email().allow('')
        .description('Contact email for support'),

    documentation: Joi.string().uri().allow('')
        .description('URL to service documentation'),

    support: Joi.string().uri().allow('')
        .description('URL to support resources')
});

const serviceUpdateSchema = serviceRegistrationSchema.fork(
    ['name', 'displayName', 'baseUrl', 'version', 'category', 'authenticationType', 'healthCheckUrl'],
    (schema) => schema.optional()
);

const serviceQuerySchema = Joi.object({
    category: Joi.string().valid('data-store', 'identity-provider', 'application', 'utility', 'integration'),
    authType: Joi.string().valid('solid-oidc', 'did-challenge', 'api-key', 'bearer-token', 'none'),
    capability: Joi.string(),
    dataType: Joi.string(),
    webId: Joi.string().uri(),
    status: Joi.string().valid('active', 'inactive', 'maintenance'),
    limit: Joi.number().integer().min(1).max(100).default(10),
    offset: Joi.number().integer().min(0).default(0),
    sort: Joi.string().valid('name', 'category', 'created', 'updated').default('name'),
    order: Joi.string().valid('asc', 'desc').default('asc')
});

// Middleware for request validation
const validateRequest = (schema, source = 'body') => {
    return (req, res, next) => {
        const { error, value } = schema.validate(req[source], {
            abortEarly: false,
            stripUnknown: true
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            return res.status(400).json({
                error: 'validation_error',
                message: 'Request validation failed',
                details: errors,
                timestamp: new Date().toISOString()
            });
        }

        req[source] = value;
        next();
    };
};

// GET /api/v1/services - List services with filtering
router.get('/', validateRequest(serviceQuerySchema, 'query'), async (req, res) => {
    try {
        const {
            category,
            authType,
            capability,
            dataType,
            webId,
            status,
            limit,
            offset,
            sort,
            order
        } = req.query;

        // Build query filters
        const filters = { deletedAt: { $exists: false } };

        if (category) filters.category = category;
        if (status) filters.status = status;
        if (webId) filters.webId = webId;
        if (authType) filters['authentication.type'] = authType;
        if (capability) filters.capabilities = { $in: [capability] };
        if (dataType) filters.dataTypes = { $in: [dataType] };

        // Execute query with pagination
        const sortOptions = {};
        sortOptions[sort] = order === 'desc' ? -1 : 1;

        const [services, total] = await Promise.all([
            Service.find(filters)
                .select('-__v')
                .sort(sortOptions)
                .limit(limit)
                .skip(offset)
                .lean(),
            Service.countDocuments(filters)
        ]);

        // Prepare response
        const response = {
            services: services.map(service => ({
                ...service,
                _id: service._id.toString()
            })),
            pagination: {
                total,
                limit,
                offset,
                pages: Math.ceil(total / limit),
                currentPage: Math.floor(offset / limit) + 1,
                hasNext: offset + limit < total,
                hasPrev: offset > 0
            },
            filters: {
                category,
                authType,
                capability,
                dataType,
                webId,
                status
            }
        };

        logger.info('Services listed', {
            count: services.length,
            total,
            filters: Object.keys(filters).filter(key => filters[key] !== undefined)
        });

        res.json(response);
    } catch (error) {
        logger.error('Error listing services:', error);
        res.status(500).json({
            error: 'internal_error',
            message: 'Failed to retrieve services',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/v1/services/:id - Get service by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const service = await Service.findOne({
            _id: id,
            deletedAt: { $exists: false }
        }).select('-__v').lean();

        if (!service) {
            return res.status(404).json({
                error: 'service_not_found',
                message: 'Service not found',
                serviceId: id,
                timestamp: new Date().toISOString()
            });
        }

        // Get recent health logs
        const healthLogs = await ServiceHealthLog.find({
            serviceId: id
        })
            .sort({ timestamp: -1 })
            .limit(5)
            .select('-__v')
            .lean();

        // Get API specifications
        const apiSpecs = await ApiSpecification.find({
            serviceId: id
        })
            .select('-__v')
            .lean();

        const response = {
            ...service,
            _id: service._id.toString(),
            healthLogs: healthLogs.map(log => ({
                ...log,
                _id: log._id.toString()
            })),
            apiSpecs: apiSpecs.map(spec => ({
                ...spec,
                _id: spec._id.toString()
            }))
        };

        logger.info('Service retrieved', { serviceId: id });
        res.json(response);
    } catch (error) {
        logger.error('Error retrieving service:', error);
        res.status(500).json({
            error: 'internal_error',
            message: 'Failed to retrieve service',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/v1/services - Register new service
router.post('/', validateRequest(serviceRegistrationSchema), async (req, res) => {
    try {
        const serviceData = req.body;

        // Check for existing service with same name or baseUrl
        const existingService = await Service.findOne({
            $or: [
                { name: serviceData.name },
                { baseUrl: serviceData.baseUrl }
            ],
            deletedAt: { $exists: false }
        });

        if (existingService) {
            const conflict = existingService.name === serviceData.name ? 'name' : 'baseUrl';
            return res.status(409).json({
                error: 'service_conflict',
                message: `Service with this ${conflict} already exists`,
                conflictField: conflict,
                existingServiceId: existingService._id.toString(),
                timestamp: new Date().toISOString()
            });
        }

        // Create new service
        const service = new Service({
            name: serviceData.name,
            displayName: serviceData.displayName,
            description: serviceData.description,
            category: serviceData.category,
            baseUrl: serviceData.baseUrl,
            healthCheckUrl: serviceData.healthCheckUrl,
            authentication: {
                type: serviceData.authenticationType,
                metadata: {
                    supportedScopes: [],
                    supportedGrantTypes: ['authorization_code'],
                    supportedResponseTypes: ['code'],
                    tokenEndpointAuthMethods: ['client_secret_post']
                }
            },
            webidSupport: {
                enabled: !!serviceData.webId,
                webidEndpoint: serviceData.webId || null
            },
            version: serviceData.version,
            capabilities: Array.isArray(serviceData.capabilities)
                ? serviceData.capabilities
                : (typeof serviceData.capabilities === 'string'
                    ? serviceData.capabilities.split(',').map(s => s.trim())
                    : []),
            dataTypes: Array.isArray(serviceData.dataTypes)
                ? serviceData.dataTypes
                : (typeof serviceData.dataTypes === 'string'
                    ? serviceData.dataTypes.split(',').map(s => s.trim())
                    : []),
            contactInfo: {
                email: serviceData.contactEmail,
                documentation: serviceData.documentation,
                support: serviceData.support
            },
            status: 'active',
            registeredAt: new Date(),
            lastUpdated: new Date()
        });

        await service.save();

        logger.info('Service registered', {
            serviceId: service._id.toString(),
            name: service.name,
            category: service.category,
            baseUrl: service.baseUrl
        });

        res.status(201).json({
            message: 'Service registered successfully',
            service: {
                _id: service._id.toString(),
                name: service.name,
                baseUrl: service.baseUrl,
                category: service.category,
                status: service.status,
                registeredAt: service.registeredAt
            }
        });
    } catch (error) {
        logger.error('Error registering service:', error);
        res.status(500).json({
            error: 'internal_error',
            message: 'Failed to register service',
            timestamp: new Date().toISOString()
        });
    }
});

// PUT /api/v1/services/:id - Update service
router.put('/:id', validateRequest(serviceUpdateSchema), async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const service = await Service.findOne({
            _id: id,
            deletedAt: { $exists: false }
        });

        if (!service) {
            return res.status(404).json({
                error: 'service_not_found',
                message: 'Service not found',
                serviceId: id,
                timestamp: new Date().toISOString()
            });
        }

        // Check for conflicts if name or baseUrl is being updated
        if (updateData.name || updateData.baseUrl) {
            const conflictQuery = {
                _id: { $ne: id },
                deletedAt: { $exists: false }
            };

            if (updateData.name) conflictQuery.name = updateData.name;
            if (updateData.baseUrl) conflictQuery.baseUrl = updateData.baseUrl;

            const existingService = await Service.findOne(conflictQuery);

            if (existingService) {
                const conflict = existingService.name === updateData.name ? 'name' : 'baseUrl';
                return res.status(409).json({
                    error: 'service_conflict',
                    message: `Service with this ${conflict} already exists`,
                    conflictField: conflict,
                    existingServiceId: existingService._id.toString(),
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Update service
        Object.assign(service, updateData);
        service.lastUpdated = new Date();
        await service.save();

        logger.info('Service updated', {
            serviceId: id,
            updatedFields: Object.keys(updateData)
        });

        res.json({
            message: 'Service updated successfully',
            service: {
                _id: service._id.toString(),
                name: service.name,
                baseUrl: service.baseUrl,
                category: service.category,
                status: service.status,
                lastUpdated: service.lastUpdated
            }
        });
    } catch (error) {
        logger.error('Error updating service:', error);
        res.status(500).json({
            error: 'internal_error',
            message: 'Failed to update service',
            timestamp: new Date().toISOString()
        });
    }
});

// DELETE /api/v1/services/:id - Delete service (soft delete)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const service = await Service.findOne({
            _id: id,
            deletedAt: { $exists: false }
        });

        if (!service) {
            return res.status(404).json({
                error: 'service_not_found',
                message: 'Service not found',
                serviceId: id,
                timestamp: new Date().toISOString()
            });
        }

        // Soft delete
        service.deletedAt = new Date();
        service.status = 'inactive';
        await service.save();

        logger.info('Service deleted', { serviceId: id, name: service.name });

        res.json({
            message: 'Service deleted successfully',
            serviceId: id,
            deletedAt: service.deletedAt
        });
    } catch (error) {
        logger.error('Error deleting service:', error);
        res.status(500).json({
            error: 'internal_error',
            message: 'Failed to delete service',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/v1/services/:id/health - Update service health status
router.post('/:id/health', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, responseTime, details } = req.body;

        // Validate health data
        const healthSchema = Joi.object({
            status: Joi.string().valid('healthy', 'degraded', 'unhealthy').required(),
            responseTime: Joi.number().positive(),
            details: Joi.object()
        });

        const { error, value } = healthSchema.validate({ status, responseTime, details });
        if (error) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid health data',
                details: error.details,
                timestamp: new Date().toISOString()
            });
        }

        const service = await Service.findOne({
            _id: id,
            deletedAt: { $exists: false }
        });

        if (!service) {
            return res.status(404).json({
                error: 'service_not_found',
                message: 'Service not found',
                serviceId: id,
                timestamp: new Date().toISOString()
            });
        }

        // Create health log entry
        const healthLog = new ServiceHealthLog({
            serviceId: id,
            status: value.status,
            responseTime: value.responseTime,
            details: value.details,
            timestamp: new Date()
        });

        await healthLog.save();

        // Update service health status
        service.lastHealthCheck = new Date();
        service.healthStatus = value.status;
        await service.save();

        logger.info('Service health updated', {
            serviceId: id,
            status: value.status,
            responseTime: value.responseTime
        });

        res.json({
            message: 'Health status updated successfully',
            serviceId: id,
            status: value.status,
            timestamp: healthLog.timestamp
        });
    } catch (error) {
        logger.error('Error updating service health:', error);
        res.status(500).json({
            error: 'internal_error',
            message: 'Failed to update health status',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
