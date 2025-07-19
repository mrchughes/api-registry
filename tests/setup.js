/**
 * Test setup for API Registry PDS 2.2
 * Configures global test environment and utilities
 */

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Global test utilities
global.testUtils = {
    // Generate test service data
    generateTestService: (overrides = {}) => ({
        name: `test-service-${Date.now()}`,
        displayName: 'Test Service',
        description: 'A test service for unit testing',
        category: 'other',
        baseUrl: 'http://localhost:3000',
        healthCheckUrl: 'http://localhost:3000/health',

        authentication: {
            type: 'solid-oidc-like',
            metadata: {
                supportedScopes: ['vc:issue', 'vc:read'],
                supportedGrantTypes: ['authorization_code'],
                supportedResponseTypes: ['code']
            }
        },

        webidSupport: {
            enabled: true,
            credentialOperations: {
                issue: true,
                read: true,
                revoke: false
            }
        },

        status: 'active',
        version: '1.0.0',
        minimumPdsVersion: '2.2.0',

        registeredBy: {
            name: 'Test Suite',
            organization: 'Test Org'
        },
        ...overrides
    }),

    // Generate test API specification
    generateTestApiSpec: (serviceId, overrides = {}) => ({
        serviceId,
        name: 'Test API',
        version: '1.0.0',
        specification: {
            openapi: '3.0.0',
            info: {
                title: 'Test API',
                version: '1.0.0',
                description: 'A test API specification'
            },
            paths: {
                '/test': {
                    get: {
                        operationId: 'getTest',
                        summary: 'Get test data',
                        responses: {
                            '200': {
                                description: 'Success'
                            }
                        }
                    }
                }
            }
        },
        description: 'Test API specification',
        endpoints: [{
            path: '/test',
            method: 'GET',
            operationId: 'getTest',
            summary: 'Get test data',
            tags: ['test'],
            authRequired: false
        }],
        tags: ['test'],
        isLatest: true,
        ...overrides
    }),

    // Wait for database operations
    waitForDatabase: async (timeout = 5000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (mongoose.connection.readyState === 1) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        throw new Error('Database connection timeout');
    },

    // Clean test database
    cleanDatabase: async () => {
        const collections = mongoose.connection.collections;
        for (const key in collections) {
            const collection = collections[key];
            await collection.deleteMany({});
        }
    }
};

// Setup test database before all tests
beforeAll(async () => {
    // Start in-memory MongoDB instance
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    // Connect to test database
    await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });
}, 30000);

// Clean up after each test
afterEach(async () => {
    await global.testUtils.cleanDatabase();
});

// Teardown after all tests
afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
    await mongoServer.stop();
}, 30000);

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Configure test timeout
jest.setTimeout(30000);
