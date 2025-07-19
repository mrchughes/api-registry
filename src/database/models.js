/**
 * Database Models for API Registry PDS 2.2
 * Supports WebID-centric service discovery and dual authentication flows
 */

const mongoose = require('mongoose');
const { Schema } = mongoose;

// Service Authentication Types for PDS 2.2
const AUTHENTICATION_TYPES = {
    SOLID_OIDC: 'solid-oidc-like',
    DID_CHALLENGE_RESPONSE: 'did-challenge-response',
    HYBRID: 'hybrid'
};

// Service Categories
const SERVICE_CATEGORIES = {
    GOVERNMENT: 'government',
    UTILITY: 'utility',
    HEALTHCARE: 'healthcare',
    EDUCATION: 'education',
    FINANCIAL: 'financial',
    OTHER: 'other'
};

// Service Status
const SERVICE_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    MAINTENANCE: 'maintenance',
    DEPRECATED: 'deprecated'
};

// API Specification Schema
const apiSpecificationSchema = new Schema({
    serviceId: {
        type: Schema.Types.ObjectId,
        ref: 'Service',
        required: true,
        index: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    version: {
        type: String,
        required: true,
        trim: true
    },
    specification: {
        type: Schema.Types.Mixed,
        required: true,
        validate: {
            validator: function (spec) {
                return spec && typeof spec === 'object' && spec.openapi;
            },
            message: 'Specification must be a valid OpenAPI document'
        }
    },
    description: {
        type: String,
        trim: true
    },
    endpoints: [{
        path: { type: String, required: true },
        method: { type: String, required: true, uppercase: true },
        operationId: String,
        summary: String,
        tags: [String],
        authRequired: { type: Boolean, default: false },
        scopes: [String]
    }],
    tags: [String],
    isLatest: {
        type: Boolean,
        default: false
    },
    isDeprecated: {
        type: Boolean,
        default: false
    },
    deprecationDate: Date,
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Service Registry Schema for PDS 2.2
const serviceSchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        index: true
    },
    displayName: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    category: {
        type: String,
        enum: Object.values(SERVICE_CATEGORIES),
        required: true,
        index: true
    },
    baseUrl: {
        type: String,
        required: true,
        trim: true,
        validate: {
            validator: function (url) {
                return /^https?:\/\/.+/.test(url);
            },
            message: 'Base URL must be a valid HTTP/HTTPS URL'
        }
    },
    healthCheckUrl: {
        type: String,
        required: true,
        trim: true
    },

    // PDS 2.2 Authentication Configuration
    authentication: {
        type: {
            type: String,
            enum: Object.values(AUTHENTICATION_TYPES),
            required: true,
            index: true
        },
        metadata: {
            // For SOLID_OIDC services
            oidcIssuer: String,
            authorizationEndpoint: String,
            tokenEndpoint: String,
            userinfoEndpoint: String,

            // For DID_CHALLENGE_RESPONSE services
            didDocument: String,
            challengeEndpoint: String,

            // Common metadata
            supportedScopes: [String],
            supportedGrantTypes: [String],
            supportedResponseTypes: [String],
            tokenEndpointAuthMethods: [String]
        }
    },

    // WebID and Credential Support
    webidSupport: {
        enabled: { type: Boolean, default: false },
        webidEndpoint: String,
        credentialOperations: {
            issue: { type: Boolean, default: false },
            read: { type: Boolean, default: false },
            revoke: { type: Boolean, default: false }
        },
        supportedCredentialTypes: [String],
        credentialFormats: [String]
    },

    // DID Information
    did: {
        type: String,
        trim: true,
        index: true,
        validate: {
            validator: function (did) {
                return !did || /^did:(web|key|ethr):.+/.test(did);
            },
            message: 'DID must be a valid DID identifier'
        }
    },
    didDocument: Schema.Types.Mixed,

    // Service Status and Health
    status: {
        type: String,
        enum: Object.values(SERVICE_STATUS),
        default: SERVICE_STATUS.ACTIVE,
        index: true
    },
    health: {
        status: {
            type: String,
            enum: ['healthy', 'unhealthy', 'unknown'],
            default: 'unknown'
        },
        lastCheck: Date,
        responseTime: Number,
        errorMessage: String,
        uptime: Number
    },

    // Registration and Contact Information
    registeredBy: {
        name: String,
        email: String,
        organization: String
    },
    contactInfo: {
        email: String,
        phone: String,
        supportUrl: String,
        documentationUrl: String
    },

    // Versioning and Lifecycle
    version: {
        type: String,
        required: true,
        default: '1.0.0'
    },
    apiVersion: String,
    minimumPdsVersion: {
        type: String,
        default: '2.2.0'
    },

    // Compliance and Standards
    compliance: {
        govukDesignSystem: { type: Boolean, default: false },
        wcagAA: { type: Boolean, default: false },
        solidProtocol: { type: Boolean, default: false },
        w3cVC: { type: Boolean, default: false }
    },

    // Metadata
    tags: [String],
    lastRegistration: {
        type: Date,
        default: Date.now
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Service Health Log Schema
const serviceHealthLogSchema = new Schema({
    serviceId: {
        type: Schema.Types.ObjectId,
        ref: 'Service',
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['healthy', 'unhealthy', 'unknown'],
        required: true
    },
    responseTime: Number,
    errorMessage: String,
    metadata: Schema.Types.Mixed,
    checkedAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Service Discovery Cache Schema
const serviceDiscoverySchema = new Schema({
    query: {
        type: String,
        required: true,
        index: true
    },
    queryType: {
        type: String,
        enum: ['authentication', 'capability', 'credential-type', 'webid-support'],
        required: true
    },
    results: [{
        serviceId: { type: Schema.Types.ObjectId, ref: 'Service' },
        relevanceScore: Number,
        metadata: Schema.Types.Mixed
    }],
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 3600 // Cache for 1 hour
    }
});

// API Usage Analytics Schema
const apiUsageSchema = new Schema({
    serviceId: {
        type: Schema.Types.ObjectId,
        ref: 'Service',
        required: true,
        index: true
    },
    specificationId: {
        type: Schema.Types.ObjectId,
        ref: 'ApiSpecification',
        index: true
    },
    endpoint: String,
    method: String,
    clientIp: String,
    userAgent: String,
    responseStatus: Number,
    responseTime: Number,
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    }
});

// Indexes for performance
apiSpecificationSchema.index({ serviceId: 1, version: 1 }, { unique: true });
apiSpecificationSchema.index({ name: 1, version: 1 });
apiSpecificationSchema.index({ isLatest: 1, isDeprecated: 1 });

serviceSchema.index({ name: 1 }, { unique: true });
serviceSchema.index({ 'authentication.type': 1, status: 1 });
serviceSchema.index({ 'webidSupport.enabled': 1 });
serviceSchema.index({ did: 1 }, { sparse: true });

serviceHealthLogSchema.index({ serviceId: 1, checkedAt: -1 });
serviceDiscoverySchema.index({ queryType: 1, createdAt: 1 });
apiUsageSchema.index({ serviceId: 1, timestamp: -1 });

// Pre-save middleware
serviceSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

apiSpecificationSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Export models
const Service = mongoose.model('Service', serviceSchema);
const ApiSpecification = mongoose.model('ApiSpecification', apiSpecificationSchema);
const ServiceHealthLog = mongoose.model('ServiceHealthLog', serviceHealthLogSchema);
const ServiceDiscovery = mongoose.model('ServiceDiscovery', serviceDiscoverySchema);
const ApiUsage = mongoose.model('ApiUsage', apiUsageSchema);

module.exports = {
    Service,
    ApiSpecification,
    ServiceHealthLog,
    ServiceDiscovery,
    ApiUsage,
    AUTHENTICATION_TYPES,
    SERVICE_CATEGORIES,
    SERVICE_STATUS
};
