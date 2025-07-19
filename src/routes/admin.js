/**
 * Admin Router for API Registry - PDS 2.2
 * 
 * Administrative functions for service management, system monitoring,
 * and maintenance operations.
 */

const express = require('express');
const Joi = require('joi');
const winston = require('winston');
const { Service, ApiSpecification, ServiceHealthLog } = require('../database/models');
const { database } = require('../database/connection');

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

// Simple admin authentication middleware
// TODO: Replace with proper RBAC in production
const requireAdmin = (req, res, next) => {
    const adminKey = req.headers['x-admin-key'] || req.query.adminKey;

    if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
        return res.status(401).json({
            error: 'unauthorized',
            message: 'Admin access required',
            timestamp: new Date().toISOString()
        });
    }

    next();
};

// Validation schemas
const bulkOperationSchema = Joi.object({
    operation: Joi.string().valid('activate', 'deactivate', 'delete', 'health-check').required(),
    serviceIds: Joi.array().items(Joi.string()).min(1).max(50).required(),
    reason: Joi.string().max(200),
    notify: Joi.boolean().default(false)
});

const maintenanceSchema = Joi.object({
    type: Joi.string().valid('cleanup', 'reindex', 'migrate', 'backup').required(),
    options: Joi.object({
        dryRun: Joi.boolean().default(true),
        batchSize: Joi.number().integer().min(1).max(1000).default(100),
        olderThanDays: Joi.number().integer().min(1).max(365),
        targetCollection: Joi.string().valid('services', 'health-logs', 'api-specs')
    })
});

