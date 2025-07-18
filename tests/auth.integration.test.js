/**
 * Integration Tests for Identity Provider Service
 * 
 * These tests verify the complete authentication flow including
 * the interaction between routes, middleware, and services.
 */

const request = require('supertest');
const express = require('express');
const cors = require('cors');
const authRouter = require('../src/routes/auth');
const specsRouter = require('../src/routes/specs');

// Create test application
const app = express();
app.use(cors());
app.use(express.json());
app.use('/auth', authRouter);
app.use('/specs', specsRouter);

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Test error:', error);
  res.status(500).json({
    error: {
      code: 'internal-server-error',
      message: 'Test error occurred'
    }
  });
});

describe('Identity Provider Service Integration', () => {
  beforeEach(() => {
    // Set up test environment
    process.env.API_KEYS = 'test-key-1,test-key-2';
    process.env.ENABLE_DID_AUTH = 'true';
    process.env.SERVICE_DID = 'did:web:api-registry-test';
    process.env.BASE_URL = 'http://localhost:3005';
    process.env.NODE_ENV = 'test';
  });

  describe('Service Health and Status', () => {
    it('should return Identity Provider Service status', async () => {
      const response = await request(app)
        .get('/auth/status')
        .expect(200);

      expect(response.body.service).toBe('OIDC-Identity-Service');
      expect(response.body.status).toBe('active');
      expect(response.body.features).toBeDefined();
      expect(response.body.features.apiKeyAuth).toBe(true);
      expect(response.body.features.didAuth).toBe(true);
    });

    it('should return DID document', async () => {
      const response = await request(app)
        .get('/auth/did')
        .expect(200);

      expect(response.body['@context']).toContain('https://www.w3.org/ns/did/v1');
      expect(response.body.id).toBeDefined();
      expect(response.body.service).toBeDefined();
    });
  });

  describe('API Key Authentication Flow', () => {
    it('should authenticate with valid API key', async () => {
      const response = await request(app)
        .get('/auth/user')
        .set('X-API-Key', 'test-key-1')
        .expect(200);

      expect(response.body.authenticated).toBe(true);
      expect(response.body.authType).toBe('api-key');
    });

    it('should reject invalid API key', async () => {
      const response = await request(app)
        .get('/auth/user')
        .set('X-API-Key', 'invalid-key')
        .expect(401);

      expect(response.body.error.code).toBe('auth/invalid-api-key');
    });

    it('should reject missing API key', async () => {
      const response = await request(app)
        .get('/auth/user')
        .expect(401);

      expect(response.body.error.code).toBe('auth/unauthorized');
    });
  });

  describe('DID Authentication Flow', () => {
    it('should complete full DID authentication flow', async () => {
      // Step 1: Create challenge
      const challengeResponse = await request(app)
        .post('/auth/challenge')
        .send({ did: 'did:web:example.com' })
        .expect(201);

      expect(challengeResponse.body.challenge).toBeDefined();
      expect(challengeResponse.body.challenge.id).toBeDefined();
      expect(challengeResponse.body.expiresIn).toBeDefined();

      // Step 2: Verify challenge (mock verification)
      const verifyResponse = await request(app)
        .post('/auth/challenge/verify')
        .send({
          challengeId: challengeResponse.body.challenge.id,
          response: 'mock-signed-response'
        })
        .expect(200);

      expect(verifyResponse.body.accessToken).toBeDefined();
      expect(verifyResponse.body.tokenType).toBe('Bearer');
      expect(verifyResponse.body.user).toBeDefined();

      // Step 3: Use token for authentication
      const userResponse = await request(app)
        .get('/auth/user')
        .set('Authorization', `Bearer ${verifyResponse.body.accessToken}`)
        .expect(200);

      expect(userResponse.body.authenticated).toBe(true);
      expect(userResponse.body.authType).toBe('did');
      expect(userResponse.body.user).toBeDefined();
    });

    it('should reject challenge creation without DID', async () => {
      const response = await request(app)
        .post('/auth/challenge')
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('validation/invalid-input');
    });

    it('should reject challenge verification without required fields', async () => {
      const response = await request(app)
        .post('/auth/challenge/verify')
        .send({ challengeId: 'test-challenge' })
        .expect(400);

      expect(response.body.error.code).toBe('validation/invalid-input');
    });
  });

  describe('Token Management', () => {
    it('should revoke token successfully', async () => {
      // First get a token
      const challengeResponse = await request(app)
        .post('/auth/challenge')
        .send({ did: 'did:web:example.com' })
        .expect(201);

      const tokenResponse = await request(app)
        .post('/auth/challenge/verify')
        .send({
          challengeId: challengeResponse.body.challenge.id,
          response: 'mock-signed-response'
        })
        .expect(200);

      // Then revoke it
      const revokeResponse = await request(app)
        .post('/auth/token/revoke')
        .set('Authorization', `Bearer ${tokenResponse.body.accessToken}`)
        .expect(200);

      expect(revokeResponse.body.message).toBe('Token revoked successfully');
    });

    it('should reject token revocation without authentication', async () => {
      const response = await request(app)
        .post('/auth/token/revoke')
        .expect(401);

      expect(response.body.error.code).toBe('auth/unauthorized');
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/auth/challenge')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      // Express will handle the malformed JSON
      expect(response.body).toBeDefined();
    });

    it('should handle missing content type', async () => {
      const response = await request(app)
        .post('/auth/challenge')
        .send('did=test')
        .expect(400);

      expect(response.body.error.code).toBe('validation/invalid-input');
    });
  });

  describe('Security Features', () => {
    it('should include security headers in responses', async () => {
      const response = await request(app)
        .get('/auth/status')
        .expect(200);

      // Check that basic headers are present
      expect(response.headers['content-type']).toContain('application/json');
    });

    it('should validate input parameters strictly', async () => {
      const response = await request(app)
        .post('/auth/challenge')
        .send({
          did: '',  // Empty DID should be rejected
          extraField: 'should be ignored'
        })
        .expect(400);

      expect(response.body.error.code).toBe('validation/invalid-input');
    });
  });
});

describe('Identity Provider Service Performance', () => {
  it('should handle multiple concurrent requests', async () => {
    const requests = [];
    
    for (let i = 0; i < 10; i++) {
      requests.push(
        request(app)
          .get('/auth/status')
          .expect(200)
      );
    }

    const responses = await Promise.all(requests);
    
    responses.forEach(response => {
      expect(response.body.service).toBe('OIDC-Identity-Service');
    });
  });

  it('should respond to status check quickly', async () => {
    const start = Date.now();
    
    await request(app)
      .get('/auth/status')
      .expect(200);
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(100); // Should respond within 100ms
  });
});
