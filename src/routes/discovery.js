/**
 * Discovery Router for API Registry - PDS 2.2
 * 
 * Enhanced service discovery with WebID-centric lookup,
 * capability-based discovery, and intelligent matching.
 */

const express = require('express');
const Joi = require('joi');
const winston = require('winston');
const { Service, ApiSpecification } = require('../database/models');

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
const webIdDiscoverySchema = Joi.object({
    webId: Joi.string().uri().required()
        .description('WebID to discover services for'),

    serviceTypes: Joi.array().items(
        Joi.string().valid('data-store', 'identity-provider', 'application', 'utility', 'integration')
    ).description('Filter by service types'),

    capabilities: Joi.array().items(Joi.string())
        .description('Required capabilities'),

    authPreference: Joi.string().valid('solid-oidc', 'did-challenge', 'api-key', 'bearer-token')
        .description('Preferred authentication method'),

    includeInactive: Joi.boolean().default(false)
        .description('Include inactive services in results')
});

const capabilityDiscoverySchema = Joi.object({
    capabilities: Joi.array().items(Joi.string()).min(1).required()
        .description('Required capabilities'),

    dataTypes: Joi.array().items(Joi.string())
        .description('Required data types'),

    authTypes: Joi.array().items(
        Joi.string().valid('solid-oidc', 'did-challenge', 'api-key', 'bearer-token', 'none')
    ).description('Acceptable authentication types'),

    category: Joi.string().valid('data-store', 'identity-provider', 'application', 'utility', 'integration')
        .description('Service category filter'),

    proximity: Joi.object({
        baseUrl: Joi.string().uri().required(),
        radius: Joi.number().positive().default(1000)
    }).description('Geographic proximity filter (if supported)'),

    performance: Joi.object({
        maxResponseTime: Joi.number().positive(),
        minUptime: Joi.number().min(0).max(100).default(95)
    }).description('Performance requirements'),

    limit: Joi.number().integer().min(1).max(50).default(10)
});

const healthDiscoverySchema = Joi.object({
    category: Joi.string().valid('data-store', 'identity-provider', 'application', 'utility', 'integration'),
    status: Joi.string().valid('healthy', 'degraded', 'unhealthy').default('healthy'),
    includeMetrics: Joi.boolean().default(false)
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
                message: 'Discovery request validation failed',
                details: errors,
                timestamp: new Date().toISOString()
            });
        }

        req[source] = value;
        next();
    };
};

