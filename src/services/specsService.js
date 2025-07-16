const path = require('path');
const fs = require('fs');
const git = require('isomorphic-git');
const { v4: uuidv4 } = require('uuid');
const semver = require('semver');

const STORAGE_DIR = path.join(__dirname, '../../storage');

// Helper to get spec file path
function getSpecFilePath(serviceName, version) {
  return path.join(STORAGE_DIR, serviceName, `${version}.json`);
}

// Save spec (register or update)
exports.saveSpec = async ({ serviceName, version, specification, description, deprecated }) => {
  const id = uuidv4();
  const serviceDir = path.join(STORAGE_DIR, serviceName);
  if (!fs.existsSync(serviceDir)) fs.mkdirSync(serviceDir, { recursive: true });
  const filePath = getSpecFilePath(serviceName, version);
  const specData = {
    id,
    serviceName,
    version,
    specification,
    description,
    deprecated: !!deprecated,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    url: `/specs/${serviceName}/${version}`,
    docsUrl: `/ui/${serviceName}/${version}`
  };
  fs.writeFileSync(filePath, JSON.stringify(specData, null, 2));
// Git add & commit
  try {
    await git.add({ fs, dir: STORAGE_DIR, filepath: path.relative(STORAGE_DIR, filePath) });
    await git.commit({ 
      fs, 
      dir: STORAGE_DIR, 
      message: `Add/update spec for ${serviceName}@${version}`,
      author: {
        name: 'API Registry Service',
        email: 'api-registry@example.com'
      } 
    });
  } catch (error) {
    console.error('Git operation failed:', error);
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
  const serviceDir = path.join(STORAGE_DIR, serviceName);
  if (!fs.existsSync(serviceDir)) return null;
  
  const files = fs.readdirSync(serviceDir)
    .filter(f => f.endsWith('.json'));
  
  if (files.length === 0) return null;
  
  const versions = files.map(f => f.replace('.json', ''))
    .filter(v => semver.valid(v));
  
  if (versions.length === 0) return null;
  
  // Find the latest version
  const latest = semver.maxSatisfying(versions, '*');
  if (!latest) return null;
  
  return exports.getSpec(serviceName, latest);
};
