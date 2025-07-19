/**
 * Database Migration for API Registry PDS 2.2
 * Migrates from legacy file-based storage to MongoDB and removes old API details
 */

const path = require('path');
const fs = require('fs');
const winston = require('winston');
const { database } = require('./connection');
const { Service, ApiSpecification, AUTHENTICATION_TYPES, SERVICE_CATEGORIES, SERVICE_STATUS } = require('./models');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/migration.log' })
    ]
});

class DatabaseMigration {
    constructor() {
        this.legacyStoragePath = path.join(__dirname, '../../storage');
        this.legacySpecsPath = path.join(this.legacyStoragePath, 'specs');
        this.legacyServicesPath = path.join(this.legacyStoragePath, 'services');
    }

    async migrate() {
        try {
            logger.info('🚀 Starting API Registry PDS 2.2 migration...');

            // Connect to database
            await database.connect();

            // Clean existing data
            await this.cleanExistingData();

            // Migrate legacy file-based services if they exist
            await this.migrateLegacyServices();

            // Migrate legacy API specifications if they exist
            await this.migrateLegacySpecs();

            // Create PDS 2.2 seed data
            await this.createSeedData();

            // Clean up legacy files
            await this.cleanupLegacyFiles();

            logger.info('✅ Migration completed successfully');

        } catch (error) {
            logger.error('❌ Migration failed:', error);
            throw error;
        }
    }

    async cleanExistingData() {
        logger.info('🧹 Cleaning existing database data...');

        try {
            await Service.deleteMany({});
            await ApiSpecification.deleteMany({});

            logger.info('✅ Existing data cleaned');
        } catch (error) {
            logger.error('❌ Error cleaning existing data:', error);
            throw error;
        }
    }

    async migrateLegacyServices() {
        logger.info('📋 Migrating legacy services...');

        if (!fs.existsSync(this.legacyServicesPath)) {
            logger.info('No legacy services directory found, skipping...');
            return;
        }

        try {
            const serviceFiles = fs.readdirSync(this.legacyServicesPath)
                .filter(file => file.endsWith('.json'));

            for (const file of serviceFiles) {
                const filePath = path.join(this.legacyServicesPath, file);
                const legacyService = JSON.parse(fs.readFileSync(filePath, 'utf8'));

                // Convert legacy service to PDS 2.2 format
                const modernService = this.convertLegacyService(legacyService);

                if (modernService) {
                    await Service.create(modernService);
                    logger.info(`✅ Migrated service: ${modernService.name}`);
                }
            }
        } catch (error) {
            logger.error('❌ Error migrating legacy services:', error);
            // Don't throw - continue with migration
        }
    }

