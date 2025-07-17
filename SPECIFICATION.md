# API Registry Service Specification

## Overview

The API Registry Service is a centralized repository for API specifications across all microservices in the PDS 2.0 ecosystem. It enables services to publish their OpenAPI specifications and allows other services to discover and consume these specifications, facilitating service discovery and API contract enforcement.

## Service Responsibilities

1. **API Specification Management**
   - Store and version OpenAPI specifications
   - Provide endpoints for registering and updating specifications
   - Validate specifications against OpenAPI standards
   - Manage specification lifecycle (deprecation, versioning)

2. **Service Discovery**
   - Allow services to discover available APIs
   - Provide endpoints for querying specifications by service name and version
   - Support automatic discovery of the latest API versions

3. **Documentation Generation**
   - Generate interactive API documentation using Swagger UI
   - Provide developer-friendly interfaces for exploring APIs
   - Support documentation export in various formats

4. **API Client Generation**
   - Generate client SDKs for consuming registered APIs
   - Support multiple programming languages
   - Manage SDK versioning aligned with API versions

## API Endpoints

### Specification Management

#### Register API Specification

- **Endpoint:** `POST /specs`
- **Description:** Registers a new API specification or updates an existing one
- **Authentication:** Required (API Key)
- **Request Body:**
  ```json
  {
    "serviceName": "string",          // Name of the service
    "version": "string",              // Semantic version of the API
    "specification": "object|string", // OpenAPI specification object or YAML/JSON string
    "description": "string",          // Optional description of the API
    "deprecated": false               // Optional flag to mark as deprecated
  }
  ```
- **Response:**
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

#### Get API Specification

- **Endpoint:** `GET /specs/:serviceName/:version`
- **Description:** Retrieves a specific API specification
- **Authentication:** None
- **Response:** OpenAPI specification in JSON format

#### Get Latest API Specification

- **Endpoint:** `GET /specs/:serviceName/latest`
- **Description:** Retrieves the latest version of an API specification
- **Authentication:** None
- **Response:** OpenAPI specification in JSON format

#### List API Specifications

- **Endpoint:** `GET /specs`
- **Description:** Lists all registered API specifications
- **Authentication:** None
- **Query Parameters:**
  - `serviceName` (optional): Filter by service name
  - `version` (optional): Filter by version
  - `deprecated` (optional): Filter by deprecated status
- **Response:**
  ```json
  [
    {
      "id": "string",
      "serviceName": "string",
      "version": "string",
      "description": "string",
      "url": "string",
      "docsUrl": "string",
      "deprecated": false,
      "createdAt": "string",
      "updatedAt": "string"
    }
  ]
  ```

#### Delete API Specification

- **Endpoint:** `DELETE /specs/:serviceName/:version`
- **Description:** Deletes a specific API specification
- **Authentication:** Required (API Key)
- **Response:** Success message

#### Mark API as Deprecated

- **Endpoint:** `PATCH /specs/:serviceName/:version/deprecate`
- **Description:** Marks an API specification as deprecated
- **Authentication:** Required (API Key)
- **Response:**
  ```json
  {
    "id": "string",
    "serviceName": "string",
    "version": "string",
    "deprecated": true,
    "updatedAt": "string"
  }
  ```

### Documentation and Utilities

#### Get API Documentation

- **Endpoint:** `GET /docs/:serviceName/:version`
- **Description:** Serves Swagger UI documentation for a specific API
- **Authentication:** None
- **Response:** HTML page with Swagger UI

#### Validate API Specification

- **Endpoint:** `POST /validate`
- **Description:** Validates an OpenAPI specification against standards
- **Authentication:** None
- **Request Body:** OpenAPI specification in JSON or YAML format
- **Response:**
  ```json
  {
    "valid": true,
    "errors": []
  }
  ```

#### Generate Client SDK

- **Endpoint:** `GET /sdk/:serviceName/:version/:language`
- **Description:** Generates a client SDK for a specific API and language
- **Authentication:** None
- **Path Parameters:**
  - `serviceName`: Name of the service
  - `version`: API version
  - `language`: Target language (e.g., `typescript`, `python`, `java`)
