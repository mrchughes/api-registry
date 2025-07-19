/**
 * API Registry Service for PDS 2.2
 * 
 * Enhanced service discovery with WebID-centric authentication flows,
 * dual authentication support, and comprehensive service metadata.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');
const session = require('express-session');
const nunjucks = require('nunjucks');

// Database connection
const { database } = require('./database/connection');

// Routes
const specsRouter = require('./routes/specs');
const servicesRouter = require('./routes/services');
const discoveryRouter = require('./routes/discovery');
const adminRouter = require('./routes/admin');
const uiRouter = require('./routes/ui');

const app = express();
const PORT = process.env.PORT || 3005;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Ensure directories exist
const ensureDirectories = () => {
  const dirs = [
    path.join(__dirname, '../logs'),
    path.join(__dirname, '../uploads'),
    path.join(__dirname, '../public'),
    path.join(__dirname, '../views')
  ];

  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};

ensureDirectories();

// Logging setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/api-registry.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5
    })
  ]
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3005'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Session configuration for UI
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 // 24 hours
  }
}));

// Template engine setup (Nunjucks for GOV.UK compatibility)
const nunjucksEnv = nunjucks.configure([
  path.join(__dirname, '../views'),
  path.join(__dirname, '../node_modules/govuk-frontend/')
], {
  autoescape: true,
  express: app,
  watch: process.env.NODE_ENV === 'development'
});

// Add GOV.UK Frontend globals
nunjucksEnv.addGlobal('serviceName', 'API Registry');
nunjucksEnv.addGlobal('baseUrl', BASE_URL);
nunjucksEnv.addGlobal('assetPath', '/assets');

// Static files - GOV.UK Frontend assets
app.use('/assets', express.static(path.join(__dirname, '../node_modules/govuk-frontend/govuk/assets')));
app.use('/public', express.static(path.join(__dirname, '../public')));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('HTTP Request', {
      method: req.method,
      url: req.url,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  });

  next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await database.healthCheck();

    const health = {
      status: dbHealth.status === 'healthy' ? 'ok' : 'error',
      service: 'api-registry',
      version: process.env.SERVICE_VERSION || '2.2.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: dbHealth,
      uptime: process.uptime(),
      memory: process.memoryUsage()
    };

    const statusCode = health.status === 'ok' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      service: 'api-registry',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
app.use('/api/v1/specs', specsRouter);
app.use('/api/v1/services', servicesRouter);
app.use('/api/v1/discovery', discoveryRouter);
app.use('/api/v1/admin', adminRouter);

// UI routes
app.use('/', uiRouter);

// API documentation
const openApiPath = path.join(__dirname, 'openapi.yaml');
if (fs.existsSync(openApiPath)) {
  const openApiSpec = YAML.parse(fs.readFileSync(openApiPath, 'utf8'));

  // Update spec with current server info
  openApiSpec.servers = [
    {
      url: BASE_URL,
      description: 'API Registry Service'
    }
  ];

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'API Registry Documentation - PDS 2.2',
    customCss: '.swagger-ui .topbar { display: none }',
    customfavIcon: '/public/favicon.ico'
  }));
} else {
  logger.warn('⚠️ OpenAPI specification not found at:', openApiPath);
}

// DID document endpoint (well-known location)
app.get('/.well-known/did.json', (req, res) => {
  const didDocument = {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1"
    ],
    "id": process.env.SERVICE_DID || `did:web:${req.hostname}`,
    "verificationMethod": [{
      "id": `${process.env.SERVICE_DID || `did:web:${req.hostname}`}#key-1`,
      "type": "Ed25519VerificationKey2020",
      "controller": process.env.SERVICE_DID || `did:web:${req.hostname}`,
      "publicKeyMultibase": process.env.DID_PUBLIC_KEY || "z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH"
    }],
    "authentication": [`${process.env.SERVICE_DID || `did:web:${req.hostname}`}#key-1`],
    "assertionMethod": [`${process.env.SERVICE_DID || `did:web:${req.hostname}`}#key-1`],
    "service": [{
      "id": `${process.env.SERVICE_DID || `did:web:${req.hostname}`}#registry`,
      "type": "ApiRegistry",
      "serviceEndpoint": BASE_URL
    }]
  };

  res.json(didDocument);
});

// 404 handler
app.use((req, res) => {
  logger.warn(`404 - Not Found: ${req.method} ${req.url}`);

  if (req.accepts('html')) {
    res.status(404).render('error.njk', {
      title: 'Page not found',
      statusCode: 404,
      message: 'The page you requested could not be found.'
    });
  } else if (req.accepts('json')) {
    res.status(404).json({
      error: 'not_found',
      message: 'The requested resource was not found',
      path: req.url,
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(404).type('txt').send('Not found');
  }
});

// Error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  if (req.accepts('html')) {
    res.status(500).render('error.njk', {
      title: 'Something went wrong',
      statusCode: 500,
      message: process.env.NODE_ENV === 'development' ? error.message : 'An internal server error occurred.'
    });
  } else if (req.accepts('json')) {
    res.status(500).json({
      error: 'internal_error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An internal server error occurred',
      timestamp: new Date().toISOString()
    });
  } else {
    res.status(500).type('txt').send('Internal Server Error');
  }
});

// Initialize database and start server
async function startServer() {
  try {
    // Connect to database
    await database.connect();
    logger.info('✅ Database connected successfully');

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info('🚀 API Registry Service started successfully', {
        port: PORT,
        baseUrl: BASE_URL,
        environment: process.env.NODE_ENV || 'development',
        features: [
          'WebID-Centric Service Discovery',
          'Dual Authentication Support',
          'Enhanced Metadata Registry',
          'GOV.UK Design System UI'
        ],
        standards: [
          'PDS 2.2 Specification',
          'Solid Protocol',
          'W3C Verifiable Credentials',
          'OpenAPI 3.0'
        ]
      });
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      logger.info(`📡 Received ${signal}, shutting down gracefully...`);

      server.close(async () => {
        logger.info('🔌 HTTP server closed');

        try {
          await database.disconnect();
          logger.info('🔌 Database disconnected');
          process.exit(0);
        } catch (error) {
          logger.error('❌ Error during shutdown:', error);
          process.exit(1);
        }
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('⏰ Force closing server after 10 seconds');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    return server;
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
