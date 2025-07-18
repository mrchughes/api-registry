// Update service details (fields other than status)
const winston = require('winston');
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

exports.updateServiceDetails = async (serviceName, updates) => {
    logger.info(`[serviceService] updateServiceDetails called for serviceName: '${serviceName}'`);
    const filePath = getServiceFilePath(serviceName);
    logger.info(`[serviceService] Resolved filePath: ${filePath}`);
    const service = await exports.getService(serviceName);
    if (!service) {
        logger.warn(`[serviceService] No service found at: ${filePath}`);
        return null;
    }

    // Only update allowed fields
    const allowedFields = ['description', 'baseUrl', 'healthCheckUrl', 'status', 'owner', 'documentation'];
    for (const key of allowedFields) {
        if (updates[key] !== undefined) {
            service[key] = updates[key];
        }
    }
    service.updatedAt = new Date().toISOString();

    fs.writeFileSync(filePath, JSON.stringify(service, null, 2));

    return service;
};
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const SERVICES_DIR = path.join(__dirname, '../../storage/services');

// Ensure services directory exists
if (!fs.existsSync(SERVICES_DIR)) {
    fs.mkdirSync(SERVICES_DIR, { recursive: true });
}

// Helper to get service file path
function getServiceFilePath(serviceName) {
    return path.join(SERVICES_DIR, `${serviceName}.json`);
}

// Save service (register or update)
exports.saveService = async (serviceData) => {
    const { name } = serviceData;

    // Check if service already exists
    const existingService = await exports.getService(name);
    if (existingService) {
        const error = new Error(`Service '${name}' already exists`);
        error.code = 'service/already-exists';
        throw error;
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    const serviceDetails = {
        id,
        name,
        description: serviceData.description || '',
        baseUrl: serviceData.baseUrl,
        healthCheckUrl: serviceData.healthCheckUrl || '',
        status: serviceData.status || 'active',
        owner: serviceData.owner || '',
        documentation: serviceData.documentation || '',
        createdAt: now,
        updatedAt: now
    };

    const filePath = getServiceFilePath(name);
    fs.writeFileSync(filePath, JSON.stringify(serviceDetails, null, 2));

    return serviceDetails;
};

// Get service by name
exports.getService = async (serviceName) => {
    const filePath = getServiceFilePath(serviceName);
    if (!fs.existsSync(filePath)) return null;

    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

// List all services with optional filters
exports.listServices = async (filters = {}) => {
    if (!fs.existsSync(SERVICES_DIR)) return [];

    const files = fs.readdirSync(SERVICES_DIR)
        .filter(f => f.endsWith('.json'));

    // Winston logger at the top
    const winston = require('winston');
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

    // Top-level debug log to confirm file load
    logger.info('[serviceService] serviceService.js loaded');

    // Update service details (fields other than status)
    const services = files.map(file => {
        const filePath = path.join(SERVICES_DIR, file);
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    });

    // Apply filters
    return services.filter(service => {
        // Filter by status if specified
        if (filters.status && service.status !== filters.status) {
            return false;
        }

        // Filter by owner if specified
        if (filters.owner && service.owner !== filters.owner) {
            return false;
        }

        return true;
    });
};

// Update service status
exports.updateServiceDetails = async (serviceName, updates) => {
    const filePath = getServiceFilePath(serviceName);
    const service = await exports.getService(serviceName);
    if (!service) {
        logger.warn(`[serviceService] No service found at: ${filePath}`);
        return null;
    }

    // Only update allowed fields
    const allowedFields = ['description', 'baseUrl', 'healthCheckUrl', 'status', 'owner', 'documentation'];
    for (const key of allowedFields) {
        if (updates[key] !== undefined) {
            service[key] = updates[key];
        }
    }
    service.updatedAt = new Date().toISOString();

    fs.writeFileSync(filePath, JSON.stringify(service, null, 2));

    return service;
};