- **Response:** SDK package as a downloadable file

### Service Registry

#### Register Service

- **Endpoint:** `POST /services`
- **Description:** Registers a new service in the registry
- **Authentication:** Required (API Key)
- **Request Body:**
  ```json
  {
    "name": "string",
    "description": "string",
    "baseUrl": "string",
    "healthCheckUrl": "string",
    "status": "active|maintenance|deprecated",
    "owner": "string",
    "documentation": "string"
  }
  ```
- **Response:**
  ```json
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "baseUrl": "string",
    "healthCheckUrl": "string",
    "status": "active|maintenance|deprecated",
    "owner": "string",
    "documentation": "string",
    "createdAt": "string",
    "updatedAt": "string"
  }
  ```

#### Get Service Details

- **Endpoint:** `GET /services/:serviceName`
- **Description:** Gets details about a registered service
- **Authentication:** None
- **Response:**
  ```json
  {
    "id": "string",
    "name": "string",
    "description": "string",
    "baseUrl": "string",
    "healthCheckUrl": "string",
    "status": "active|maintenance|deprecated",
    "owner": "string",
    "documentation": "string",
    "specs": [
      {
        "id": "string",
        "version": "string",
        "url": "string",
        "docsUrl": "string",
        "deprecated": false
      }
    ],
    "createdAt": "string",
    "updatedAt": "string"
  }
  ```

#### List Services

- **Endpoint:** `GET /services`
- **Description:** Lists all registered services
- **Authentication:** None
- **Query Parameters:**
  - `status` (optional): Filter by service status
  - `owner` (optional): Filter by service owner
- **Response:**
  ```json
  [
    {
      "id": "string",
      "name": "string",
      "description": "string",
      "baseUrl": "string",
      "status": "active|maintenance|deprecated",
      "latestSpec": {
        "version": "string",
        "url": "string",
        "docsUrl": "string"
      }
    }
  ]
  ```

## Data Models

### API Specification

```json
{
  "id": "string",
  "serviceName": "string",
  "version": "string",
  "description": "string",
  "specification": "object",
  "url": "string",
  "docsUrl": "string",
  "deprecated": false,
  "createdAt": "string",
  "updatedAt": "string"
}
```

### Service

```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "baseUrl": "string",
  "healthCheckUrl": "string",
  "status": "active|maintenance|deprecated",
  "owner": "string",
  "documentation": "string",
  "createdAt": "string",
  "updatedAt": "string"
}
```

## Dependencies

The API Registry Service is designed to be a standalone service with minimal dependencies:

1. **External Storage**
   - Git: For version control of API specifications
   - File System: For storing specifications and SDKs

2. **Libraries**
   - openapi-validator: For validating OpenAPI specifications
   - swagger-ui: For rendering API documentation
   - openapi-generator: For generating client SDKs

## Configuration

The service requires the following environment variables:

```
# Server settings
PORT=3005
NODE_ENV=development

# Storage settings
STORAGE_PATH=/app/data/specs
GIT_ENABLED=true

# Security settings
API_KEYS=key1,key2,key3

# Feature flags
ENABLE_SDK_GENERATION=true
ENABLE_SPEC_VALIDATION=true

# Logging
LOG_LEVEL=info
```

## Deployment

The service can be deployed using Docker:

```bash
docker build -t api-registry .
docker run -p 3005:3005 -v /data/specs:/app/data/specs --env-file .env api-registry
```

For local development, the service can be run with:

```bash
npm install
npm run dev
```

## Testing

The service includes unit and integration tests:

```bash
# Run unit tests
npm run test

# Run integration tests
npm run test:integration
```

## Error Handling

All errors follow the standardized error format defined in PDS specifications:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": "object"
  }
}
```

Common error codes:
- `auth/invalid-api-key`: Invalid API key
- `spec/not-found`: Specification not found
- `spec/invalid`: Invalid specification format
- `service/not-found`: Service not found
- `validation/failed`: Validation failed

## Security Considerations

1. API keys are required for write operations
2. All specifications are validated before storage
3. Read-only operations are public to enable discovery
4. Input validation is performed on all endpoints
5. Rate limiting is applied to prevent abuse
