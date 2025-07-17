/**
 * Example Service Implementation with Shared Libraries
 * 
 * This file demonstrates how to properly integrate and use the shared libraries
 * in a PDS 2.0 service.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Import shared libraries using the standardized integration file
const { 
  did, 
  auth, 
  credentials, 
  apiRegistry, 
  errors,
  utils 
} = require('./lib/shared-libraries');

// Create Express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(utils.logger.requestLogger);

// Publish API spec to registry on startup
apiRegistry.publish('./specifications/openapi.yaml')
  .then(() => {
    console.log('API specification published to registry');
  })
  .catch(err => {
    console.error('Failed to publish API specification:', err.message);
  });

// Routes
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// DID document endpoint
app.get('/.well-known/did.json', (req, res) => {
  // Use the shared library to generate the DID document
  const didDocument = did.document.generate();
  res.json(didDocument);
});

// Example authentication middleware using shared library
const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json(errors.format('auth/unauthorized', 'No token provided'));
  }
  
  try {
    const decoded = auth.jwt.verify(token);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json(errors.format('auth/invalid-token', 'Invalid token'));
  }
};

// Protected route
app.get('/protected', authenticateJWT, (req, res) => {
  res.json({ message: 'This is a protected route', user: req.user });
});

// Example of issuing a credential using shared library
app.post('/credentials/issue', authenticateJWT, async (req, res) => {
  try {
    const { subject, claims } = req.body;
    
    if (!subject || !claims) {
      return res.status(400).json(
        errors.format('validation/missing-fields', 'Subject and claims are required')
      );
    }
    
    // Use shared library to issue credential
    const credential = await credentials.issuer.issue(subject, claims);
    
    res.status(201).json({ credential });
  } catch (err) {
    console.error('Credential issuance error:', err);
    res.status(500).json(
      errors.format('credential/issuance-failed', 'Failed to issue credential')
    );
  }
});

// Error handling middleware from shared library
app.use(errors.middleware);

// Start server
app.listen(port, () => {
  console.log(`Example service running on port ${port}`);
  console.log(`Health check available at http://localhost:${port}/health`);
  console.log(`DID document available at http://localhost:${port}/.well-known/did.json`);
});
