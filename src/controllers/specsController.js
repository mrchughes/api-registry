const specsService = require('../services/specsService');
const { validateSpec } = require('../validators/openapiValidator');

// POST /specs
exports.registerSpec = async (req, res) => {
  try {
    const { serviceName, version, specification, description, deprecated } = req.body;
    // Validate OpenAPI spec
    const validation = await validateSpec(specification);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid OpenAPI specification', details: validation.errors });
    }
    // Store spec
    const result = await specsService.saveSpec({ serviceName, version, specification, description, deprecated });
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /specs/:serviceName/:version
exports.getSpec = async (req, res) => {
  try {
    const { serviceName, version } = req.params;
    const spec = await specsService.getSpec(serviceName, version);
    if (!spec) return res.status(404).json({ error: 'Specification not found' });
    res.json(spec);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET /specs/:serviceName/latest
exports.getLatestSpec = async (req, res) => {
  try {
    const { serviceName } = req.params;
    
    // Let's log what we're looking for to help debug
    console.log(`Looking for latest spec for service: ${serviceName}`);
    
    const spec = await specsService.getLatestSpec(serviceName);
    
    if (!spec) {
      console.log(`No spec found for service: ${serviceName}`);
      return res.status(404).json({ error: 'Specification not found' });
    }
    
    res.json(spec);
  } catch (err) {
    console.error(`Error getting latest spec: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
};
