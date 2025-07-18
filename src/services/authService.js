/**
 * Authentication Service
 * 
 * Handles authentication and DID verification for the API Registry service.
 * This service provides both API key authentication and DID-based authentication.
 */

const { did, auth, errors } = require('../lib/shared-libraries');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/auth.log' })
  ]
});

class AuthService {
  constructor() {
    this.apiKeys = process.env.API_KEYS ? process.env.API_KEYS.split(',').map(key => key.trim()) : [];
    this.enableDIDAuth = process.env.ENABLE_DID_AUTH === 'true';
    
    // For testing, allow override
    if (process.env.NODE_ENV === 'test') {
      this.enableDIDAuth = true;
    }
  }

  /**
   * Validate API key authentication
   * @param {string} apiKey - The API key to validate
   * @returns {boolean} - True if valid, false otherwise
   */
  validateApiKey(apiKey) {
    if (!apiKey) {
      return false;
    }

    const isValid = this.apiKeys.includes(apiKey);
    logger.info('API key validation', { 
      valid: isValid,
      keyPrefix: apiKey.substring(0, 8) + '...'
    });
    
    return isValid;
  }

  /**
   * Validate DID-based authentication
   * @param {string} didToken - The DID token to validate
   * @returns {Promise<Object>} - Validation result with user info
   */
  async validateDIDAuth(didToken) {
    if (!this.enableDIDAuth) {
      throw new Error('DID authentication is not enabled');
    }

    try {
      // Verify the DID token using the shared library
      const decoded = auth.jwt.verify(didToken);
      
      // Verify the DID document
      const didDocument = await did.resolver.resolve(decoded.iss);
      
      if (!didDocument) {
        logger.warn('DID document not found', { did: decoded.iss });
        return { valid: false, error: 'DID document not found' };
      }

      // Validate the DID document
      const isValidDID = did.document.validate(didDocument);
      
      if (!isValidDID) {
        logger.warn('Invalid DID document', { did: decoded.iss });
        return { valid: false, error: 'Invalid DID document' };
      }

      logger.info('DID authentication successful', { 
        did: decoded.iss,
        subject: decoded.sub
      });

      return {
        valid: true,
        user: {
          did: decoded.iss,
          subject: decoded.sub,
          claims: decoded.claims || {}
        }
      };
    } catch (error) {
      logger.error('DID authentication failed', { 
        error: error.message,
        token: didToken.substring(0, 20) + '...'
      });
      
      return { 
        valid: false, 
        error: 'Invalid DID token: ' + error.message 
      };
    }
  }

  /**
   * Create a DID challenge for authentication
   * @param {string} clientDID - The client's DID
   * @returns {Promise<Object>} - Challenge object
   */
  async createDIDChallenge(clientDID) {
    if (!this.enableDIDAuth) {
      throw new Error('DID authentication is not enabled');
    }

    try {
      const challenge = await did.challenge.create(clientDID);
      
      logger.info('DID challenge created', { 
        clientDID,
        challengeId: challenge.id
      });

      return challenge;
    } catch (error) {
      logger.error('Failed to create DID challenge', { 
        error: error.message,
        clientDID
      });
      
      throw new Error('Failed to create DID challenge: ' + error.message);
    }
  }

  /**
   * Verify a DID challenge response
   * @param {string} challengeId - The challenge ID
   * @param {string} response - The signed challenge response
   * @returns {Promise<Object>} - Verification result
   */
  async verifyDIDChallengeResponse(challengeId, response) {
    if (!this.enableDIDAuth) {
      throw new Error('DID authentication is not enabled');
    }

    try {
      const result = await did.challenge.verify(challengeId, response);
      
      logger.info('DID challenge verification', { 
        challengeId,
        valid: result.valid,
        did: result.did
      });

      return result;
    } catch (error) {
      logger.error('DID challenge verification failed', { 
        error: error.message,
        challengeId
      });
      
      throw new Error('Challenge verification failed: ' + error.message);
    }
  }

  /**
   * Issue a service access token after successful authentication
   * @param {Object} user - User information
   * @param {string} scope - Access scope
   * @returns {Promise<string>} - JWT access token
   */
  async issueAccessToken(user, scope = 'api:read') {
    try {
      const token = await auth.jwt.sign({
        sub: user.subject || user.did,
        iss: process.env.SERVICE_DID || 'api-registry',
        aud: 'api-registry',
        scope: scope,
        user: user
      }, {
        expiresIn: process.env.TOKEN_EXPIRES_IN || '24h'
      });

      logger.info('Access token issued', { 
        user: user.did || user.subject,
        scope
      });

      return token;
    } catch (error) {
      logger.error('Failed to issue access token', { 
        error: error.message,
        user: user.did || user.subject
      });
      
      throw new Error('Failed to issue access token: ' + error.message);
    }
  }

  /**
   * Revoke an access token
   * @param {string} token - The token to revoke
   * @returns {Promise<boolean>} - True if revoked successfully
   */
  async revokeAccessToken(token) {
    try {
      // Add token to revocation list (in production, this would be stored in a database)
      const result = await auth.jwt.revoke(token);
      
      logger.info('Access token revoked', { 
        tokenPrefix: token.substring(0, 20) + '...'
      });

      return result;
    } catch (error) {
      logger.error('Failed to revoke access token', { 
        error: error.message
      });
      
      throw new Error('Failed to revoke access token: ' + error.message);
    }
  }
}

module.exports = new AuthService();
