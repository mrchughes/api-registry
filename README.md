# API Registry Service

This service provides a centralized registry for API specifications across all microservices in the Solid Microservices ecosystem. It allows services to publish their OpenAPI specifications and other services to discover and consume these specifications.

## Implementation

This repository contains a complete implementation of the API Registry Service following the specification in [SPECIFICATION.md](SPECIFICATION.md). For detailed implementation information, see [README-IMPLEMENTATION.md](README-IMPLEMENTATION.md).

## Key Features

- Registry for OpenAPI specifications
- Service registration and discovery
- API versioning support with semantic versioning
- Specification validation against OpenAPI standards
- Interactive API documentation with Swagger UI
- API browsing interface with GOV.UK Design System compliance
- Version control with Git
- Authentication for secure operations

## Benefits

1. **Single Source of Truth**: All services can reference the same API specifications
2. **Discoverability**: New services can easily find and understand existing APIs
3. **Contract Testing**: Services can validate their implementations against the registered specifications
4. **Documentation**: Auto-generated, always up-to-date API documentation
5. **Change Management**: Track API changes and notify dependent services

## Architecture

The API Registry follows a microservice architecture:

- RESTful API for publishing and retrieving specifications
- Service registration and management
- Git-based storage for version control of specifications
- OpenAPI validation for quality control
- Swagger UI for interactive documentation
- GOV.UK Design System compliant UI for browsing APIs

## Usage Workflow

1. **Publishing**:
   - When a service is developed or updated, it is registered in the API Registry
   - The service's OpenAPI specification is published to the API Registry
   - The Registry validates the specification and stores it with version information

2. **Discovery**:
   - Services can query the Registry to discover available APIs
   - Services can retrieve specific API specifications by service name and version
   - Services can always get the latest version of an API

3. **Development**:
   - Developers can browse available APIs through the interactive UI
   - API documentation is available through Swagger UI
   - Service details provide information about available API versions

4. **Testing**:
   - Services can use the specifications for contract testing
   - Services can validate their OpenAPI specifications before publishing

## Folder Structure

```
api-registry/
├── src/                     # Source code
│   ├── controllers/         # Request handlers
│   ├── routes/              # API routes
│   ├── services/            # Business logic
│   ├── utils/               # Utility functions
│   ├── validators/          # Input validators
│   ├── lib/                 # Shared libraries
│   ├── index.js             # Application entry point
│   └── openapi.yaml         # API specification for this service
├── storage/                 # Persistent storage
│   ├── specs/               # API specifications storage
│   └── services/            # Services registry storage
├── public/                  # Static assets for UI
├── logs/                    # Application logs
├── tests/                   # Test files
│   ├── unit/                # Unit tests
│   └── integration/         # Integration tests
├── docs/                    # Documentation
├── .env                     # Environment variables
├── package.json             # Dependencies and scripts
└── README.md                # This file
```

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Configure environment variables in `.env`
4. Start the service: `npm start`
5. Open http://localhost:3005 in your browser

For more details on implementation and usage, see [README-IMPLEMENTATION.md](README-IMPLEMENTATION.md).

## API Documentation

The API documentation is available at http://localhost:3005/api-docs when the service is running.

## UI for Browsing APIs

The UI for browsing available APIs is available at http://localhost:3005/ui when the service is running.
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
