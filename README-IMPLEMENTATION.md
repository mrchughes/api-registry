# API Registry Service - Implementation

This is the implementation of the API Registry Service for the Solid Microservices ecosystem.

## Overview

The API Registry Service provides a centralized registry for API specifications across all microservices. It allows services to publish their OpenAPI specifications and enables other services to discover and consume these specifications.

## Features Implemented

1. **API Specification Management**
   - Store and version OpenAPI specifications
   - Register and update specifications with validation
   - Support for semantic versioning
   - Mark specifications as deprecated

2. **Service Discovery**
   - Register and manage services
   - List available services with filtering options
   - Get service details including available API versions
   - Service status management (active, maintenance, deprecated)

3. **Documentation Generation**
   - Interactive API documentation using Swagger UI
   - Browse available APIs through a user-friendly interface
   - GOV.UK Design System compliant UI

4. **OpenAPI Validation**
   - Validate specifications against OpenAPI standards
   - Support for OpenAPI 3.0 specifications

## Architecture

The API Registry follows a modular architecture with the following components:

### Core Components

1. **Controllers**: Handle HTTP requests and responses
   - `specsController.js`: Manages API specification endpoints
   - `serviceController.js`: Manages service registration endpoints

2. **Services**: Implement business logic
   - `specsService.js`: Handles specification storage and retrieval
   - `serviceService.js`: Handles service registration and management
   - `authService.js`: Handles authentication and authorization

3. **Validators**: Validate inputs
   - `openapiValidator.js`: Validates OpenAPI specifications

4. **Utils**: Utility functions
   - `auth.js`: Authentication middleware
   - `gitInit.js`: Git repository initialization for version control

5. **Routes**: Define API endpoints
   - `specs.js`: API specification endpoints
   - `services.js`: Service registration endpoints
   - `ui.js`: UI for browsing APIs
   - `auth.js`: Authentication endpoints

### Storage

The API Registry uses file-based storage with Git for version control:

1. **Specifications**: Stored in JSON format in the `storage/specs` directory
2. **Services**: Stored in JSON format in the `storage/services` directory

Git is used to track changes to specifications, providing version history and change tracking.

## API Endpoints

### Specification Management

1. **List API Specifications**
   - `GET /specs`
   - Lists all registered API specifications with optional filtering

2. **Register API Specification**
   - `POST /specs`
   - Registers a new API specification or updates an existing one

3. **Get API Specification**
   - `GET /specs/:serviceName/:version`
   - Retrieves a specific API specification

4. **Get Latest API Specification**
   - `GET /specs/:serviceName/latest`
   - Retrieves the latest version of an API specification

5. **Delete API Specification**
   - `DELETE /specs/:serviceName/:version`
   - Deletes a specific API specification

6. **Mark API as Deprecated**
   - `PATCH /specs/:serviceName/:version/deprecate`
   - Marks an API specification as deprecated

7. **Validate API Specification**
   - `POST /specs/validate`
   - Validates an OpenAPI specification against standards

### Service Registry

1. **List Services**
   - `GET /services`
   - Lists all registered services with optional filtering

2. **Register Service**
   - `POST /services`
   - Registers a new service in the registry

3. **Get Service Details**
   - `GET /services/:serviceName`
   - Gets details about a registered service including available API versions

4. **Update Service Status**
   - `PATCH /services/:serviceName/status`
   - Updates the status of a service (active, maintenance, deprecated)

### Documentation and UI

1. **Browse APIs**
   - `GET /ui`
   - Web interface for browsing available services and APIs

2. **View API Documentation**
   - `GET /ui/:serviceName/:version`
   - Swagger UI documentation for a specific API

3. **API Registry Documentation**
   - `GET /api-docs`
   - Documentation for the API Registry's own API

## Security

The API Registry implements the following security measures:

1. **API Key Authentication**: Required for write operations (register, update, delete)
2. **DID Authentication**: Optional support for DID-based authentication
3. **Input Validation**: All inputs are validated before processing
4. **Error Handling**: Standardized error responses following PDS error handling standards

## Running the Service

1. Install dependencies:
   ```
   npm install
   ```

2. Configure environment variables:
   Create a `.env` file with:
   ```
   # Server settings
   PORT=3005
   NODE_ENV=development
   BASE_URL=http://localhost:3005

   # Storage settings
   STORAGE_PATH=./storage
   GIT_ENABLED=true

   # Security settings
   API_KEYS=dev-api-key-1,dev-api-key-2
   ENABLE_DID_AUTH=false

   # Feature flags
   ENABLE_SDK_GENERATION=true
   ENABLE_SPEC_VALIDATION=true

   # Logging
   LOG_LEVEL=info
   ```

3. Start the service:
   ```
   npm start
   ```

4. For development with auto-reload:
   ```
   npm run dev
   ```

## Usage Examples

### Register a Service

```bash
curl -X POST http://localhost:3005/services \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-1" \
  -d '{
    "name": "example-service",
    "description": "Example microservice",
    "baseUrl": "http://example-service:3000",
    "healthCheckUrl": "http://example-service:3000/health",
    "owner": "Team A",
    "documentation": "https://example.com/docs"
  }'
```

### Register an API Specification

```bash
curl -X POST http://localhost:3005/specs \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-api-key-1" \
  -d '{
    "serviceName": "example-service",
    "version": "1.0.0",
    "specification": {
      "openapi": "3.0.0",
      "info": {
        "title": "Example API",
        "version": "1.0.0"
      },
      "paths": {}
    },
    "description": "Example API specification"
  }'
```

### List Available Services

```bash
curl http://localhost:3005/services
```

### Get Latest API Specification

```bash
curl http://localhost:3005/specs/example-service/latest
```

## Testing

Run tests with:

```bash
npm test
```

Run integration tests with:

```bash
npm run test:integration
```
   npm start
   ```

4. For development with auto-restart:
   ```
   npm run dev
   ```

## Testing

Run the test suite:
```
npm test
```

## Docker Deployment

Build and run using Docker:
```
docker build -t api-registry .
docker run -p 3005:3005 api-registry
```

## Integration with Other Services

Other services should publish their OpenAPI specifications to this registry during startup, following the pattern described in the specifications document. Here's an example of how a service would publish its API spec:

```javascript
const fs = require('fs');
const axios = require('axios');

async function publishApiSpec() {
  try {
    const apiSpec = JSON.parse(fs.readFileSync('./specifications/api-spec.json', 'utf8'));
    
    await axios.post('http://api-registry:3005/specs', {
      serviceName: process.env.SERVICE_NAME,
      version: process.env.SERVICE_VERSION,
      specification: apiSpec,
      description: 'API specification for ' + process.env.SERVICE_NAME
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.API_REGISTRY_KEY
      }
    });
    
    console.log('API specification published successfully');
  } catch (error) {
    console.error('Failed to publish API specification:', error.message);
  }
}

// Call this function during service startup
publishApiSpec();
```
