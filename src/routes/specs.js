/**
 * Specs Router for API Registry - PDS 2.2
 * 
 * Enhanced API specification management with OpenAPI validation,
 * versioning, and integration with service discovery.
 */

const express = require('express');
const Joi = require('joi');
const winston = require('winston');
const multer = require('multer');
const YAML = require('yaml');
const { ApiSpecification, Service } = require('../database/models');

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

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Accept JSON and YAML files
        if (file.mimetype === 'application/json' ||
            file.mimetype === 'text/yaml' ||
            file.mimetype === 'application/x-yaml' ||
            file.originalname.endsWith('.json') ||
            file.originalname.endsWith('.yaml') ||
            file.originalname.endsWith('.yml')) {
            cb(null, true);
        } else {
            cb(new Error('Only JSON and YAML files are allowed'), false);
        }
    }
});

// Validation schemas
const specUploadSchema = Joi.object({
    serviceId: Joi.string().required()
        .description('Service ID this specification belongs to'),

    version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required()
        .description('Semantic version of the API specification'),

    format: Joi.string().valid('openapi', 'swagger', 'json-schema').default('openapi')
        .description('Specification format'),

    title: Joi.string().max(200)
        .description('Title of the API specification'),

    description: Joi.string().max(1000)
        .description('Description of the API specification'),

    isPublic: Joi.boolean().default(true)
        .description('Whether the specification is publicly accessible'),

    metadata: Joi.object()
        .description('Additional metadata for the specification')
});

