require('dotenv').config();
const express = require('express');
const cors = require('cors');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');
const specsRouter = require('./routes/specs');
const uiRouter = require('./routes/ui');
const authRouter = require('./routes/auth');
const initGitRepo = require('./utils/gitInit');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());

// Logging setup
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

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, { 
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// API routes
app.use('/specs', specsRouter);
app.use('/auth', authRouter);

// Serve Swagger UI for API documentation
app.use('/ui', uiRouter);

// Serve Swagger UI for the API Registry's own API
const openApiPath = path.join(__dirname, 'openapi.yaml');
const openApiSpec = YAML.parse(fs.readFileSync(openApiPath, 'utf8'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// DID document endpoint (well-known location)
app.get('/.well-known/did.json', async (req, res) => {
  try {
    const { did } = require('./lib/shared-libraries');
    
    const didDocument = did.document.generate({
      id: process.env.SERVICE_DID || 'did:web:api-registry',
      service: 'api-registry',
      baseUrl: process.env.BASE_URL || `http://localhost:${PORT}`
    });
    
    res.json(didDocument);
  } catch (error) {
    logger.error('DID document generation error:', error);
    res.status(500).json({ error: 'Failed to generate DID document' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    service: 'api-registry',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    features: {
      apiKeyAuth: true,
      didAuth: process.env.ENABLE_DID_AUTH === 'true',
      gitStorage: process.env.GIT_ENABLED === 'true'
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', error);
  res.status(500).json({
    error: {
      code: 'internal-server-error',
      message: 'An internal server error occurred'
    }
  });
});

app.listen(PORT, async () => {
  // Initialize git repository for specs storage
  await initGitRepo();
  
  logger.info(`API Registry Service running on port ${PORT}`, {
    port: PORT,
    didAuth: process.env.ENABLE_DID_AUTH === 'true',
    gitEnabled: process.env.GIT_ENABLED === 'true'
  });
});
