/**
 * Authentication Middleware
 * 
 * Provides middleware for API key and DID-based authentication
 */

const authService = require('../services/authService');
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
    new winston.transports.Console()
  ]
});

/**
 * API Key authentication middleware
 */
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    logger.warn('API key missing', { 
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    
    return res.status(401).json(
      errors.format('auth/invalid-api-key', 'API key is required')
    );
  }
  
  const isValid = authService.validateApiKey(apiKey);
  
  if (!isValid) {
    logger.warn('Invalid API key', { 
      path: req.path,
      method: req.method,
      ip: req.ip,
      keyPrefix: apiKey.substring(0, 8) + '...'
    });
    
    return res.status(401).json(
      errors.format('auth/invalid-api-key', 'Invalid API key')
    );
  }
  
  // Add auth info to request
  req.auth = {
    type: 'api-key',
    authenticated: true
  };
  
  next();
};

/**
 * DID-based authentication middleware
 */
const didAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('DID token missing', { 
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    
    return res.status(401).json(
      errors.format('auth/unauthorized', 'Bearer token is required')
    );
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix
  
  try {
    const result = await authService.validateDIDAuth(token);
    
    if (!result.valid) {
      logger.warn('Invalid DID token', { 
        path: req.path,
        method: req.method,
        ip: req.ip,
        error: result.error
      });
      
      return res.status(401).json(
        errors.format('auth/invalid-token', result.error)
      );
    }
    
    // Add auth info to request
    req.auth = {
      type: 'did',
      authenticated: true,
      user: result.user
    };
    
    next();
  } catch (error) {
    logger.error('DID authentication error', { 
      error: error.message,
      path: req.path,
      method: req.method,
      ip: req.ip
    });
    
    return res.status(500).json(
      errors.format('auth/authentication-error', 'Authentication service error')
    );
  }
};

/**
 * Flexible authentication middleware that supports both API key and DID auth
 */
const flexibleAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  
  // Try API key first
  if (apiKey) {
    return apiKeyAuth(req, res, next);
  }
  
  // Try DID authentication
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return didAuth(req, res, next);
  }
  
  // No authentication provided
  logger.warn('No authentication provided', { 
    path: req.path,
    method: req.method,
    ip: req.ip
  });
  
  return res.status(401).json(
    errors.format('auth/unauthorized', 'Authentication is required (API key or Bearer token)')
  );
};

/**
 * Optional authentication middleware - allows unauthenticated access
 */
const optionalAuth = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const authHeader = req.headers.authorization;
  
  // Set default auth state
  req.auth = {
    authenticated: false
  };
  
  // Try API key first
  if (apiKey) {
    const isValid = authService.validateApiKey(apiKey);
    if (isValid) {
      req.auth = {
        type: 'api-key',
        authenticated: true
      };
    }
  }
  
  // Try DID authentication if no valid API key
  if (!req.auth.authenticated && authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.substring(7);
      const result = await authService.validateDIDAuth(token);
      
      if (result.valid) {
        req.auth = {
          type: 'did',
          authenticated: true,
          user: result.user
        };
      }
    } catch (error) {
      // Log error but don't fail the request
      logger.warn('Optional DID authentication failed', { 
        error: error.message,
        path: req.path
      });
    }
  }
  
  next();
};

module.exports = {
  apiKeyAuth,
  didAuth,
  flexibleAuth,
  optionalAuth
};
