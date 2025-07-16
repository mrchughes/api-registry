# API Registry Service - Implementation

This is the implementation of the API Registry Service for the Solid Microservices ecosystem.

## Overview

The API Registry Service provides a centralized registry for API specifications across all microservices. It allows services to publish their OpenAPI specifications and enables other services to discover and consume these specifications.

## Features Implemented

- Registration and updating of API specifications via REST API
- Version management of specifications using semantic versioning
- Validation of OpenAPI specifications
- Git-based storage for version control
- Swagger UI for interactive documentation

## API Endpoints

1. **Register API Specification**
   - `POST /specs`
   - Registers a new API specification or updates an existing one

2. **Get API Specification**
   - `GET /specs/:serviceName/:version`
   - Retrieves a specific API specification

3. **Get Latest API Specification**
   - `GET /specs/:serviceName/latest`
   - Retrieves the latest version of an API specification

4. **Swagger UI Documentation**
   - `GET /ui/:serviceName/:version`
   - View interactive API documentation for a specific service

## Running the Service

1. Install dependencies:
   ```
   npm install
   ```

2. Configure environment variables:
   Create a `.env` file with:
   ```
   PORT=3005
   API_KEY=your-api-key-here
   ```

3. Start the service:
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
