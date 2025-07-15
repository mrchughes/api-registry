# API Registry Service API Specification

## Overview

The API Registry Service provides endpoints for publishing, retrieving, and managing API specifications for microservices in the Solid Microservices ecosystem. It acts as a central repository for OpenAPI specifications, enabling service discovery, documentation, and contract testing.

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

## Authentication

The API Registry Service uses API key authentication for write operations:

- API keys must be provided in the `X-API-Key` header
- Each service should have its own API key for publishing its specifications
- Read operations (GET requests) do not require authentication

## Error Responses

All error responses follow this format:

```json
{
  "error": {
    "code": "string",
    "message": "string",
    "details": "object" // Optional
  }
}
```

Common error codes:

- `400`: Bad Request
- `401`: Unauthorized
- `404`: Not Found
- `409`: Conflict (e.g., when trying to register a specification with the same version)
- `500`: Internal Server Error

## Deployment

The API Registry Service can be deployed as a Docker container:

```
docker build -t api-registry .
docker run -p 3005:3005 api-registry
```

### Environment Variables

- `PORT`: The port the service listens on (default: 3005)
- `STORAGE_PATH`: Path to store API specifications
- `API_KEYS`: Comma-separated list of valid API keys
- `LOG_LEVEL`: Logging level (default: info)

## Development

The service is implemented using Node.js and Express.js. It uses a Git-based storage system for version control of API specifications and Swagger UI for documentation.

## Dependencies

This service has no dependencies on other microservices in the system, making it fully independent.
