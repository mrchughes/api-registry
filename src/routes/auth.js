/**
 * Authentication Routes
 * 
 * Handles authentication endpoints including DID authentication,
 * challenge-response authentication, and token management.
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const authService = require('../services/authService');
const { errors } = require('../lib/shared-libraries');
const { optionalAuth, didAuth } = require('../utils/auth');

const router = express.Router();

/**
 * @swagger
 * /auth/challenge:
 *   post:
 *     summary: Create DID Authentication Challenge
 *     description: Creates a challenge for DID-based authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               did:
 *                 type: string
 *                 description: The client's DID
 *             required:
 *               - did
 *     responses:
 *       201:
 *         description: Challenge created successfully
 *       400:
 *         description: Invalid request
 *       500:
 *         description: Server error
 */
router.post('/challenge', [
  body('did').isString().notEmpty().withMessage('DID is required')
], async (req, res) => {
  const errors_validation = validationResult(req);
  if (!errors_validation.isEmpty()) {
    return res.status(400).json(
      errors.format('validation/invalid-input', 'Invalid request data', {
        errors: errors_validation.array()
      })
    );
  }

  try {
    const { did } = req.body;
    const challenge = await authService.createDIDChallenge(did);
    
    res.status(201).json({
      challenge: challenge,
      expiresIn: process.env.CHALLENGE_EXPIRES_IN || '5m'
    });
  } catch (error) {
    console.error('Challenge creation error:', error);
    res.status(500).json(
      errors.format('auth/challenge-creation-failed', error.message)
    );
  }
});

/**
 * @swagger
 * /auth/challenge/verify:
 *   post:
 *     summary: Verify DID Challenge Response
 *     description: Verifies a signed challenge response and issues an access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               challengeId:
 *                 type: string
 *                 description: The challenge ID
 *               response:
 *                 type: string
 *                 description: The signed challenge response
 *               scope:
 *                 type: string
 *                 description: Requested access scope
 *             required:
 *               - challengeId
 *               - response
 *     responses:
 *       200:
 *         description: Challenge verified successfully
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Challenge verification failed
 *       500:
 *         description: Server error
 */
router.post('/challenge/verify', [
  body('challengeId').isString().notEmpty().withMessage('Challenge ID is required'),
  body('response').isString().notEmpty().withMessage('Response is required'),
  body('scope').optional().isString()
], async (req, res) => {
  const errors_validation = validationResult(req);
  if (!errors_validation.isEmpty()) {
    return res.status(400).json(
      errors.format('validation/invalid-input', 'Invalid request data', {
        errors: errors_validation.array()
      })
    );
  }

  try {
    const { challengeId, response, scope } = req.body;
    
    // Verify the challenge response
    const verificationResult = await authService.verifyDIDChallengeResponse(challengeId, response);
    
    if (!verificationResult.valid) {
      return res.status(401).json(
        errors.format('auth/challenge-verification-failed', verificationResult.error)
      );
    }

    // Issue access token
    const accessToken = await authService.issueAccessToken(
      verificationResult.user,
      scope || 'api:read'
    );

    res.json({
      accessToken: accessToken,
      tokenType: 'Bearer',
      expiresIn: process.env.TOKEN_EXPIRES_IN || '24h',
      user: verificationResult.user
    });
  } catch (error) {
    console.error('Challenge verification error:', error);
    res.status(500).json(
      errors.format('auth/verification-error', error.message)
    );
  }
});

/**
 * @swagger
 * /auth/token/revoke:
 *   post:
 *     summary: Revoke Access Token
 *     description: Revokes an access token
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Token revoked successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.post('/token/revoke', didAuth, async (req, res) => {
  try {
    const token = req.headers.authorization.substring(7); // Remove 'Bearer ' prefix
    
    await authService.revokeAccessToken(token);
    
    res.json({
      message: 'Token revoked successfully'
    });
  } catch (error) {
    console.error('Token revocation error:', error);
    res.status(500).json(
      errors.format('auth/revocation-error', error.message)
    );
  }
});

/**
 * @swagger
 * /auth/user:
 *   get:
 *     summary: Get Current User Information
 *     description: Returns information about the currently authenticated user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User information retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get('/user', optionalAuth, (req, res) => {
  if (!req.auth.authenticated) {
    return res.status(401).json(
      errors.format('auth/unauthorized', 'Authentication required')
    );
  }

  res.json({
    authenticated: true,
    authType: req.auth.type,
    user: req.auth.user || null
  });
});

/**
 * @swagger
 * /auth/did:
 *   get:
 *     summary: Get Service DID Document
 *     description: Returns the DID document for this service
 *     responses:
 *       200:
 *         description: DID document retrieved successfully
 *       500:
 *         description: Server error
 */
router.get('/did', async (req, res) => {
  try {
    const { did } = require('../lib/shared-libraries');
    
    // Generate or retrieve the service DID document
    const didDocument = did.document.generate({
      id: process.env.SERVICE_DID || 'did:web:api-registry',
      service: 'api-registry',
      baseUrl: process.env.BASE_URL || 'http://localhost:3005'
    });
    
    res.json(didDocument);
  } catch (error) {
    console.error('DID document generation error:', error);
    res.status(500).json(
      errors.format('did/generation-error', error.message)
    );
  }
});

/**
 * @swagger
 * /auth/status:
 *   get:
 *     summary: Get Authentication Service Status
 *     description: Returns the status of the authentication service
 *     responses:
 *       200:
 *         description: Service status retrieved successfully
 */
router.get('/status', (req, res) => {
  res.json({
    service: 'auth-service',
    version: '1.0.0',
    status: 'active',
    features: {
      apiKeyAuth: true,
      didAuth: process.env.ENABLE_DID_AUTH === 'true',
      challengeResponse: process.env.ENABLE_DID_AUTH === 'true'
    },
    endpoints: {
      challenge: '/auth/challenge',
      verify: '/auth/challenge/verify',
      revoke: '/auth/token/revoke',
      user: '/auth/user',
      did: '/auth/did'
    }
  });
});

module.exports = router;
