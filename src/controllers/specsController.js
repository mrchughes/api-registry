const specsService = require('../services/specsService');
const { validateSpec } = require('../validators/openapiValidator');
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

// POST /specs
exports.registerSpec = async (req, res) => {
  try {
    const { serviceName, version, specification, description, deprecated } = req.body;

    // Validate required fields
    if (!serviceName || !version || !specification) {
      return res.status(400).json(
        errors.format('validation/missing-fields', 'Service name, version, and specification are required')
      );
    }

    // Validate OpenAPI spec
    logger.info(`Validating specification for ${serviceName}@${version}`);
    const validation = await validateSpec(specification);

    if (!validation.valid) {
      logger.warn(`Invalid OpenAPI specification for ${serviceName}@${version}`, { errors: validation.errors });
      return res.status(400).json(
        errors.format('spec/invalid', 'Invalid OpenAPI specification', { details: validation.errors })
      );
    }

    // Store spec
    const result = await specsService.saveSpec({
      serviceName,
      version,
      specification,
      description,
      deprecated
    });

    logger.info(`Specification registered: ${serviceName}@${version}`);
    res.status(201).json(result);
  } catch (err) {
    logger.error(`Error registering specification: ${err.message}`, { error: err.stack });
    res.status(500).json(
      errors.format('internal/server-error', 'Error registering specification')
    );
  }
};

// GET /specs/:serviceName/:version
exports.getSpec = async (req, res) => {
  try {
    const { serviceName, version } = req.params;

    logger.info(`Getting specification: ${serviceName}@${version}`);
    const spec = await specsService.getSpec(serviceName, version);

    if (!spec) {
      logger.warn(`Specification not found: ${serviceName}@${version}`);
      return res.status(404).json(
        errors.format('spec/not-found', `Specification for ${serviceName}@${version} not found`)
      );
    }

    res.json(spec);
  } catch (err) {
    logger.error(`Error getting specification: ${err.message}`, { error: err.stack });
    res.status(500).json(
      errors.format('internal/server-error', 'Error retrieving specification')
    );
  }
};

// GET /specs/:serviceName/latest
exports.getLatestSpec = async (req, res) => {
  try {
    const { serviceName } = req.params;

    logger.info(`Looking for latest spec for service: ${serviceName}`);
    const spec = await specsService.getLatestSpec(serviceName);

    if (!spec) {
      logger.warn(`No spec found for service: ${serviceName}`);
      return res.status(404).json(
        errors.format('spec/not-found', `No specifications found for ${serviceName}`)
      );
    }

    res.json(spec);
  } catch (err) {
    logger.error(`Error getting latest spec: ${err.message}`, { error: err.stack });
    res.status(500).json(
      errors.format('internal/server-error', 'Error retrieving latest specification')
    );
  }
};

// GET /specs
exports.listSpecs = async (req, res) => {
  try {
    const { serviceName, version, deprecated } = req.query;

    // Parse deprecated query parameter if provided
    let parsedDeprecated;
    if (deprecated !== undefined) {
      parsedDeprecated = deprecated === 'true';
    }

    logger.info('Listing specifications', {
      filters: { serviceName, version, deprecated: parsedDeprecated }
    });

    const specs = await specsService.listSpecs({
      serviceName,
      version,
      deprecated: parsedDeprecated
    });

    res.json(specs);
  } catch (err) {
    logger.error(`Error listing specifications: ${err.message}`, { error: err.stack });
    res.status(500).json(
      errors.format('internal/server-error', 'Error retrieving specifications list')
    );
  }
};

// DELETE /specs/:serviceName/:version
exports.deleteSpec = async (req, res) => {
  try {
    const { serviceName, version } = req.params;

    logger.info(`Deleting specification: ${serviceName}@${version}`);
    const deleted = await specsService.deleteSpec(serviceName, version);

    if (!deleted) {
      logger.warn(`Specification not found for deletion: ${serviceName}@${version}`);
      return res.status(404).json(
        errors.format('spec/not-found', `Specification for ${serviceName}@${version} not found`)
      );
    }

    res.status(204).end();
  } catch (err) {
    logger.error(`Error deleting specification: ${err.message}`, { error: err.stack });
    res.status(500).json(
      errors.format('internal/server-error', 'Error deleting specification')
    );
  }
};

// PATCH /specs/:serviceName/:version/deprecate
exports.deprecateSpec = async (req, res) => {
  try {
    const { serviceName, version } = req.params;

    logger.info(`Deprecating specification: ${serviceName}@${version}`);
    const spec = await specsService.deprecateSpec(serviceName, version);

    if (!spec) {
      logger.warn(`Specification not found for deprecation: ${serviceName}@${version}`);
      return res.status(404).json(
        errors.format('spec/not-found', `Specification for ${serviceName}@${version} not found`)
      );
    }

    res.json({
      id: spec.id,
      serviceName: spec.serviceName,
      version: spec.version,
      deprecated: spec.deprecated,
      updatedAt: spec.updatedAt
    });
  } catch (err) {
    logger.error(`Error deprecating specification: ${err.message}`, { error: err.stack });
    res.status(500).json(
      errors.format('internal/server-error', 'Error deprecating specification')
    );
  }
};

// POST /validate
exports.validateSpecification = async (req, res) => {
  try {
    const specification = req.body;

    logger.info('Validating OpenAPI specification');
    const validation = await validateSpec(specification);

    res.json({
      valid: validation.valid,
      errors: validation.errors || []
    });
  } catch (err) {
    logger.error(`Error validating specification: ${err.message}`, { error: err.stack });
    res.status(500).json(
      errors.format('internal/server-error', 'Error validating specification')
    );
  }
};
