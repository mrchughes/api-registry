# API Registry Service Documentation

## Overview

The API Registry Service is a centralized repository for API specifications across all microservices in the Solid Microservices ecosystem. It enables services to publish their OpenAPI specifications and allows other services to discover and consume these specifications.

## API Endpoints

### Register API Specification

**Endpoint:** `POST /specs`

**Description:** Registers a new API specification or updates an existing one.

**Authentication:** Required (API Key via X-API-Key header)

**Request Body:**
```json
{
  "serviceName": "string",          // Name of the service
  "version": "string",              // Semantic version of the API
  "specification": "object|string", // OpenAPI specification object or YAML/JSON string
  "description": "string",          // Optional description of the API
  "deprecated": false               // Optional flag to mark as deprecated
}
```

**Response:**
```json
{
  "id": "string",                   // Unique ID for the specification
  "serviceName": "string",
  "version": "string",
  "url": "string",                  // URL to access the specification
  "docsUrl": "string",              // URL to access the Swagger UI docs
  "createdAt": "string",            // ISO date string
  "updatedAt": "string"             // ISO date string
}
```

### Get API Specification

**Endpoint:** `GET /specs/:serviceName/:version`

**Description:** Retrieves a specific API specification.

**Authentication:** None

**Response:** OpenAPI specification in JSON format

### Get Latest API Specification

**Endpoint:** `GET /specs/:serviceName/latest`

**Description:** Retrieves the latest version of an API specification.

**Authentication:** None

**Response:** OpenAPI specification in JSON format

## Implementation Notes

- The service uses semver to determine the latest version
- Specifications are stored with git version control in the storage directory
- Swagger UI is available for browsing API documentation at `/ui/:serviceName/:version`
- The API Registry's own API documentation is available at `/api-docs`

## Integration Examples

### Publishing an API Specification

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

### Retrieving an API Specification

```javascript
const axios = require('axios');

async function getServiceApiSpec(serviceName) {
  try {
    const response = await axios.get(`http://api-registry:3005/specs/${serviceName}/latest`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch API spec for ${serviceName}:`, error.message);
    return null;
  }
}
```

## Environment Variables

- `PORT`: The port the service runs on (default: 3005)
- `API_KEY`: API key for authentication when registering specifications
