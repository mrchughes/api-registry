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
const initGitRepo = require('./utils/gitInit');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());

// Logging setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console()
  ]
});

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// API routes
app.use('/specs', specsRouter);

// Serve Swagger UI for API documentation
app.use('/ui', uiRouter);

// Serve Swagger UI for the API Registry's own API
const openApiPath = path.join(__dirname, 'openapi.yaml');
const openApiSpec = YAML.parse(fs.readFileSync(openApiPath, 'utf8'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, async () => {
  // Initialize git repository for specs storage
  await initGitRepo();
  logger.info(`API Registry Service running on port ${PORT}`);
});
