/**
 * Standard Integration for PDS Shared Libraries
 * 
 * This module provides a standardized way to import and use the shared libraries
 * across all PDS 2.0 services.
 */

// Import shared libraries
const pdsCommon = require('../lib/pds-common');

// Export the configured modules
module.exports = {
  // DID Operations
  did: {
    // DID document operations
    document: pdsCommon.did.document,
    // DID resolution
    resolver: pdsCommon.did.resolver,
    // Challenge-response operations for DID verification
    challenge: pdsCommon.did.challenge
  },
  
  // Authentication utilities
  auth: {
    // JWT token handling
    jwt: pdsCommon.auth.jwt,
    // User authentication
    user: pdsCommon.auth.user,
    // Service-to-service authentication
    service: pdsCommon.auth.service
  },
  
  // Verifiable Credentials utilities
  credentials: {
    // Credential issuance
    issuer: pdsCommon.credentials.issuer,
    // Credential verification
    verifier: pdsCommon.credentials.verifier,
    // Credential status
    status: pdsCommon.credentials.status
  },
  
  // API Registry integration
  apiRegistry: {
    // Publish API specifications
    publish: pdsCommon.apiRegistry.publish,
    // Discover other services
    discover: pdsCommon.apiRegistry.discover
  },
  
  // Error handling utilities
  errors: {
    // Standard error formats
    format: pdsCommon.errors.format,
    // Error middleware for Express
    middleware: pdsCommon.errors.middleware
  },
  
  // Utility functions
  utils: {
    // Logging utilities
    logger: pdsCommon.utils.logger,
    // Security utilities
    security: pdsCommon.utils.security,
    // HTTP utilities
    http: pdsCommon.utils.http
  }
};
