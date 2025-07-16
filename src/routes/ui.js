const express = require('express');
const router = express.Router();
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '../../storage');

// Serve Swagger UI for a given service/version
router.get('/:serviceName/:version', (req, res, next) => {
  const { serviceName, version } = req.params;
  const specPath = path.join(STORAGE_DIR, serviceName, `${version}.json`);
  if (!fs.existsSync(specPath)) return res.status(404).send('Spec not found');
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8')).specification;
  req.swaggerDoc = spec;
  next();
}, swaggerUi.serve, swaggerUi.setup(undefined, { swaggerUrl: undefined, swaggerOptions: { docExpansion: 'none' } }));

module.exports = router;