    async migrateLegacySpecs() {
        logger.info('📋 Migrating legacy API specifications...');

        if (!fs.existsSync(this.legacySpecsPath)) {
            logger.info('No legacy specs directory found, skipping...');
            return;
        }

        try {
            const specFiles = fs.readdirSync(this.legacySpecsPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);

            for (const serviceName of specFiles) {
                const serviceSpecsPath = path.join(this.legacySpecsPath, serviceName);
                const versionDirs = fs.readdirSync(serviceSpecsPath, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);

                for (const version of versionDirs) {
                    const specPath = path.join(serviceSpecsPath, version, 'openapi.json');

                    if (fs.existsSync(specPath)) {
                        const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));

                        // Find or create service
                        let service = await Service.findOne({ name: serviceName });
                        if (!service) {
                            service = await this.createServiceFromSpec(serviceName, spec);
                        }

                        // Create API specification
                        await this.createApiSpecification(service._id, spec, version);
                        logger.info(`✅ Migrated spec: ${serviceName} v${version}`);
                    }
                }
            }
        } catch (error) {
            logger.error('❌ Error migrating legacy specs:', error);
            // Don't throw - continue with migration
        }
    }

    convertLegacyService(legacyService) {
        try {
            // Determine authentication type based on legacy data
            let authType = AUTHENTICATION_TYPES.SOLID_OIDC;
            if (legacyService.did || legacyService.didDocument) {
                authType = AUTHENTICATION_TYPES.DID_CHALLENGE_RESPONSE;
            }

            // Determine category based on service name/description
            let category = SERVICE_CATEGORIES.OTHER;
            const name = legacyService.name?.toLowerCase() || '';
            if (name.includes('dro') || name.includes('government')) {
                category = SERVICE_CATEGORIES.GOVERNMENT;
            } else if (name.includes('electric') || name.includes('utility')) {
                category = SERVICE_CATEGORIES.UTILITY;
            }

            return {
                name: legacyService.name || 'unknown-service',
                displayName: legacyService.displayName || legacyService.name || 'Unknown Service',
                description: legacyService.description || 'Migrated from legacy registry',
                category,
                baseUrl: legacyService.baseUrl || legacyService.url || 'http://localhost:3000',
                healthCheckUrl: `${legacyService.baseUrl || 'http://localhost:3000'}/health`,

                authentication: {
                    type: authType,
                    metadata: {
                        supportedScopes: ['vc:issue', 'vc:read', 'vc:revoke'],
                        supportedGrantTypes: ['authorization_code', 'refresh_token'],
                        supportedResponseTypes: ['code']
                    }
                },

                webidSupport: {
                    enabled: true,
                    credentialOperations: {
                        issue: true,
                        read: true,
                        revoke: true
                    },
                    supportedCredentialTypes: ['VerifiableCredential'],
                    credentialFormats: ['application/ld+json']
                },

                did: legacyService.did,
                didDocument: legacyService.didDocument,

                status: SERVICE_STATUS.ACTIVE,
                version: legacyService.version || '1.0.0',
                minimumPdsVersion: '2.2.0',

                compliance: {
                    govukDesignSystem: category === SERVICE_CATEGORIES.GOVERNMENT,
                    wcagAA: true,
                    solidProtocol: true,
                    w3cVC: true
                },

                registeredBy: {
                    name: 'Migration Script',
                    organization: 'PDS 2.2'
                }
            };
        } catch (error) {
            logger.warn(`Warning: Could not convert legacy service:`, error);
            return null;
        }
    }

    async createServiceFromSpec(serviceName, spec) {
        const service = new Service({
            name: serviceName,
            displayName: spec.info?.title || serviceName,
            description: spec.info?.description || 'Migrated from legacy API specification',
            category: SERVICE_CATEGORIES.OTHER,
            baseUrl: spec.servers?.[0]?.url || 'http://localhost:3000',
            healthCheckUrl: `${spec.servers?.[0]?.url || 'http://localhost:3000'}/health`,

            authentication: {
                type: AUTHENTICATION_TYPES.SOLID_OIDC,
                metadata: {
                    supportedScopes: ['vc:issue', 'vc:read', 'vc:revoke'],
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

            status: SERVICE_STATUS.ACTIVE,
            version: spec.info?.version || '1.0.0',
            minimumPdsVersion: '2.2.0',

            registeredBy: {
                name: 'Migration Script',
                organization: 'PDS 2.2'
            }
        });

        return await service.save();
    }

    async createApiSpecification(serviceId, spec, version) {
        // Extract endpoints from spec
        const endpoints = [];
        if (spec.paths) {
            for (const [path, pathItem] of Object.entries(spec.paths)) {
                for (const [method, operation] of Object.entries(pathItem)) {
                    if (typeof operation === 'object' && operation.operationId) {
                        endpoints.push({
                            path,
                            method: method.toUpperCase(),
                            operationId: operation.operationId,
                            summary: operation.summary,
                            tags: operation.tags || [],
                            authRequired: operation.security ? operation.security.length > 0 : false
                        });
                    }
                }
            }
        }

        const apiSpec = new ApiSpecification({
            serviceId,
            name: spec.info?.title || 'Unknown API',
            version,
            specification: spec,
            description: spec.info?.description,
            endpoints,
            tags: spec.tags?.map(tag => tag.name) || [],
            isLatest: true // Will be updated later if newer versions exist
        });

        return await apiSpec.save();
    }

    async createSeedData() {
        logger.info('🌱 Creating PDS 2.2 seed data...');

        try {
            // Create API Registry service itself
            const apiRegistryService = new Service({
                name: 'api-registry',
                displayName: 'API Registry Service',
                description: 'Centralized repository for API specifications and service discovery in PDS 2.2',
                category: SERVICE_CATEGORIES.OTHER,
                baseUrl: process.env.BASE_URL || 'http://localhost:3005',
                healthCheckUrl: `${process.env.BASE_URL || 'http://localhost:3005'}/health`,

                authentication: {
                    type: AUTHENTICATION_TYPES.SOLID_OIDC,
                    metadata: {
                        supportedScopes: ['registry:read', 'registry:write', 'registry:admin'],
                        supportedGrantTypes: ['authorization_code', 'client_credentials'],
                        supportedResponseTypes: ['code']
                    }
                },

                webidSupport: {
                    enabled: true,
                    credentialOperations: {
                        issue: false,
                        read: true,
                        revoke: false
                    }
                },

                status: SERVICE_STATUS.ACTIVE,
                version: '2.2.0',
                minimumPdsVersion: '2.2.0',

                compliance: {
                    govukDesignSystem: true,
                    wcagAA: true,
                    solidProtocol: true,
                    w3cVC: true
                },

                registeredBy: {
                    name: 'System',
                    organization: 'PDS 2.2'
                }
            });

            await apiRegistryService.save();
            logger.info('✅ Created API Registry service entry');

        } catch (error) {
            logger.error('❌ Error creating seed data:', error);
            throw error;
        }
    }

    async cleanupLegacyFiles() {
        logger.info('🧹 Cleaning up legacy files...');

        try {
            // Move legacy files to backup directory instead of deleting
            const backupDir = path.join(__dirname, '../../legacy-backup');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            if (fs.existsSync(this.legacyStoragePath)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupPath = path.join(backupDir, `storage-${timestamp}`);

                fs.renameSync(this.legacyStoragePath, backupPath);
                logger.info(`✅ Legacy files moved to: ${backupPath}`);
            }

        } catch (error) {
            logger.warn('⚠️ Could not cleanup legacy files:', error);
            // Don't throw - migration is complete
        }
    }
}

// Run migration if called directly
if (require.main === module) {
    const migration = new DatabaseMigration();
    migration.migrate()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = DatabaseMigration;
