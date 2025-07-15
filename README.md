# API Registry Service

This service provides a centralized registry for API specifications across all microservices in the Solid Microservices ecosystem. It allows services to publish their OpenAPI specifications and other services to discover and consume these specifications.

## Key Features

- Registry for OpenAPI specifications
- API versioning support
- Specification validation
- Interactive API documentation
- Client SDK generation
- Contract testing tools

## Benefits

1. **Single Source of Truth**: All services can reference the same API specifications
2. **Discoverability**: New services can easily find and understand existing APIs
3. **Contract Testing**: Services can validate their implementations against the registered specifications
4. **Documentation**: Auto-generated, always up-to-date API documentation
5. **Change Management**: Track API changes and notify dependent services

## Architecture

The API Registry follows a simple, lightweight approach:

- RESTful API for publishing and retrieving specifications
- Git-based storage for version control of specifications
- OpenAPI validation for quality control
- Swagger UI for interactive documentation

## Usage Workflow

1. **Publishing**:
   - When a service is developed or updated, its OpenAPI specification is published to the API Registry
   - The Registry validates the specification and stores it with version information

2. **Discovery**:
   - Services can query the Registry to discover available APIs
   - Services can retrieve specific API specifications by service name and version

3. **Development**:
   - Developers can browse available APIs through the interactive documentation
   - Client SDKs can be generated from the specifications

4. **Testing**:
   - Services can use the specifications for contract testing
   - CI/CD pipelines can validate API implementations against the specifications

## Folder Structure

```
api-registry/
├── src/
│   ├── index.js           # Entry point
│   ├── routes/            # API routes
│   ├── controllers/       # Route handlers
│   ├── services/          # Business logic
│   ├── validators/        # OpenAPI validation
│   └── utils/             # Utility functions
├── storage/               # Git-based specification storage
├── ui/                    # Swagger UI and documentation frontend
├── tests/                 # Test suite
├── Dockerfile             # Docker configuration
├── package.json           # Dependencies
└── README.md              # Documentation
```
