/**
 * Unit tests for Database Models - API Registry PDS 2.2
 */

const { Service, ApiSpecification, ServiceHealthLog, AUTHENTICATION_TYPES, SERVICE_CATEGORIES, SERVICE_STATUS } = require('../../src/database/models');

describe('Database Models', () => {
    describe('Service Model', () => {
        test('should create a valid service with required fields', async () => {
            const serviceData = global.testUtils.generateTestService();
            const service = new Service(serviceData);

            await expect(service.save()).resolves.toBeDefined();
            expect(service.name).toBe(serviceData.name);
            expect(service.authentication.type).toBe('solid-oidc-like');
            expect(service.status).toBe('active');
        });

        test('should enforce unique service names', async () => {
            const serviceData = global.testUtils.generateTestService({ name: 'duplicate-service' });

            const service1 = new Service(serviceData);
            await service1.save();

            const service2 = new Service(serviceData);
            await expect(service2.save()).rejects.toThrow();
        });

        test('should validate authentication types', async () => {
            const serviceData = global.testUtils.generateTestService({
                authentication: {
                    type: 'invalid-auth-type',
                    metadata: {}
                }
            });

            const service = new Service(serviceData);
            await expect(service.save()).rejects.toThrow();
        });

        test('should validate DID format', async () => {
            const serviceData = global.testUtils.generateTestService({
                did: 'invalid-did-format'
            });

            const service = new Service(serviceData);
            await expect(service.save()).rejects.toThrow();
        });

        test('should accept valid DID formats', async () => {
            const validDids = [
                'did:web:example.com',
                'did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xRoAnwWsdvktH',
                'did:ethr:0x1234567890123456789012345678901234567890'
            ];

            for (const did of validDids) {
                const serviceData = global.testUtils.generateTestService({
                    name: `service-${Date.now()}-${Math.random()}`,
                    did
                });
                const service = new Service(serviceData);
                await expect(service.save()).resolves.toBeDefined();
            }
        });

        test('should validate base URL format', async () => {
            const serviceData = global.testUtils.generateTestService({
                baseUrl: 'invalid-url'
            });

            const service = new Service(serviceData);
            await expect(service.save()).rejects.toThrow();
        });

        test('should update timestamps on save', async () => {
            const serviceData = global.testUtils.generateTestService();
            const service = new Service(serviceData);

            const saved = await service.save();
            const originalUpdatedAt = saved.updatedAt;

            // Wait a bit and update
            await new Promise(resolve => setTimeout(resolve, 10));
            saved.description = 'Updated description';
            await saved.save();

            expect(saved.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });

        test('should set default values correctly', async () => {
            const serviceData = {
                name: 'minimal-service',
                displayName: 'Minimal Service',
                description: 'A minimal service',
                category: 'other',
                baseUrl: 'http://localhost:3000',
                healthCheckUrl: 'http://localhost:3000/health',
                authentication: {
                    type: 'solid-oidc-like',
                    metadata: {}
                }
            };

            const service = new Service(serviceData);
            await service.save();

            expect(service.status).toBe('active');
            expect(service.version).toBe('1.0.0');
            expect(service.minimumPdsVersion).toBe('2.2.0');
            expect(service.webidSupport.enabled).toBe(false);
            expect(service.health.status).toBe('unknown');
        });
    });

    describe('ApiSpecification Model', () => {
        let testService;

        beforeEach(async () => {
            const serviceData = global.testUtils.generateTestService();
            testService = await Service.create(serviceData);
        });

        test('should create valid API specification', async () => {
            const specData = global.testUtils.generateTestApiSpec(testService._id);
            const spec = new ApiSpecification(specData);

            await expect(spec.save()).resolves.toBeDefined();
            expect(spec.serviceId.toString()).toBe(testService._id.toString());
            expect(spec.specification.openapi).toBe('3.0.0');
        });

        test('should enforce unique service-version combination', async () => {
            const specData = global.testUtils.generateTestApiSpec(testService._id, {
                name: 'test-api',
                version: '1.0.0'
            });

            const spec1 = new ApiSpecification(specData);
            await spec1.save();

            const spec2 = new ApiSpecification(specData);
            await expect(spec2.save()).rejects.toThrow();
        });

        test('should validate OpenAPI specification format', async () => {
            const specData = global.testUtils.generateTestApiSpec(testService._id, {
                specification: {
                    // Missing required openapi field
                    info: { title: 'Test', version: '1.0.0' }
                }
            });

            const spec = new ApiSpecification(specData);
            await expect(spec.save()).rejects.toThrow();
        });

        test('should extract endpoints correctly', async () => {
            const specData = global.testUtils.generateTestApiSpec(testService._id);
            const spec = new ApiSpecification(specData);
            await spec.save();

            expect(spec.endpoints).toHaveLength(1);
            expect(spec.endpoints[0].path).toBe('/test');
            expect(spec.endpoints[0].method).toBe('GET');
            expect(spec.endpoints[0].operationId).toBe('getTest');
        });

        test('should handle population of service reference', async () => {
            const specData = global.testUtils.generateTestApiSpec(testService._id);
            const spec = await ApiSpecification.create(specData);

            const populatedSpec = await ApiSpecification
                .findById(spec._id)
                .populate('serviceId');

            expect(populatedSpec.serviceId.name).toBe(testService.name);
        });
    });

    describe('ServiceHealthLog Model', () => {
        let testService;

        beforeEach(async () => {
            const serviceData = global.testUtils.generateTestService();
            testService = await Service.create(serviceData);
        });

        test('should create health log entry', async () => {
            const healthData = {
                serviceId: testService._id,
                status: 'healthy',
                responseTime: 150,
                checkedAt: new Date()
            };

            const healthLog = new ServiceHealthLog(healthData);
            await expect(healthLog.save()).resolves.toBeDefined();
            expect(healthLog.status).toBe('healthy');
            expect(healthLog.responseTime).toBe(150);
        });

        test('should validate health status values', async () => {
            const healthData = {
                serviceId: testService._id,
                status: 'invalid-status'
            };

            const healthLog = new ServiceHealthLog(healthData);
            await expect(healthLog.save()).rejects.toThrow();
        });

        test('should set default checkedAt timestamp', async () => {
            const healthData = {
                serviceId: testService._id,
                status: 'healthy'
            };

            const healthLog = new ServiceHealthLog(healthData);
            await healthLog.save();

            expect(healthLog.checkedAt).toBeInstanceOf(Date);
            expect(healthLog.checkedAt.getTime()).toBeLessThanOrEqual(Date.now());
        });
    });

    describe('Model Constants', () => {
        test('should export correct authentication types', () => {
            expect(AUTHENTICATION_TYPES).toEqual({
                SOLID_OIDC: 'solid-oidc-like',
                DID_CHALLENGE_RESPONSE: 'did-challenge-response',
                HYBRID: 'hybrid'
            });
        });

        test('should export correct service categories', () => {
            expect(SERVICE_CATEGORIES.GOVERNMENT).toBe('government');
            expect(SERVICE_CATEGORIES.UTILITY).toBe('utility');
            expect(SERVICE_CATEGORIES.OTHER).toBe('other');
        });

        test('should export correct service status values', () => {
            expect(SERVICE_STATUS.ACTIVE).toBe('active');
            expect(SERVICE_STATUS.INACTIVE).toBe('inactive');
            expect(SERVICE_STATUS.DEPRECATED).toBe('deprecated');
        });
    });
});
