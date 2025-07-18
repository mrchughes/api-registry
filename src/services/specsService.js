const path = require('path');
const fs = require('fs');
const git = require('isomorphic-git');
const { v4: uuidv4 } = require('uuid');
const semver = require('semver');
const winston = require('winston');

const STORAGE_DIR = path.join(__dirname, '../../storage');
const SPECS_DIR = path.join(STORAGE_DIR, 'specs');

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

// Ensure specs directory exists
if (!fs.existsSync(SPECS_DIR)) {
  fs.mkdirSync(SPECS_DIR, { recursive: true });
}

// Helper to get spec file path
function getSpecFilePath(serviceName, version) {
  return path.join(SPECS_DIR, serviceName, `${version}.json`);
}

// Save spec (register or update)
exports.saveSpec = async ({ serviceName, version, specification, description, deprecated }) => {
  logger.info(`Saving spec for ${serviceName}@${version}`);

  // Check if spec already exists
  const existingSpec = await exports.getSpec(serviceName, version);
  const id = existingSpec ? existingSpec.id : uuidv4();

  const serviceDir = path.join(SPECS_DIR, serviceName);
  if (!fs.existsSync(serviceDir)) {
    fs.mkdirSync(serviceDir, { recursive: true });
  }

  const now = new Date().toISOString();
  const filePath = getSpecFilePath(serviceName, version);

  const specData = {
    id,
    serviceName,
    version,
    specification,
    description: description || '',
    deprecated: !!deprecated,
    createdAt: existingSpec ? existingSpec.createdAt : now,
    updatedAt: now,
    url: `/specs/${serviceName}/${version}`,
    docsUrl: `/ui/${serviceName}/${version}`
  };

  fs.writeFileSync(filePath, JSON.stringify(specData, null, 2));

  // Git add & commit
  try {
    if (process.env.GIT_ENABLED === 'true') {
      await git.add({ fs, dir: STORAGE_DIR, filepath: path.relative(STORAGE_DIR, filePath) });
      await git.commit({
        fs,
        dir: STORAGE_DIR,
        message: `${existingSpec ? 'Update' : 'Add'} spec for ${serviceName}@${version}`,
        author: {
          name: 'API Registry Service',
          email: 'api-registry@example.com'
        }
      });
      logger.info(`Git commit successful for ${serviceName}@${version}`);
    }
  } catch (error) {
    logger.error(`Git operation failed: ${error.message}`, { error: error.stack });
    // Continue with the function even if git operations fail
  }

  return specData;
};

// Get spec by service and version
exports.getSpec = async (serviceName, version) => {
  const filePath = getSpecFilePath(serviceName, version);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

// Get latest spec by service
exports.getLatestSpec = async (serviceName) => {
  const serviceDir = path.join(SPECS_DIR, serviceName);
  if (!fs.existsSync(serviceDir)) {
    logger.warn(`No specs directory found for service: ${serviceName}`);
    return null;
  }

  const files = fs.readdirSync(serviceDir)
    .filter(f => f.endsWith('.json'));

  if (files.length === 0) {
    logger.warn(`No spec files found for service: ${serviceName}`);
    return null;
  }

  const versions = files.map(f => f.replace('.json', ''))
    .filter(v => semver.valid(v));

  if (versions.length === 0) {
    logger.warn(`No valid semver versions found for service: ${serviceName}`);
    return null;
  }

  // Find the latest version
  const latest = semver.maxSatisfying(versions, '*');
  if (!latest) {
    logger.warn(`Could not determine latest version for service: ${serviceName}`);
    return null;
  }

  logger.info(`Latest version for ${serviceName} is ${latest}`);
  return exports.getSpec(serviceName, latest);
};

// List all specifications with optional filters
exports.listSpecs = async (filters = {}) => {
  logger.info(`Listing specs with filters: ${JSON.stringify(filters)}`);

  if (!fs.existsSync(SPECS_DIR)) {
    return [];
  }

  const services = fs.readdirSync(SPECS_DIR)
    .filter(dir => fs.statSync(path.join(SPECS_DIR, dir)).isDirectory());

  // Filter by serviceName if provided
  const filteredServices = filters.serviceName
    ? services.filter(s => s === filters.serviceName)
    : services;

  let allSpecs = [];

  for (const service of filteredServices) {
    const serviceDir = path.join(SPECS_DIR, service);
    const files = fs.readdirSync(serviceDir)
      .filter(f => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(serviceDir, file);
      const spec = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Apply version filter if provided
      if (filters.version && spec.version !== filters.version) {
        continue;
      }

      // Apply deprecated filter if provided
      if (filters.deprecated !== undefined && spec.deprecated !== filters.deprecated) {
        continue;
      }

      // Don't include the full specification in the list response
      const { specification, ...specInfo } = spec;
      allSpecs.push(specInfo);
    }
  }

  // Sort by serviceName and version
  allSpecs.sort((a, b) => {
    if (a.serviceName !== b.serviceName) {
      return a.serviceName.localeCompare(b.serviceName);
    }
    return semver.compare(b.version, a.version); // Newest first
  });

  return allSpecs;
};

// Get all specs for a service
exports.getSpecsForService = async (serviceName) => {
  return exports.listSpecs({ serviceName });
};

// Delete a specification
exports.deleteSpec = async (serviceName, version) => {
  logger.info(`Deleting spec for ${serviceName}@${version}`);

  const filePath = getSpecFilePath(serviceName, version);
  if (!fs.existsSync(filePath)) {
    return false;
  }

  fs.unlinkSync(filePath);

  // Git commit the deletion if enabled
  try {
    if (process.env.GIT_ENABLED === 'true') {
      await git.remove({ fs, dir: STORAGE_DIR, filepath: path.relative(STORAGE_DIR, filePath) });
      await git.commit({
        fs,
        dir: STORAGE_DIR,
        message: `Remove spec for ${serviceName}@${version}`,
        author: {
          name: 'API Registry Service',
          email: 'api-registry@example.com'
        }
      });
      logger.info(`Git commit successful for deletion of ${serviceName}@${version}`);
    }
  } catch (error) {
    logger.error(`Git operation failed during deletion: ${error.message}`, { error: error.stack });
    // Continue with the function even if git operations fail
  }

  return true;
};

// Mark a specification as deprecated
exports.deprecateSpec = async (serviceName, version) => {
  logger.info(`Marking spec as deprecated: ${serviceName}@${version}`);

  const spec = await exports.getSpec(serviceName, version);
  if (!spec) {
    return null;
  }

  spec.deprecated = true;
  spec.updatedAt = new Date().toISOString();

  const filePath = getSpecFilePath(serviceName, version);
  fs.writeFileSync(filePath, JSON.stringify(spec, null, 2));

  // Git commit the change if enabled
  try {
    if (process.env.GIT_ENABLED === 'true') {
      await git.add({ fs, dir: STORAGE_DIR, filepath: path.relative(STORAGE_DIR, filePath) });
      await git.commit({
        fs,
        dir: STORAGE_DIR,
        message: `Mark spec as deprecated: ${serviceName}@${version}`,
        author: {
          name: 'API Registry Service',
          email: 'api-registry@example.com'
        }
      });
      logger.info(`Git commit successful for deprecation of ${serviceName}@${version}`);
    }
  } catch (error) {
    logger.error(`Git operation failed during deprecation: ${error.message}`, { error: error.stack });
    // Continue with the function even if git operations fail
  }

  return spec;
};
