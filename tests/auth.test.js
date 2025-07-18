/**
 * Authentication Service Tests
 * 
 * Tests for the authentication service including API key and DID authentication.
 */

const request = require('supertest');
const express = require('express');
const authRouter = require('../src/routes/auth');
const authService = require('../src/services/authService');

// Mock the shared libraries
jest.mock('../src/lib/shared-libraries', () => ({
  did: {
    document: {
      generate: jest.fn().mockReturnValue({
        "@context": ["https://www.w3.org/ns/did/v1"],
        "id": "did:web:api-registry",
        "service": [{
          "id": "did:web:api-registry#api-registry",
          "type": "ApiRegistry",
          "serviceEndpoint": "http://localhost:3005"
        }]
      }),
      validate: jest.fn().mockReturnValue(true)
    },
    resolver: {
      resolve: jest.fn().mockResolvedValue({
        "@context": ["https://www.w3.org/ns/did/v1"],
        "id": "did:web:example",
        "service": []
      })
    },
    challenge: {
      create: jest.fn().mockResolvedValue({
        id: "challenge-123",
        challenge: "nonce-abc123",
        clientDID: "did:web:example",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      }),
      verify: jest.fn().mockResolvedValue({
        valid: true,
        did: "did:web:example",
        user: { did: "did:web:example", subject: "example-user" }
      })
    }
  },
  auth: {
    jwt: {
      sign: jest.fn().mockResolvedValue("mock-jwt-token"),
      verify: jest.fn().mockReturnValue({
        iss: "did:web:example",
        sub: "example-user",
        aud: "api-registry",
        exp: Math.floor(Date.now() / 1000) + 3600
      }),
      revoke: jest.fn().mockResolvedValue(true)
    }
  },
  errors: {
    format: (code, message, details = {}) => ({
      error: {
        code: code,
        message: message,
        details: details
      }
    })
  }
}));

// Create test app
const app = express();
app.use(express.json());
app.use('/auth', authRouter);

describe('Authentication Service', () => {
  let authService;
  
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_KEYS = 'test-key-1,test-key-2';
    process.env.ENABLE_DID_AUTH = 'true';
    process.env.NODE_ENV = 'test';
    
    // Clear module cache to pick up new environment variables
    jest.resetModules();
    authService = require('../src/services/authService');
  });

  describe('API Key Authentication', () => {
    it('should validate correct API key', () => {
      const result = authService.validateApiKey('test-key-1');
      expect(result).toBe(true);
    });

    it('should reject incorrect API key', () => {
      const result = authService.validateApiKey('wrong-key');
      expect(result).toBe(false);
    });

    it('should reject missing API key', () => {
      const result = authService.validateApiKey(null);
      expect(result).toBe(false);
    });
  });

  describe('DID Authentication', () => {
    it('should create DID challenge successfully', async () => {
      const response = await request(app)
        .post('/auth/challenge')
        .send({ did: 'did:web:example' })
        .expect(201);

      expect(response.body.challenge).toBeDefined();
      expect(response.body.challenge.id).toBe('challenge-123');
      expect(response.body.expiresIn).toBeDefined();
    });

    it('should reject challenge creation without DID', async () => {
      const response = await request(app)
        .post('/auth/challenge')
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('validation/invalid-input');
    });

    it('should verify challenge response successfully', async () => {
      const response = await request(app)
        .post('/auth/challenge/verify')
        .send({
          challengeId: 'challenge-123',
          response: 'signed-response'
        })
        .expect(200);

      expect(response.body.accessToken).toBe('mock-jwt-token');
      expect(response.body.tokenType).toBe('Bearer');
      expect(response.body.user).toBeDefined();
    });

    it('should reject challenge verification without required fields', async () => {
      const response = await request(app)
        .post('/auth/challenge/verify')
        .send({
          challengeId: 'challenge-123'
        })
        .expect(400);

      expect(response.body.error.code).toBe('validation/invalid-input');
    });
  });

  describe('DID Document', () => {
    it('should return service DID document', async () => {
      const response = await request(app)
        .get('/auth/did')
        .expect(200);

      expect(response.body['@context']).toContain('https://www.w3.org/ns/did/v1');
      expect(response.body.id).toBe('did:web:api-registry');
      expect(response.body.service).toBeDefined();
    });
  });

  describe('Service Status', () => {
    it('should return authentication service status', async () => {
      const response = await request(app)
        .get('/auth/status')
        .expect(200);

      expect(response.body.service).toBe('OIDC-Identity-Service');
      expect(response.body.version).toBe('1.0.0');
      expect(response.body.status).toBe('active');
      expect(response.body.features).toBeDefined();
      expect(response.body.endpoints).toBeDefined();
    });
  });

  describe('Token Management', () => {
    it('should revoke token successfully', async () => {
      const response = await request(app)
        .post('/auth/token/revoke')
        .set('Authorization', 'Bearer mock-jwt-token')
        .expect(200);

      expect(response.body.message).toBe('Token revoked successfully');
    });

    it('should reject revocation without token', async () => {
      const response = await request(app)
        .post('/auth/token/revoke')
        .expect(401);

      expect(response.body.error.code).toBe('auth/unauthorized');
    });
  });

  describe('User Information', () => {
    it('should return user information for authenticated user', async () => {
      const response = await request(app)
        .get('/auth/user')
        .set('Authorization', 'Bearer mock-jwt-token')
        .expect(200);

      expect(response.body.authenticated).toBe(true);
      expect(response.body.authType).toBe('did');
      expect(response.body.user).toBeDefined();
    });

    it('should reject unauthenticated user', async () => {
      const response = await request(app)
        .get('/auth/user')
        .expect(401);

      expect(response.body.error.code).toBe('auth/unauthorized');
    });
  });

  describe('Error Handling', () => {
    it('should handle DID authentication service errors', async () => {
      const { did } = require('../src/lib/shared-libraries');
      did.challenge.create.mockRejectedValueOnce(new Error('Service unavailable'));

      const response = await request(app)
        .post('/auth/challenge')
        .send({ did: 'did:web:example' })
        .expect(500);

      expect(response.body.error.code).toBe('auth/challenge-creation-failed');
    });

    it('should handle JWT verification errors', async () => {
      const { auth } = require('../src/lib/shared-libraries');
      auth.jwt.verify.mockImplementationOnce(() => {
        throw new Error('Invalid token');
      });

      const response = await request(app)
        .get('/auth/user')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error.code).toBe('auth/invalid-token');
    });
  });
});