// GET /api/v1/admin/system/status - System status and statistics
router.get('/system/status', requireAdmin, async (req, res) => {
    try {
        // Database health
        const dbHealth = await database.healthCheck();

        // Service statistics
        const serviceStats = await Service.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: 1 },
                    active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
                    inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
                    healthy: { $sum: { $cond: [{ $eq: ['$healthStatus', 'healthy'] }, 1, 0] } },
                    unhealthy: { $sum: { $cond: [{ $eq: ['$healthStatus', 'unhealthy'] }, 1, 0] } },
                    withWebId: { $sum: { $cond: [{ $ne: ['$webId', null] }, 1, 0] } },
                    deleted: { $sum: { $cond: [{ $ne: ['$deletedAt', null] }, 1, 0] } }
                }
            }
        ]);

        // Category distribution
        const categoryStats = await Service.aggregate([
            { $match: { deletedAt: { $exists: false } } },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    activeCount: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Health log statistics
        const healthLogStats = await ServiceHealthLog.aggregate([
            {
                $group: {
                    _id: null,
                    totalLogs: { $sum: 1 },
                    avgResponseTime: { $avg: '$responseTime' },
                    recentLogs: {
                        $sum: {
                            $cond: [
                                { $gte: ['$timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000)] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        // API specification statistics
        const apiSpecStats = await ApiSpecification.aggregate([
            {
                $group: {
                    _id: null,
                    totalSpecs: { $sum: 1 },
                    openApiCount: { $sum: { $cond: [{ $eq: ['$format', 'openapi'] }, 1, 0] } },
                    validSpecs: { $sum: { $cond: [{ $eq: ['$isValid', true] }, 1, 0] } }
                }
            }
        ]);

        // System information
        const systemInfo = {
            version: process.env.SERVICE_VERSION || '2.2.0',
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            nodeVersion: process.version,
            timestamp: new Date().toISOString()
        };

        const status = {
            system: systemInfo,
            database: dbHealth,
            services: serviceStats[0] || {
                total: 0, active: 0, inactive: 0, healthy: 0, unhealthy: 0, withWebId: 0, deleted: 0
            },
            categories: categoryStats,
            healthLogs: healthLogStats[0] || { totalLogs: 0, avgResponseTime: 0, recentLogs: 0 },
            apiSpecs: apiSpecStats[0] || { totalSpecs: 0, openApiCount: 0, validSpecs: 0 }
        };

        logger.info('System status requested', { admin: true });

        res.json(status);
    } catch (error) {
        logger.error('Error getting system status:', error);
        res.status(500).json({
            error: 'system_error',
            message: 'Failed to retrieve system status',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/v1/admin/services/bulk - Bulk operations on services
router.post('/services/bulk', requireAdmin, async (req, res) => {
    try {
        const { error, value } = bulkOperationSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid bulk operation request',
                details: error.details,
                timestamp: new Date().toISOString()
            });
        }

        const { operation, serviceIds, reason, notify } = value;

        // Verify services exist
        const services = await Service.find({
            _id: { $in: serviceIds },
            deletedAt: { $exists: false }
        });

        if (services.length !== serviceIds.length) {
            const foundIds = services.map(s => s._id.toString());
            const missingIds = serviceIds.filter(id => !foundIds.includes(id));

            return res.status(404).json({
                error: 'services_not_found',
                message: 'Some services not found',
                missingIds,
                timestamp: new Date().toISOString()
            });
        }

        const results = [];

        // Execute bulk operation
        for (const service of services) {
            try {
                let updated = false;
                const result = {
                    serviceId: service._id.toString(),
                    name: service.name,
                    operation,
                    success: false,
                    message: ''
                };

                switch (operation) {
                    case 'activate':
                        if (service.status !== 'active') {
                            service.status = 'active';
                            service.lastUpdated = new Date();
                            updated = true;
                            result.message = 'Service activated';
                        } else {
                            result.message = 'Service already active';
                        }
                        break;

                    case 'deactivate':
                        if (service.status !== 'inactive') {
                            service.status = 'inactive';
                            service.lastUpdated = new Date();
                            updated = true;
                            result.message = 'Service deactivated';
                        } else {
                            result.message = 'Service already inactive';
                        }
                        break;

                    case 'delete':
                        if (!service.deletedAt) {
                            service.deletedAt = new Date();
                            service.status = 'inactive';
                            updated = true;
                            result.message = 'Service deleted (soft delete)';
                        } else {
                            result.message = 'Service already deleted';
                        }
                        break;

                    case 'health-check':
                        // TODO: Implement actual health check ping
                        service.lastHealthCheck = new Date();
                        service.healthStatus = 'unknown'; // Would be set by actual health check
                        updated = true;
                        result.message = 'Health check initiated';
                        break;
                }

                if (updated) {
                    await service.save();
                }

                result.success = true;
                results.push(result);

            } catch (serviceError) {
                results.push({
                    serviceId: service._id.toString(),
                    name: service.name,
                    operation,
                    success: false,
                    message: `Error: ${serviceError.message}`
                });
            }
        }

        const successCount = results.filter(r => r.success).length;

        logger.info('Bulk operation completed', {
            operation,
            total: serviceIds.length,
            successful: successCount,
            failed: serviceIds.length - successCount,
            reason
        });

        res.json({
            operation,
            total: serviceIds.length,
            successful: successCount,
            failed: serviceIds.length - successCount,
            results,
            reason,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error in bulk operation:', error);
        res.status(500).json({
            error: 'bulk_operation_error',
            message: 'Failed to execute bulk operation',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/v1/admin/maintenance - Execute maintenance operations
router.post('/maintenance', requireAdmin, async (req, res) => {
    try {
        const { error, value } = maintenanceSchema.validate(req.body);
        if (error) {
            return res.status(400).json({
                error: 'validation_error',
                message: 'Invalid maintenance request',
                details: error.details,
                timestamp: new Date().toISOString()
            });
        }

        const { type, options } = value;
        const { dryRun, batchSize, olderThanDays, targetCollection } = options;

        let result = {};

        switch (type) {
            case 'cleanup':
                result = await performCleanup(targetCollection, olderThanDays, dryRun, batchSize);
                break;

            case 'reindex':
                result = await performReindex(targetCollection, dryRun);
                break;

            case 'migrate':
                result = await performMigration(dryRun);
                break;

            case 'backup':
                result = await performBackup(targetCollection, dryRun);
                break;

            default:
                throw new Error(`Unknown maintenance type: ${type}`);
        }

        logger.info('Maintenance operation completed', {
            type,
            options,
            success: result.success
        });

        res.json({
            maintenanceType: type,
            options,
            result,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Error in maintenance operation:', error);
        res.status(500).json({
            error: 'maintenance_error',
            message: `Failed to execute maintenance: ${error.message}`,
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/v1/admin/logs - Get recent system logs
router.get('/logs', requireAdmin, async (req, res) => {
    try {
        const { level = 'info', limit = 100, since } = req.query;

        // TODO: Implement proper log aggregation
        // This is a placeholder for log retrieval functionality
        const logs = {
            message: 'Log retrieval not yet implemented',
            placeholder: true,
            parameters: { level, limit, since }
        };

        res.json({
            logs,
            metadata: {
                level,
                limit: parseInt(limit),
                since,
                timestamp: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Error retrieving logs:', error);
        res.status(500).json({
            error: 'log_retrieval_error',
            message: 'Failed to retrieve logs',
            timestamp: new Date().toISOString()
        });
    }
});

// Maintenance operation implementations
async function performCleanup(targetCollection, olderThanDays, dryRun, batchSize) {
    const cutoffDate = new Date(Date.now() - (olderThanDays || 30) * 24 * 60 * 60 * 1000);

    if (!targetCollection || targetCollection === 'health-logs') {
        const query = { timestamp: { $lt: cutoffDate } };

        if (dryRun) {
            const count = await ServiceHealthLog.countDocuments(query);
            return {
                success: true,
                type: 'cleanup',
                dryRun: true,
                message: `Would delete ${count} health logs older than ${olderThanDays} days`
            };
        } else {
            const result = await ServiceHealthLog.deleteMany(query);
            return {
                success: true,
                type: 'cleanup',
                dryRun: false,
                deletedCount: result.deletedCount,
                message: `Deleted ${result.deletedCount} old health logs`
            };
        }
    }

    return {
        success: false,
        message: 'Invalid or unsupported target collection for cleanup'
    };
}

async function performReindex(targetCollection, dryRun) {
    // TODO: Implement database reindexing
    return {
        success: true,
        type: 'reindex',
        dryRun,
        message: 'Reindexing not yet implemented'
    };
}

async function performMigration(dryRun) {
    // TODO: Implement data migration utilities
    return {
        success: true,
        type: 'migrate',
        dryRun,
        message: 'Migration utilities not yet implemented'
    };
}

async function performBackup(targetCollection, dryRun) {
    // TODO: Implement backup functionality
    return {
        success: true,
        type: 'backup',
        dryRun,
        message: 'Backup functionality not yet implemented'
    };
}

module.exports = router;
