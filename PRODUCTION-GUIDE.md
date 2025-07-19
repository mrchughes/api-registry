# API Registry PDS 2.2 - Production Deployment Guide

## Overview

The API Registry PDS 2.2 is now production-ready with persistent MongoDB storage, enhanced security, and full compliance with PDS 2.2 specifications. This guide covers the deployment and operation of the service in production environments.

## ✅ Completed Implementation

### 1. Database Persistence
- **MongoDB Integration**: Persistent MongoDB database replaces in-memory storage
- **Schema Alignment**: Joi validation and Mongoose schemas are fully aligned
- **Data Integrity**: Services persist across server restarts
- **Indexing**: Optimized database indexes for performance

### 2. Schema Improvements
- **PDS 2.2 Compliance**: Updated schema matches PDS 2.2 specifications
- **Authentication Types**: Support for `solid-oidc-like`, `did-challenge-response`, and `hybrid`
- **Service Categories**: Government-focused categories: `government`, `utility`, `healthcare`, `education`, `financial`, `other`
- **Enhanced Metadata**: Comprehensive service metadata including WebID support

### 3. Production Security
- **Environment Configuration**: Separate production environment settings
- **Security Headers**: Helmet.js with comprehensive CSP policies
- **Session Management**: Secure session handling with configurable secrets
- **Input Validation**: Robust validation with Joi schemas
- **Rate Limiting**: Configurable API rate limiting

### 4. Standards Compliance
- **WebID-Centric Discovery**: Full support for WebID-based service discovery
- **Dual Authentication Flows**: Solid-OIDC and DID challenge-response support
- **GOV.UK Design System**: Complete UI compliance with GOV.UK standards
- **Accessibility**: WCAG AA compliance throughout the interface

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- MongoDB 6.0+
- macOS/Linux environment

### Installation

1. **Clone and Setup**
   ```bash
   cd /path/to/api-registry
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.production .env
   # Edit .env file with your production settings
   ```

3. **Setup Database**
   ```bash
   brew services start mongodb/brew/mongodb-community
   ```

4. **Deploy Production**
   ```bash
   ./deploy-production.sh
   ```

5. **Start Service**
   ```bash
   ./start-production.sh
   ```

## 📊 Service Configuration

### Database Schema
```javascript
// Service Registration Schema
{
  name: String,              // Unique service identifier
  displayName: String,       // Human-readable name
  description: String,       // Service description
  category: Enum,           // government, utility, healthcare, etc.
  baseUrl: String,          // Service base URL
  healthCheckUrl: String,   // Health check endpoint
  authentication: {
    type: Enum,             // solid-oidc-like, did-challenge-response, hybrid
    metadata: Object        // Auth-specific metadata
  },
  webidSupport: {
    enabled: Boolean,
    webidEndpoint: String,
    credentialOperations: Object
  },
  version: String,          // Semantic version
  capabilities: [String],   // Service capabilities
  dataTypes: [String],      // Supported data types
  contactInfo: Object,      // Contact information
  status: Enum,            // active, inactive, maintenance
  // ... additional metadata
}
```

### API Endpoints

#### Service Registration
```bash
POST /api/v1/services
Content-Type: application/json

{
  "name": "government-identity-service",
  "displayName": "Government Identity Service",
  "description": "Secure identity verification for government services",
  "category": "government",
  "baseUrl": "https://identity.gov.uk/api",
  "healthCheckUrl": "https://identity.gov.uk/api/health",
  "authenticationType": "solid-oidc-like",
  "version": "2.1.0",
  "webId": "https://identity.gov.uk/profile#service"
}
```

#### Service Discovery
```bash
GET /api/v1/services?category=government&authType=solid-oidc-like
GET /api/v1/discovery?webId=https://identity.gov.uk/profile#service
```

#### Health Monitoring
```bash
GET /health
```

## 🔧 Production Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `MONGODB_URI` | Database connection | `mongodb://localhost:27017/api-registry-pds22-production` |
| `SESSION_SECRET` | Session encryption key | *Change in production* |
| `JWT_SECRET` | JWT signing key | *Change in production* |
| `API_RATE_LIMIT_MAX_REQUESTS` | Rate limit | `100` |
| `ENABLE_CORS` | CORS support | `true` |
| `LOG_LEVEL` | Logging level | `info` |

### Security Checklist

- [ ] Change default secrets in `.env`
- [ ] Configure SSL/TLS certificates
- [ ] Set up firewall rules
- [ ] Configure rate limiting
- [ ] Enable audit logging
- [ ] Set up monitoring and alerting
- [ ] Configure backup strategy

## 📈 Monitoring and Maintenance

### Health Checks
The service provides comprehensive health monitoring:

```json
{
  "status": "ok",
  "service": "api-registry",
  "version": "2.2.0",
  "database": {
    "status": "healthy",
    "host": "localhost",
    "port": 27017
  },
  "uptime": 3600,
  "memory": {
    "used": "150MB",
    "total": "512MB"
  }
}
```

### Logging
- Application logs: `logs/api-registry.log`
- Error logs: `logs/error.log`
- Health monitoring: `logs/health-monitor.log`

### Database Maintenance
```bash
# Create backup
mongodump --db api-registry-pds22-production --out /backup/$(date +%Y%m%d)

# Restore from backup
mongorestore --db api-registry-pds22-production /backup/20240119/api-registry-pds22-production

# Database statistics
mongosh --eval "db.services.stats()"
```

## 🧪 Testing

### Run Integration Tests
```bash
npm test
```

### Manual Testing
```bash
# Test service registration
curl -X POST http://localhost:3005/api/v1/services \
  -H "Content-Type: application/json" \
  -d '{"name":"test-service","displayName":"Test","description":"Test service","category":"utility","baseUrl":"https://test.com","healthCheckUrl":"https://test.com/health","authenticationType":"solid-oidc-like","version":"1.0.0"}'

# Test service discovery
curl "http://localhost:3005/api/v1/services?category=utility"

# Test health check
curl http://localhost:3005/health
```

## 📚 API Documentation

Complete API documentation is available at:
- Interactive docs: `http://localhost:3005/api-docs`
- OpenAPI spec: `http://localhost:3005/openapi.yaml`

## 🔄 Upgrade Path

From previous versions:
1. Backup existing data
2. Update dependencies
3. Run database migrations
4. Update environment configuration
5. Test functionality
6. Deploy new version

## 🆘 Troubleshooting

### Common Issues

**Database Connection Failed**
```bash
# Check MongoDB status
brew services list | grep mongodb
# Restart if needed
brew services restart mongodb/brew/mongodb-community
```

**Schema Validation Errors**
- Ensure request data matches the new schema
- Check authentication type is valid: `solid-oidc-like`, `did-challenge-response`, or `hybrid`
- Verify category is valid: `government`, `utility`, `healthcare`, `education`, `financial`, or `other`

**Performance Issues**
- Check database indexes
- Monitor memory usage
- Review log files for errors
- Verify rate limiting configuration

## 📞 Support

For production support:
- Check logs in `logs/` directory
- Review health check endpoint
- Consult API documentation
- Monitor database performance

## 🔄 Future Enhancements

Planned improvements:
- [ ] Kubernetes deployment manifests
- [ ] Advanced monitoring with Prometheus
- [ ] Distributed tracing with Jaeger
- [ ] Enhanced security with OAuth2/OIDC
- [ ] Multi-region deployment support