describe('Authentication Middleware', () => {
  let authService;
  let apiKeyAuth, didAuth, flexibleAuth, optionalAuth;
  
  beforeEach(() => {
    // Set up test environment
    process.env.API_KEYS = 'test-key-1,test-key-2';
    process.env.ENABLE_DID_AUTH = 'true';
    process.env.NODE_ENV = 'test';
    
    // Clear module cache to pick up new environment variables
    jest.resetModules();
    
    // Re-import modules with new environment
    authService = require('../src/services/authService');
    const authMiddleware = require('../src/utils/auth');
    apiKeyAuth = authMiddleware.apiKeyAuth;
    didAuth = authMiddleware.didAuth;
    flexibleAuth = authMiddleware.flexibleAuth;
    optionalAuth = authMiddleware.optionalAuth;
  });

  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1'
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    next = jest.fn();
  });

  describe('API Key Middleware', () => {
    it('should authenticate valid API key', () => {
      req.headers['x-api-key'] = 'test-key-1';
      
      apiKeyAuth(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.auth.authenticated).toBe(true);
      expect(req.auth.type).toBe('api-key');
    });

    it('should reject invalid API key', () => {
      req.headers['x-api-key'] = 'invalid-key';
      
      apiKeyAuth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject missing API key', () => {
      apiKeyAuth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Flexible Authentication Middleware', () => {
    it('should use API key when available', () => {
      req.headers['x-api-key'] = 'test-key-1';
      
      flexibleAuth(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.auth.type).toBe('api-key');
    });

    it('should reject when no authentication provided', () => {
      flexibleAuth(req, res, next);
      
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('Optional Authentication Middleware', () => {
    it('should proceed without authentication', () => {
      optionalAuth(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.auth.authenticated).toBe(false);
    });

    it('should authenticate when valid API key provided', () => {
      req.headers['x-api-key'] = 'test-key-1';
      
      optionalAuth(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(req.auth.authenticated).toBe(true);
      expect(req.auth.type).toBe('api-key');
    });
  });
});
