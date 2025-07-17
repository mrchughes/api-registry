# PDS Common Libraries

This repository contains shared libraries and utilities for the PDS 2.0 system, focused on DID operations, authentication, and common functionality.

## Directory Structure

- **src/** - Source code for shared libraries
  - **did/** - DID document handling, verification, and resolution
  - **auth/** - Authentication, challenge-response, and token handling
  - **utils/** - Common utilities and helper functions
- **examples/** - Example implementations and usage patterns
- **tests/** - Test suites for all shared libraries

## Usage

This repository can be used in two ways:

### 1. As a Git Submodule

Add this repository as a Git submodule in your service:

```bash
git submodule add https://github.com/your-org/pds-common.git lib/pds-common
```

### 2. As an NPM Package

Install from your private registry:

```bash
npm install @your-org/pds-common
```

## Features

- DID document creation and validation
- Challenge-response authentication
- OAuth token handling with DID-based authentication
- WebID resolution and validation
- Common error handling utilities

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build package
npm run build
```
