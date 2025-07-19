/**
 * Comprehensive Integration Tests for API Registry PDS 2.2
 * Tests the complete service lifecycle including schema alignment,
 * database persistence, and production readiness.
 */

const request = require('supertest');
const mongoose = require('mongoose');
const { Service, ApiSpecification } = require('../src/database/models');
const { connectDatabase } = require('../src/database/connection');

describe('API Registry PDS 2.2 - Production Integration Tests', () => {
    let app;
    let testServiceId;

    beforeAll(async () => {
        // Set test environment
        process.env.NODE_ENV = 'test';
        process.env.USE_MEMORY_DB = 'true';

        // Import app after setting environment
        app = require('../src/index');

        // Connect to test database
        await connectDatabase();

        // Clear test data
        await Service.deleteMany({});
        await ApiSpecification.deleteMany({});
    });

    afterAll(async () => {
        await mongoose.connection.close();
    });

    describe('Schema Alignment Tests', () => {
        test('should register service via API with new schema', async () => {
            const serviceData = {
                name: 'test-government-service',
                displayName: 'Test Government Service',
                description: 'A test service for validating PDS 2.2 compliance',
                category: 'government',
                baseUrl: 'https://test.gov.uk/api',
                healthCheckUrl: 'https://test.gov.uk/api/health',
                authenticationType: 'solid-oidc-like',
                version: '2.1.0',
                webId: 'https://test.gov.uk/profile#service',
                contactEmail: 'support@test.gov.uk',
                documentation: 'https://test.gov.uk/docs',
                capabilities: 'data-read,data-write,identity-verification',
                dataTypes: 'citizen-data,application-data'
            };

            const response = await request(app)
                .post('/api/v1/services')
                .send(serviceData)
                .expect(201);

            expect(response.body.message).toBe('Service registered successfully');
            expect(response.body.service).toHaveProperty('_id');
            expect(response.body.service.name).toBe(serviceData.name);

            testServiceId = response.body.service._id;
        });

        test('should retrieve service with correct schema structure', async () => {
            const response = await request(app)
                .get(`/api/v1/services/${testServiceId}`)
                .expect(200);

            const service = response.body;

            // Validate new schema structure
            expect(service).toHaveProperty('name', 'test-government-service');
            expect(service).toHaveProperty('displayName', 'Test Government Service');
            expect(service).toHaveProperty('category', 'government');
            expect(service).toHaveProperty('authentication');
            expect(service.authentication).toHaveProperty('type', 'solid-oidc-like');
            expect(service).toHaveProperty('webidSupport');
            expect(service.webidSupport.enabled).toBe(true);
            expect(service).toHaveProperty('contactInfo');
            expect(service.contactInfo.email).toBe('support@test.gov.uk');
        });

        test('should handle UI form submission with new schema', async () => {
            const formData = {
                name: 'ui-test-service',
                displayName: 'UI Test Service',
                description: 'Service registered via UI form',
                category: 'healthcare',
                baseUrl: 'https://ui-test.nhs.uk',
                healthCheckUrl: 'https://ui-test.nhs.uk/health',
                authenticationType: 'did-challenge-response',
                version: '1.5.0',
                contactEmail: 'admin@nhs.uk'
            };

            const response = await request(app)
                .post('/services/new')
                .send(formData)
                .expect(302); // Should redirect after successful registration

            expect(response.headers.location).toMatch(/\/services\/[a-f0-9]{24}/);
        });
    });

    describe('Database Persistence Tests', () => {
        test('should persist service data correctly in MongoDB', async () => {
            // Direct database check
            const service = await Service.findById(testServiceId);

            expect(service).toBeTruthy();
            expect(service.name).toBe('test-government-service');
            expect(service.authentication.type).toBe('solid-oidc-like');
            expect(service.capabilities).toContain('data-read');
            expect(service.capabilities).toContain('data-write');
            expect(service.capabilities).toContain('identity-verification');
        });

        test('should maintain data integrity across server restarts', async () => {
            // Simulate server restart by reconnecting
            await mongoose.connection.close();
            await connectDatabase();

            const service = await Service.findById(testServiceId);
            expect(service).toBeTruthy();
            expect(service.name).toBe('test-government-service');
        });

        test('should handle complex queries with new schema', async () => {
            const response = await request(app)
                .get('/api/v1/services')
                .query({
                    category: 'government',
                    authType: 'solid-oidc-like',
                    limit: 10
                })
                .expect(200);

            expect(response.body.services).toBeDefined();
            expect(response.body.services.length).toBeGreaterThan(0);
            expect(response.body.services[0].category).toBe('government');
            expect(response.body.services[0].authentication.type).toBe('solid-oidc-like');
        });
    });

    describe('Standards Compliance Tests', () => {
        test('should support WebID-centric discovery', async () => {
            const webId = 'https://test.gov.uk/profile#service';

            const response = await request(app)
                .get('/api/v1/discovery')
                .query({ webId })
                .expect(200);

            expect(response.body.services).toBeDefined();
            const foundService = response.body.services.find(s =>
                s.webidSupport && s.webidSupport.webidEndpoint === webId
            );
            expect(foundService).toBeTruthy();
        });

        test('should validate authentication types according to PDS 2.2', async () => {
            const invalidData = {
                name: 'invalid-auth-service',
                displayName: 'Invalid Auth Service',
                description: 'Service with invalid auth type',
                category: 'utility',
                baseUrl: 'https://invalid.example.com',
                healthCheckUrl: 'https://invalid.example.com/health',
                authenticationType: 'invalid-auth-type', // Invalid
                version: '1.0.0'
            };

            await request(app)
                .post('/api/v1/services')
                .send(invalidData)
                .expect(400);
        });

        test('should enforce category restrictions', async () => {
            const invalidCategory = {
                name: 'invalid-category-service',
                displayName: 'Invalid Category Service',
                description: 'Service with invalid category',
                category: 'invalid-category', // Invalid
                baseUrl: 'https://invalid.example.com',
                healthCheckUrl: 'https://invalid.example.com/health',
                authenticationType: 'solid-oidc-like',
                version: '1.0.0'
            };

            await request(app)
                .post('/api/v1/services')
                .send(invalidCategory)
                .expect(400);
        });
    });

    describe('Production Readiness Tests', () => {
        test('should handle concurrent requests without conflicts', async () => {
            const promises = Array.from({ length: 5 }, (_, i) =>
                request(app)
                    .post('/api/v1/services')
                    .send({
                        name: `concurrent-service-${i}`,
                        displayName: `Concurrent Service ${i}`,
                        description: 'Service for concurrency testing',
                        category: 'utility',
                        baseUrl: `https://concurrent${i}.example.com`,
                        healthCheckUrl: `https://concurrent${i}.example.com/health`,
                        authenticationType: 'hybrid',
                        version: '1.0.0'
                    })
            );

            const responses = await Promise.all(promises);
            responses.forEach(response => {
                expect(response.status).toBe(201);
            });
        });

        test('should provide comprehensive health check', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body).toHaveProperty('status', 'ok');
            expect(response.body).toHaveProperty('service', 'api-registry');
            expect(response.body).toHaveProperty('database');
            expect(response.body.database).toHaveProperty('status');
            expect(response.body).toHaveProperty('uptime');
            expect(response.body).toHaveProperty('memory');
        });

        test('should support pagination and filtering', async () => {
            const response = await request(app)
                .get('/api/v1/services')
                .query({
                    limit: 2,
                    offset: 0,
                    category: 'utility',
                    sort: 'registeredAt',
                    order: 'desc'
                })
                .expect(200);

            expect(response.body).toHaveProperty('services');
            expect(response.body).toHaveProperty('pagination');
            expect(response.body.pagination).toHaveProperty('total');
            expect(response.body.pagination).toHaveProperty('hasNext');
            expect(response.body.pagination).toHaveProperty('hasPrev');
            expect(response.body.services.length).toBeLessThanOrEqual(2);
        });

        test('should handle service updates correctly', async () => {
            const updateData = {
                description: 'Updated service description',
                status: 'maintenance'
            };

            const response = await request(app)
                .put(`/api/v1/services/${testServiceId}`)
                .send(updateData)
                .expect(200);

            expect(response.body.description).toBe(updateData.description);
            expect(response.body.status).toBe(updateData.status);
        });

        test('should maintain audit trail', async () => {
            // Check that service has timestamps
            const service = await Service.findById(testServiceId);
            expect(service.createdAt).toBeDefined();
            expect(service.updatedAt).toBeDefined();
            expect(service.registeredAt).toBeDefined();
        });
    });

    describe('Error Handling and Resilience', () => {
        test('should handle duplicate service registration gracefully', async () => {
            const duplicateData = {
                name: 'test-government-service', // Already exists
                displayName: 'Duplicate Service',
                description: 'This should fail',
                category: 'government',
                baseUrl: 'https://duplicate.gov.uk',
                healthCheckUrl: 'https://duplicate.gov.uk/health',
                authenticationType: 'solid-oidc-like',
                version: '1.0.0'
            };

            const response = await request(app)
                .post('/api/v1/services')
                .send(duplicateData)
                .expect(409);

            expect(response.body.error).toBe('service_conflict');
            expect(response.body.conflictField).toBe('name');
        });

        test('should validate required fields', async () => {
            const incompleteData = {
                name: 'incomplete-service'
                // Missing required fields
            };

            const response = await request(app)
                .post('/api/v1/services')
                .send(incompleteData)
                .expect(400);

            expect(response.body.error).toBe('validation_error');
            expect(response.body.details).toBeDefined();
        });

        test('should handle malformed requests', async () => {
            await request(app)
                .post('/api/v1/services')
                .send('invalid json')
                .expect(400);
        });
    });
});

module.exports = {};