const specQuerySchema = Joi.object({
    serviceId: Joi.string(),
    format: Joi.string().valid('openapi', 'swagger', 'json-schema'),
    version: Joi.string(),
    isPublic: Joi.boolean(),
    limit: Joi.number().integer().min(1).max(100).default(20),
    offset: Joi.number().integer().min(0).default(0),
    sort: Joi.string().valid('version', 'uploadedAt', 'title').default('uploadedAt'),
    order: Joi.string().valid('asc', 'desc').default('desc')
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

// Helper function to validate OpenAPI specification
const validateOpenApiSpec = (spec) => {
    try {
        // Basic OpenAPI 3.x validation
        if (!spec.openapi || !spec.openapi.startsWith('3.')) {
            return { isValid: false, errors: ['Must be OpenAPI 3.x specification'] };
        }

        if (!spec.info || !spec.info.title || !spec.info.version) {
            return { isValid: false, errors: ['Missing required info section with title and version'] };
        }

        if (!spec.paths || Object.keys(spec.paths).length === 0) {
            return { isValid: false, errors: ['Must contain at least one path'] };
        }

        return { isValid: true, errors: [] };
    } catch (error) {
        return { isValid: false, errors: [`Validation error: ${error.message}`] };
    }
};

// Helper function to parse specification file
const parseSpecificationFile = (buffer, filename) => {
    try {
        const content = buffer.toString('utf8');

        if (filename.endsWith('.json')) {
            return JSON.parse(content);
        } else if (filename.endsWith('.yaml') || filename.endsWith('.yml')) {
            return YAML.parse(content);
        } else {
            // Try to parse as JSON first, then YAML
            try {
                return JSON.parse(content);
            } catch {
                return YAML.parse(content);
            }
        }
    } catch (error) {
        throw new Error(`Failed to parse specification file: ${error.message}`);
    }
};

// GET /api/v1/specs - List API specifications
router.get('/', validateRequest(specQuerySchema, 'query'), async (req, res) => {
    try {
        const {
            serviceId,
            format,
            version,
            isPublic,
            limit,
            offset,
            sort,
            order
        } = req.query;

        // Build query filters
        const filters = {};

        if (serviceId) filters.serviceId = serviceId;
        if (format) filters.format = format;
        if (version) filters.version = version;
        if (isPublic !== undefined) filters.isPublic = isPublic;

        // Execute query with pagination
        const sortOptions = {};
        sortOptions[sort] = order === 'desc' ? -1 : 1;

        const [specs, total] = await Promise.all([
            ApiSpecification.find(filters)
                .select('-specification -__v') // Exclude large specification content
                .sort(sortOptions)
                .limit(limit)
                .skip(offset)
                .populate('serviceId', 'name category baseUrl')
                .lean(),
            ApiSpecification.countDocuments(filters)
        ]);

        // Prepare response
        const response = {
            specifications: specs.map(spec => ({
                ...spec,
                _id: spec._id.toString(),
                serviceId: spec.serviceId._id.toString(),
                serviceName: spec.serviceId.name,
                serviceCategory: spec.serviceId.category,
                serviceBaseUrl: spec.serviceId.baseUrl
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
                serviceId,
                format,
                version,
                isPublic
            }
        };

        logger.info('API specifications listed', {
            count: specs.length,
            total,
            filters: Object.keys(filters).filter(key => filters[key] !== undefined)
        });

        res.json(response);
    } catch (error) {
        logger.error('Error listing API specifications:', error);
        res.status(500).json({
            error: 'internal_error',
            message: 'Failed to retrieve API specifications',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/v1/specs/:id - Get specification by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { includeSpec = false } = req.query;

        const selectFields = includeSpec ? '' : '-specification';

        const spec = await ApiSpecification.findById(id)
            .select(selectFields + ' -__v')
            .populate('serviceId', 'name category baseUrl status')
            .lean();

        if (!spec) {
            return res.status(404).json({
                error: 'specification_not_found',
                message: 'API specification not found',
                specificationId: id,
                timestamp: new Date().toISOString()
            });
        }

        // Check if specification is public or user has access
        if (!spec.isPublic) {
            // TODO: Implement proper authorization
            return res.status(403).json({
                error: 'access_denied',
                message: 'Access to this specification is restricted',
                timestamp: new Date().toISOString()
            });
        }

        const response = {
            ...spec,
            _id: spec._id.toString(),
            serviceId: spec.serviceId._id.toString(),
            serviceName: spec.serviceId.name,
            serviceCategory: spec.serviceId.category,
            serviceBaseUrl: spec.serviceId.baseUrl,
            serviceStatus: spec.serviceId.status
        };

        logger.info('API specification retrieved', {
            specificationId: id,
            includeSpec: !!includeSpec
        });

        res.json(response);
    } catch (error) {
        logger.error('Error retrieving API specification:', error);
        res.status(500).json({
            error: 'internal_error',
            message: 'Failed to retrieve API specification',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /api/v1/specs - Upload new API specification
router.post('/', upload.single('specification'), validateRequest(specUploadSchema), async (req, res) => {
    try {
        const specData = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                error: 'file_required',
                message: 'Specification file is required',
                timestamp: new Date().toISOString()
            });
        }

        // Verify service exists
        const service = await Service.findOne({
            _id: specData.serviceId,
            deletedAt: { $exists: false }
        });

        if (!service) {
            return res.status(404).json({
                error: 'service_not_found',
                message: 'Service not found',
                serviceId: specData.serviceId,
                timestamp: new Date().toISOString()
            });
        }

        // Check for existing specification with same version
        const existingSpec = await ApiSpecification.findOne({
            serviceId: specData.serviceId,
            version: specData.version
        });

        if (existingSpec) {
            return res.status(409).json({
                error: 'specification_conflict',
                message: 'Specification with this version already exists for this service',
                existingSpecId: existingSpec._id.toString(),
                timestamp: new Date().toISOString()
            });
        }

        // Parse specification file
        let parsedSpec;
        try {
            parsedSpec = parseSpecificationFile(file.buffer, file.originalname);
        } catch (parseError) {
            return res.status(400).json({
                error: 'parse_error',
                message: parseError.message,
                timestamp: new Date().toISOString()
            });
        }

        // Validate specification if it's OpenAPI
        let validationResult = { isValid: true, errors: [] };
        if (specData.format === 'openapi') {
            validationResult = validateOpenApiSpec(parsedSpec);
        }

        // Extract metadata from specification
        const extractedMetadata = {
            title: parsedSpec.info?.title || specData.title,
            description: parsedSpec.info?.description || specData.description,
            specVersion: parsedSpec.info?.version,
            servers: parsedSpec.servers || [],
            tags: parsedSpec.tags || [],
            pathCount: parsedSpec.paths ? Object.keys(parsedSpec.paths).length : 0,
            componentCount: parsedSpec.components ? Object.keys(parsedSpec.components).length : 0
        };

        // Create new API specification
        const apiSpec = new ApiSpecification({
            serviceId: specData.serviceId,
            version: specData.version,
            format: specData.format,
            title: extractedMetadata.title,
            description: extractedMetadata.description,
            specification: parsedSpec,
            isPublic: specData.isPublic,
            isValid: validationResult.isValid,
            validationErrors: validationResult.errors,
            metadata: {
                ...extractedMetadata,
                ...specData.metadata,
                fileInfo: {
                    originalName: file.originalname,
                    size: file.size,
                    mimetype: file.mimetype
                }
            },
            uploadedAt: new Date()
        });

        await apiSpec.save();

        logger.info('API specification uploaded', {
            specificationId: apiSpec._id.toString(),
            serviceId: specData.serviceId,
            version: specData.version,
            format: specData.format,
            isValid: validationResult.isValid
        });

        res.status(201).json({
            message: 'API specification uploaded successfully',
            specification: {
                _id: apiSpec._id.toString(),
                serviceId: apiSpec.serviceId,
                version: apiSpec.version,
                format: apiSpec.format,
                title: apiSpec.title,
                isValid: apiSpec.isValid,
                validationErrors: apiSpec.validationErrors,
                uploadedAt: apiSpec.uploadedAt
            }
        });
    } catch (error) {
        logger.error('Error uploading API specification:', error);
        res.status(500).json({
            error: 'internal_error',
            message: 'Failed to upload API specification',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /api/v1/specs/:id/raw - Get raw specification content
router.get('/:id/raw', async (req, res) => {
    try {
        const { id } = req.params;
        const { format = 'json' } = req.query;

        const spec = await ApiSpecification.findById(id)
            .select('specification isPublic format title version')
            .lean();

        if (!spec) {
            return res.status(404).json({
                error: 'specification_not_found',
                message: 'API specification not found',
                timestamp: new Date().toISOString()
            });
        }

        if (!spec.isPublic) {
            return res.status(403).json({
                error: 'access_denied',
                message: 'Access to this specification is restricted',
                timestamp: new Date().toISOString()
            });
        }

        // Set appropriate content type and return specification
        if (format === 'yaml') {
            res.set('Content-Type', 'application/x-yaml');
            res.send(YAML.stringify(spec.specification));
        } else {
            res.set('Content-Type', 'application/json');
            res.json(spec.specification);
        }

        logger.info('Raw specification served', {
            specificationId: id,
            format
        });
    } catch (error) {
        logger.error('Error serving raw specification:', error);
        res.status(500).json({
            error: 'internal_error',
            message: 'Failed to serve specification',
            timestamp: new Date().toISOString()
        });
    }
});

module.exports = router;