// POST /api/v1/discovery/webid - WebID-based service discovery
router.post('/webid', validateRequest(webIdDiscoverySchema), async (req, res) => {
    try {
        const {
            webId,
            serviceTypes,
            capabilities,
            authPreference,
            includeInactive
        } = req.body;

        // Build discovery query
        const query = {
            deletedAt: { $exists: false }
        };

        // Add status filter
        if (!includeInactive) {
            query.status = 'active';
            query.healthStatus = { $ne: 'unhealthy' };
        }

        // Add service type filter
        if (serviceTypes && serviceTypes.length > 0) {
            query.category = { $in: serviceTypes };
        }

        // Add capability filter
        if (capabilities && capabilities.length > 0) {
            query.capabilities = { $all: capabilities };
        }

        // Add auth preference filter
        if (authPreference) {
            query.authenticationTypes = { $in: [authPreference] };
        }

        // Execute discovery query
        const services = await Service.find(query)
            .select('-__v -deletedAt')
            .lean();

        // Score and rank services for WebID compatibility
        const scoredServices = services.map(service => {
            let score = 0;
            let reasons = [];

            // Base score for active services
            if (service.status === 'active') {
                score += 10;
                reasons.push('Active service');
            }

            // WebID compatibility scoring
            if (service.webId) {
                score += 20;
                reasons.push('WebID-enabled');

                // Bonus for matching WebID domain
                try {
                    const serviceWebIdDomain = new URL(service.webId).hostname;
                    const queryWebIdDomain = new URL(webId).hostname;
                    if (serviceWebIdDomain === queryWebIdDomain) {
                        score += 15;
                        reasons.push('Same domain as WebID');
                    }
                } catch (error) {
                    // Invalid URLs, skip domain matching
                }
            }

            // Authentication compatibility
            if (authPreference && service.authenticationTypes.includes(authPreference)) {
                score += 15;
                reasons.push(`Supports preferred auth: ${authPreference}`);
            }

            // Solid-OIDC preference bonus (PDS 2.2 standard)
            if (service.authenticationTypes.includes('solid-oidc')) {
                score += 10;
                reasons.push('Solid-OIDC compatible');
            }

            // Health status bonus
            if (service.healthStatus === 'healthy') {
                score += 5;
                reasons.push('Healthy status');
            }

            // Capability match bonus
            if (capabilities) {
                const matchedCapabilities = capabilities.filter(cap =>
                    service.capabilities && service.capabilities.includes(cap)
                );
                score += matchedCapabilities.length * 5;
                if (matchedCapabilities.length > 0) {
                    reasons.push(`Capabilities: ${matchedCapabilities.join(', ')}`);
                }
            }

            return {
                ...service,
                _id: service._id.toString(),
                discoveryScore: score,
                compatibilityReasons: reasons,
                webIdCompatible: !!service.webId
            };
        });

        // Sort by discovery score (highest first)
        scoredServices.sort((a, b) => b.discoveryScore - a.discoveryScore);

        logger.info('WebID discovery completed', {
            webId,
            servicesFound: scoredServices.length,
            filters: { serviceTypes, capabilities, authPreference }
        });

        res.json({
            webId,
            discoveryType: 'webid-based',
            servicesFound: scoredServices.length,
            services: scoredServices,
            metadata: {
                searchCriteria: {
                    webId,
                    serviceTypes,
                    capabilities,
                    authPreference,
                    includeInactive
                },
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Error in WebID discovery:', error);
        res.status(500).json({
            error: 'discovery_error',
            message: 'Failed to perform WebID-based discovery',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/v1/discovery/capabilities - Capability-based service discovery
router.post('/capabilities', validateRequest(capabilityDiscoverySchema), async (req, res) => {
    try {
        const {
            capabilities,
            dataTypes,
            authTypes,
            category,
            performance,
            limit
        } = req.body;

        // Build discovery query
        const query = {
            deletedAt: { $exists: false },
            status: 'active',
            capabilities: { $all: capabilities }
        };

        // Add optional filters
        if (dataTypes && dataTypes.length > 0) {
            query.dataTypes = { $in: dataTypes };
        }

        if (authTypes && authTypes.length > 0) {
            query.authenticationTypes = { $in: authTypes };
        }

        if (category) {
            query.category = category;
        }

        // Execute discovery query
        let services = await Service.find(query)
            .select('-__v -deletedAt')
            .lean();

        // Apply performance filtering if specified
        if (performance) {
            // TODO: Implement performance-based filtering
            // This would require aggregating health logs and calculating metrics
            logger.info('Performance filtering requested but not yet implemented', performance);
        }

        // Score services based on capability match quality
        const scoredServices = services.map(service => {
            let score = 0;
            let reasons = [];

            // Base score
            score += 10;

            // Capability matching score
            const serviceCapabilities = service.capabilities || [];
            const matchedCapabilities = capabilities.filter(cap => serviceCapabilities.includes(cap));
            const matchRatio = matchedCapabilities.length / capabilities.length;
            score += matchRatio * 20;
            reasons.push(`Capability match: ${(matchRatio * 100).toFixed(0)}%`);

            // Bonus for additional capabilities
            const extraCapabilities = serviceCapabilities.length - matchedCapabilities.length;
            if (extraCapabilities > 0) {
                score += Math.min(extraCapabilities * 2, 10);
                reasons.push(`${extraCapabilities} additional capabilities`);
            }

            // Data type compatibility
            if (dataTypes && service.dataTypes) {
                const matchedDataTypes = dataTypes.filter(dt => service.dataTypes.includes(dt));
                if (matchedDataTypes.length > 0) {
                    score += matchedDataTypes.length * 3;
                    reasons.push(`Data types: ${matchedDataTypes.join(', ')}`);
                }
            }

            // Authentication compatibility
            if (authTypes && service.authenticationTypes) {
                const compatibleAuthTypes = authTypes.filter(at => service.authenticationTypes.includes(at));
                if (compatibleAuthTypes.length > 0) {
                    score += compatibleAuthTypes.length * 2;
                    reasons.push(`Auth methods: ${compatibleAuthTypes.join(', ')}`);
                }
            }

            // Health status bonus
            if (service.healthStatus === 'healthy') {
                score += 5;
                reasons.push('Healthy');
            }

            return {
                ...service,
                _id: service._id.toString(),
                capabilityScore: score,
                matchReasons: reasons,
                capabilityMatch: {
                    required: capabilities,
                    provided: serviceCapabilities,
                    matched: matchedCapabilities,
                    matchRatio
                }
            };
        });

        // Sort by capability score and limit results
        scoredServices.sort((a, b) => b.capabilityScore - a.capabilityScore);
        const limitedServices = scoredServices.slice(0, limit);

        logger.info('Capability discovery completed', {
            capabilities,
            servicesFound: limitedServices.length,
            totalMatches: scoredServices.length
        });

        res.json({
            discoveryType: 'capability-based',
            servicesFound: limitedServices.length,
            totalMatches: scoredServices.length,
            services: limitedServices,
            metadata: {
                searchCriteria: {
                    capabilities,
                    dataTypes,
                    authTypes,
                    category,
                    performance
                },
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Error in capability discovery:', error);
        res.status(500).json({
            error: 'discovery_error',
            message: 'Failed to perform capability-based discovery',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/v1/discovery/health - Service health discovery
router.get('/health', validateRequest(healthDiscoverySchema, 'query'), async (req, res) => {
    try {
        const { category, status, includeMetrics } = req.query;

        // Build health query
        const query = {
            deletedAt: { $exists: false },
            status: 'active'
        };

        if (category) {
            query.category = category;
        }

        if (status) {
            query.healthStatus = status;
        }

        // Get services with health information
        const services = await Service.find(query)
            .select('-__v -deletedAt')
            .lean();

        // Enhance with health metrics if requested
        const healthData = await Promise.all(services.map(async (service) => {
            const baseHealth = {
                _id: service._id.toString(),
                name: service.name,
                category: service.category,
                baseUrl: service.baseUrl,
                healthStatus: service.healthStatus || 'unknown',
                lastHealthCheck: service.lastHealthCheck
            };

            if (includeMetrics) {
                // TODO: Aggregate health metrics from ServiceHealthLog
                // This would include uptime, response times, error rates, etc.
                baseHealth.metrics = {
                    uptime: 99.5,
                    averageResponseTime: 150,
                    errorRate: 0.1,
                    lastIncident: null
                };
            }

            return baseHealth;
        }));

        // Group by category for summary
        const categoryGroups = healthData.reduce((groups, service) => {
            const cat = service.category;
            if (!groups[cat]) {
                groups[cat] = {
                    category: cat,
                    services: [],
                    healthSummary: {
                        healthy: 0,
                        degraded: 0,
                        unhealthy: 0,
                        unknown: 0
                    }
                };
            }

            groups[cat].services.push(service);
            groups[cat].healthSummary[service.healthStatus]++;

            return groups;
        }, {});

        logger.info('Health discovery completed', {
            category,
            status,
            servicesFound: healthData.length
        });

        res.json({
            discoveryType: 'health-based',
            servicesFound: healthData.length,
            services: healthData,
            summary: {
                byCategory: Object.values(categoryGroups),
                overall: {
                    total: healthData.length,
                    healthy: healthData.filter(s => s.healthStatus === 'healthy').length,
                    degraded: healthData.filter(s => s.healthStatus === 'degraded').length,
                    unhealthy: healthData.filter(s => s.healthStatus === 'unhealthy').length,
                    unknown: healthData.filter(s => s.healthStatus === 'unknown').length
                }
            },
            metadata: {
                searchCriteria: { category, status, includeMetrics },
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Error in health discovery:', error);
        res.status(500).json({
            error: 'discovery_error',
            message: 'Failed to perform health discovery',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/v1/discovery/categories - Get service categories with counts
router.get('/categories', async (req, res) => {
    try {
        const pipeline = [
            { $match: { deletedAt: { $exists: false }, status: 'active' } },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    healthyCount: {
                        $sum: { $cond: [{ $eq: ['$healthStatus', 'healthy'] }, 1, 0] }
                    },
                    authTypes: { $addToSet: '$authenticationTypes' },
                    capabilities: { $addToSet: '$capabilities' }
                }
            },
            {
                $project: {
                    category: '$_id',
                    count: 1,
                    healthyCount: 1,
                    healthyPercentage: {
                        $round: [{ $multiply: [{ $divide: ['$healthyCount', '$count'] }, 100] }, 1]
                    },
                    uniqueAuthTypes: {
                        $reduce: {
                            input: '$authTypes',
                            initialValue: [],
                            in: { $setUnion: ['$$value', '$$this'] }
                        }
                    },
                    uniqueCapabilities: {
                        $reduce: {
                            input: '$capabilities',
                            initialValue: [],
                            in: { $setUnion: ['$$value', '$$this'] }
                        }
                    },
                    _id: 0
                }
            },
            { $sort: { count: -1 } }
        ];

        const categories = await Service.aggregate(pipeline);

        logger.info('Categories discovery completed', {
            categoriesFound: categories.length
        });

        res.json({
            discoveryType: 'categories',
            categories,
            metadata: {
                totalCategories: categories.length,
                totalServices: categories.reduce((sum, cat) => sum + cat.count, 0),
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Error in categories discovery:', error);
        res.status(500).json({
            error: 'discovery_error',
            message: 'Failed to retrieve categories',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
