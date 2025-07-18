# Authentication Service Implementation

This document describes the authentication service implementation for the API Registry, which handles both traditional API key authentication and DID-based authentication as specified in the PDS 2.0 architecture.

## Overview

The authentication service provides secure access control for the API Registry using two authentication methods:

1. **API Key Authentication** - Traditional API key-based authentication for service-to-service communication
2. **DID Authentication** - Decentralized Identity-based authentication using challenge-response protocol

## Features

### Core Authentication Features

- **Dual Authentication Methods**: Supports both API key and DID-based authentication
- **Flexible Middleware**: Configurable authentication middleware for different endpoints
- **Challenge-Response Protocol**: Implements DID challenge-response for secure authentication
- **JWT Token Management**: Issues and manages JWT access tokens
- **Token Revocation**: Supports token revocation for security
- **DID Document Management**: Generates and serves DID documents

### Security Features

- **Secure Token Storage**: JWT tokens with configurable expiration
- **Challenge Expiration**: Time-limited challenges to prevent replay attacks
- **Request Logging**: Comprehensive logging for security monitoring
- **Input Validation**: Strict validation of all authentication requests
- **Error Handling**: Standardized error responses with proper HTTP status codes

## Architecture

### Components

```
src/
├── services/
│   └── authService.js          # Core authentication service
├── routes/
│   └── auth.js                 # Authentication API routes
├── utils/
│   └── auth.js                 # Authentication middleware
├── lib/
│   └── shared-libraries.js     # PDS common library integration
└── tests/
    └── auth.test.js            # Authentication service tests
```

### Authentication Flow

#### API Key Authentication
1. Client includes `X-API-Key` header in request
2. Middleware validates key against configured keys
3. Request proceeds if valid, rejected if invalid

#### DID Authentication
1. Client requests challenge with their DID
2. Service generates time-limited challenge
3. Client signs challenge with their private key
4. Service verifies signature and DID document
5. Service issues JWT access token
6. Client uses token for subsequent requests

## API Endpoints

### Authentication Endpoints

#### Create Challenge
```http
POST /auth/challenge
Content-Type: application/json

{
  "did": "did:web:example.com"
}
```

#### Verify Challenge
```http
POST /auth/challenge/verify
Content-Type: application/json

{
  "challengeId": "challenge-123",
  "response": "signed-challenge-response",
  "scope": "api:read"
}
```

#### Revoke Token
```http
POST /auth/token/revoke
Authorization: Bearer <jwt-token>
```

#### Get User Info
```http
GET /auth/user
Authorization: Bearer <jwt-token>
```

#### Get DID Document
```http
GET /auth/did
GET /.well-known/did.json
```

#### Service Status
```http
GET /auth/status
```

## Configuration

### Environment Variables

```bash
# Authentication Configuration
API_KEYS=dev-key-1,dev-key-2,dev-key-3
ENABLE_DID_AUTH=true

# DID Configuration
SERVICE_DID=did:web:api-registry
CHALLENGE_EXPIRES_IN=5m
TOKEN_EXPIRES_IN=24h

# Security Configuration
BASE_URL=http://localhost:3005
LOG_LEVEL=info
```

### Feature Flags

- `ENABLE_DID_AUTH`: Enable/disable DID authentication
- `API_KEYS`: Comma-separated list of valid API keys
- `CHALLENGE_EXPIRES_IN`: Challenge expiration time
- `TOKEN_EXPIRES_IN`: JWT token expiration time

## Usage Examples

### API Key Authentication

```javascript
const response = await fetch('http://localhost:3005/specs', {
  method: 'POST',
  headers: {
    'X-API-Key': 'dev-key-1',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    serviceName: 'my-service',
    version: '1.0.0',
    specification: { /* OpenAPI spec */ }
  })
});
```

### DID Authentication

```javascript
// Step 1: Request challenge
const challengeResponse = await fetch('http://localhost:3005/auth/challenge', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ did: 'did:web:example.com' })
});

const { challenge } = await challengeResponse.json();

// Step 2: Sign challenge (implementation depends on DID method)
const signedResponse = await signChallenge(challenge);

// Step 3: Verify challenge and get token
const tokenResponse = await fetch('http://localhost:3005/auth/challenge/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    challengeId: challenge.id,
    response: signedResponse
  })
});

const { accessToken } = await tokenResponse.json();

// Step 4: Use token for API calls
const apiResponse = await fetch('http://localhost:3005/specs', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    serviceName: 'my-service',
    version: '1.0.0',
    specification: { /* OpenAPI spec */ }
  })
});
```

## Middleware Usage

The authentication service provides several middleware options:

### Flexible Authentication
```javascript
const { flexibleAuth } = require('./utils/auth');

// Accepts both API key and DID authentication
router.post('/protected', flexibleAuth, (req, res) => {
  // req.auth contains authentication info
  res.json({ authenticated: req.auth.authenticated });
});
```

### Optional Authentication
```javascript
const { optionalAuth } = require('./utils/auth');

// Authentication is optional, provides enhanced features if authenticated
router.get('/public', optionalAuth, (req, res) => {
  if (req.auth.authenticated) {
    // Provide enhanced response
  } else {
    // Provide basic response
  }
});
```

### Specific Authentication Methods
```javascript
const { apiKeyAuth, didAuth } = require('./utils/auth');

// Only API key authentication
router.post('/api-only', apiKeyAuth, handler);

// Only DID authentication
router.post('/did-only', didAuth, handler);
```

## Error Handling

The service uses standardized error responses:

```json
{
  "error": {
    "code": "auth/invalid-api-key",
    "message": "Invalid API key",
    "details": {}
  }
}
```

### Error Codes

- `auth/invalid-api-key`: Invalid or missing API key
- `auth/unauthorized`: No authentication provided
- `auth/invalid-token`: Invalid JWT token
- `auth/challenge-creation-failed`: Failed to create DID challenge
- `auth/challenge-verification-failed`: Challenge verification failed
- `auth/authentication-error`: General authentication service error
- `validation/invalid-input`: Invalid request data
- `did/generation-error`: DID document generation failed

## Testing

The authentication service includes comprehensive tests:

```bash
# Run authentication tests
npm test tests/auth.test.js

# Run all tests
npm test
```

### Test Coverage

- API key validation
- DID authentication flow
- Challenge-response protocol
- Token management
- Middleware functionality
- Error handling
- Security scenarios

## Security Considerations

### Best Practices

1. **API Key Management**: Store API keys securely and rotate regularly
2. **Challenge Expiration**: Keep challenge expiration time short (5 minutes)
3. **Token Expiration**: Use reasonable token expiration times (24 hours)
4. **Request Logging**: Monitor authentication attempts for security
5. **Input Validation**: Validate all authentication requests
6. **Error Handling**: Don't expose sensitive information in error messages

### Security Features

- Time-limited challenges prevent replay attacks
- JWT tokens include standard claims (iss, aud, exp)
- Token revocation prevents unauthorized access
- Comprehensive logging for security monitoring
- Input validation prevents injection attacks

## PDS Common Library Integration

The authentication service integrates with the PDS common library for:

- **DID Operations**: Document generation, validation, and resolution
- **JWT Handling**: Token signing, verification, and revocation
- **Challenge Protocol**: Challenge creation and verification
- **Error Formatting**: Standardized error responses

### Fallback Implementation

The service includes fallback implementations for development when the PDS common library is not available:

```javascript
// Fallback implementations in shared-libraries.js
const pdsCommon = {
  did: {
    document: { generate: mockGenerate, validate: mockValidate },
    resolver: { resolve: mockResolve },
    challenge: { create: mockCreate, verify: mockVerify }
  },
  auth: {
    jwt: { sign: mockSign, verify: mockVerify, revoke: mockRevoke }
  }
  // ... other fallback implementations
};
```

## Monitoring and Observability

### Logging

The service logs all authentication events:

```javascript
logger.info('API key validation', { 
  valid: isValid,
  keyPrefix: apiKey.substring(0, 8) + '...'
});

logger.info('DID authentication successful', { 
  did: decoded.iss,
  subject: decoded.sub
});
```

### Metrics

Key metrics to monitor:

- Authentication success/failure rates
- Challenge creation/verification rates
- Token issuance and revocation
- API key usage patterns
- DID authentication adoption

### Health Checks

The service provides health check endpoints:

```http
GET /health
GET /auth/status
```

## Deployment

### Docker Configuration

```dockerfile
# Environment variables for authentication
ENV API_KEYS=production-key-1,production-key-2
ENV ENABLE_DID_AUTH=true
ENV SERVICE_DID=did:web:api-registry.example.com
ENV BASE_URL=https://api-registry.example.com
```

### Production Considerations

1. **API Key Security**: Use strong, unique API keys in production
2. **DID Configuration**: Configure proper DID for the service
3. **Token Security**: Use secure JWT signing keys
4. **Monitoring**: Set up monitoring for authentication metrics
5. **Backup**: Ensure token revocation lists are backed up

## Future Enhancements

### Planned Features

1. **OAuth 2.0 Support**: Add OAuth 2.0 authentication flow
2. **Multi-factor Authentication**: Support for additional authentication factors
3. **Rate Limiting**: Implement rate limiting for authentication endpoints
4. **Session Management**: Add session management for web interfaces
5. **Audit Logging**: Enhanced audit logging for compliance

### Integration Points

- **Database Integration**: Store authentication data in database
- **Cache Integration**: Cache authentication results for performance
- **Metrics Integration**: Export metrics to monitoring systems
- **Alerting Integration**: Set up alerts for authentication failures
