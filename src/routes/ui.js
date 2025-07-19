/**
 * UI Router for API Registry - PDS 2.2
 * 
 * GOV.UK Design System compliant user interface for service discovery
 * and management with enhanced PDS 2.2 features.
 */

const express = require('express');
const Joi = require('joi');
const winston = require('winston');
const { Service, ApiSpecification, ServiceHealthLog } = require('../database/models');

const router = express.Router();

// Get logger from main app
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Helper function to format service data for templates
const formatServiceForTemplate = (service) => {
  return {
    ...service,
    _id: service._id?.toString() || service._id,
    statusClass: service.status === 'active' ? 'govuk-tag--green' : 'govuk-tag--red',
    healthClass: service.healthStatus === 'healthy' ? 'govuk-tag--green' :
      service.healthStatus === 'degraded' ? 'govuk-tag--yellow' : 'govuk-tag--red',
    formattedDate: service.registeredAt ? new Date(service.registeredAt).toLocaleDateString('en-GB') : 'Unknown',
    formattedLastUpdate: service.lastUpdated ? new Date(service.lastUpdated).toLocaleDateString('en-GB') : 'Unknown'
  };
};

// Home page - Service dashboard
router.get('/', async (req, res) => {
  try {
    // Get service statistics
    const [totalServices, activeServices, healthyServices] = await Promise.all([
      Service.countDocuments({ deletedAt: { $exists: false } }),
      Service.countDocuments({ status: 'active', deletedAt: { $exists: false } }),
      Service.countDocuments({ healthStatus: 'healthy', deletedAt: { $exists: false } })
    ]);

    // Get recent services
    const recentServices = await Service.find({ deletedAt: { $exists: false } })
      .sort({ registeredAt: -1 })
      .limit(5)
      .lean();

    // Get category distribution
    const categoryStats = await Service.aggregate([
      { $match: { deletedAt: { $exists: false } } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.render('dashboard.njk', {
      title: 'API Registry Dashboard',
      pageId: 'dashboard',
      stats: {
        total: totalServices,
        active: activeServices,
        healthy: healthyServices,
        healthPercentage: totalServices > 0 ? Math.round((healthyServices / totalServices) * 100) : 0
      },
      recentServices: recentServices.map(formatServiceForTemplate),
      categoryStats,
      breadcrumbs: [
        { text: 'Home', href: '/' }
      ]
    });
  } catch (error) {
    logger.error('Error loading dashboard:', error);
    res.status(500).render('error.njk', {
      title: 'Error',
      statusCode: 500,
      message: 'Failed to load dashboard'
    });
  }
});

// Services list page
router.get('/services', async (req, res) => {
  try {
    const {
      category,
      status = 'active',
      authType,
      search,
      page = 1,
      limit = 20
    } = req.query;

    // Build query
    const query = { deletedAt: { $exists: false } };

    if (category) query.category = category;
    if (status && status !== 'all') query.status = status;
    if (authType) query['authentication.type'] = authType;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    // Execute query with pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [services, total] = await Promise.all([
      Service.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Service.countDocuments(query)
    ]);

    // Get filter options
    const [categories, authTypes] = await Promise.all([
      Service.distinct('category', { deletedAt: { $exists: false } }),
      Service.distinct('authentication.type', { deletedAt: { $exists: false } })
    ]);

    const totalPages = Math.ceil(total / parseInt(limit));
    const currentPage = parseInt(page);

    res.render('services/list.njk', {
      title: 'Services',
      pageId: 'services',
      services: services.map(formatServiceForTemplate),
      pagination: {
        currentPage,
        totalPages,
        total,
        hasNext: currentPage < totalPages,
        hasPrev: currentPage > 1,
        nextPage: currentPage + 1,
        prevPage: currentPage - 1
      },
      filters: {
        category,
        status,
        authType,
        search,
        categories: categories.sort(),
        authTypes: authTypes.flat().filter((v, i, a) => a.indexOf(v) === i).sort(),
        statusOptions: [
          { value: 'all', text: 'All statuses' },
          { value: 'active', text: 'Active' },
          { value: 'inactive', text: 'Inactive' },
          { value: 'maintenance', text: 'Maintenance' }
        ]
      },
      breadcrumbs: [
        { text: 'Home', href: '/' },
        { text: 'Services' }
      ]
    });
  } catch (error) {
    logger.error('Error loading services list:', error);
    res.status(500).render('error.njk', {
      title: 'Error',
      statusCode: 500,
      message: 'Failed to load services'
    });
  }
});

// Service details page
router.get('/services/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const service = await Service.findOne({
      _id: id,
      deletedAt: { $exists: false }
    }).lean();

    if (!service) {
      return res.status(404).render('error.njk', {
        title: 'Service Not Found',
        statusCode: 404,
        message: 'The requested service could not be found.'
      });
    }

    // Get health logs
    const healthLogs = await ServiceHealthLog.find({ serviceId: id })
      .sort({ timestamp: -1 })
      .limit(10)
      .lean();

    // Get API specifications
    const apiSpecs = await ApiSpecification.find({ serviceId: id })
      .sort({ version: -1 })
      .lean();

    res.render('services/detail.njk', {
      title: `${service.name} - Service Details`,
      pageId: 'service-detail',
      service: formatServiceForTemplate(service),
      healthLogs: healthLogs.map(log => ({
        ...log,
        formattedTime: new Date(log.timestamp).toLocaleString('en-GB'),
        statusClass: log.status === 'healthy' ? 'govuk-tag--green' :
          log.status === 'degraded' ? 'govuk-tag--yellow' : 'govuk-tag--red'
      })),
      apiSpecs: apiSpecs.map(spec => ({
        ...spec,
        formattedDate: new Date(spec.uploadedAt).toLocaleDateString('en-GB')
      })),
      breadcrumbs: [
        { text: 'Home', href: '/' },
        { text: 'Services', href: '/services' },
        { text: service.name }
      ]
    });
  } catch (error) {
    logger.error('Error loading service details:', error);
    res.status(500).render('error.njk', {
      title: 'Error',
      statusCode: 500,
      message: 'Failed to load service details'
    });
  }
});

// Service registration form
router.get('/services/new', (req, res) => {
  res.render('services/new.njk', {
    title: 'Register New Service',
    pageId: 'service-new',
    categoryOptions: [
      { value: 'government', text: 'Government' },
      { value: 'utility', text: 'Utility' },
      { value: 'healthcare', text: 'Healthcare' },
      { value: 'education', text: 'Education' },
      { value: 'financial', text: 'Financial' },
      { value: 'other', text: 'Other' }
    ],
    authTypeOptions: [
      { value: 'solid-oidc-like', text: 'Solid-OIDC Like' },
      { value: 'did-challenge-response', text: 'DID Challenge Response' },
      { value: 'hybrid', text: 'Hybrid Authentication' }
    ],
    breadcrumbs: [
      { text: 'Home', href: '/' },
      { text: 'Services', href: '/services' },
      { text: 'Register New Service' }
    ]
  });
});

// Handle service registration form submission
router.post('/services/new', async (req, res) => {
  try {
    // Validate form data
    const schema = Joi.object({
      name: Joi.string().min(2).max(100).required(),
      displayName: Joi.string().min(2).max(100).required(),
      description: Joi.string().max(500).required(),
      baseUrl: Joi.string().uri().required(),
      version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required(),
      category: Joi.string().valid('government', 'utility', 'healthcare', 'education', 'financial', 'other').required(),
      webId: Joi.string().uri().allow(''),
      authenticationType: Joi.string().valid('solid-oidc-like', 'did-challenge-response', 'hybrid').required(),
      healthCheckUrl: Joi.string().uri().required(),
      apiSpecificationUrl: Joi.string().uri().allow(''),
      capabilities: Joi.string().allow(''),
      dataTypes: Joi.string().allow(''),
      contactEmail: Joi.string().email().allow(''),
      documentation: Joi.string().uri().allow(''),
      support: Joi.string().uri().allow('')
    });

    const { error, value } = schema.validate(req.body);

    if (error) {
      const errors = error.details.reduce((acc, detail) => {
        acc[detail.path[0]] = detail.message;
        return acc;
      }, {});

      return res.render('services/new.njk', {
        title: 'Register New Service',
        pageId: 'service-new',
        errors,
        formData: req.body,
        categoryOptions: [
          { value: 'government', text: 'Government' },
          { value: 'utility', text: 'Utility' },
          { value: 'healthcare', text: 'Healthcare' },
          { value: 'education', text: 'Education' },
          { value: 'financial', text: 'Financial' },
          { value: 'other', text: 'Other' }
        ],
        authTypeOptions: [
          { value: 'solid-oidc-like', text: 'Solid-OIDC Like' },
          { value: 'did-challenge-response', text: 'DID Challenge Response' },
          { value: 'hybrid', text: 'Hybrid Authentication' }
        ],
        breadcrumbs: [
          { text: 'Home', href: '/' },
          { text: 'Services', href: '/services' },
          { text: 'Register New Service' }
        ]
      });
    }

    // Check for existing service
    const existingService = await Service.findOne({
      $or: [
        { name: value.name },
        { baseUrl: value.baseUrl }
      ],
      deletedAt: { $exists: false }
    });

    if (existingService) {
      const conflict = existingService.name === value.name ? 'name' : 'baseUrl';
      return res.render('services/new.njk', {
        title: 'Register New Service',
        pageId: 'service-new',
        errors: { [conflict]: `A service with this ${conflict} already exists` },
        formData: req.body,
        categoryOptions: [
          { value: 'government', text: 'Government' },
          { value: 'utility', text: 'Utility' },
          { value: 'healthcare', text: 'Healthcare' },
          { value: 'education', text: 'Education' },
          { value: 'financial', text: 'Financial' },
          { value: 'other', text: 'Other' }
        ],
        authTypeOptions: [
          { value: 'solid-oidc-like', text: 'Solid-OIDC Like' },
          { value: 'did-challenge-response', text: 'DID Challenge Response' },
          { value: 'hybrid', text: 'Hybrid Authentication' }
        ],
        breadcrumbs: [
          { text: 'Home', href: '/' },
          { text: 'Services', href: '/services' },
          { text: 'Register New Service' }
        ]
      });
    }

    // Create service
    const serviceData = {
      name: value.name,
      displayName: value.displayName,
      description: value.description,
      category: value.category,
      baseUrl: value.baseUrl,
      healthCheckUrl: value.healthCheckUrl,
      authentication: {
        type: value.authenticationType,
        metadata: {
          supportedScopes: [],
          supportedGrantTypes: ['authorization_code'],
          supportedResponseTypes: ['code'],
          tokenEndpointAuthMethods: ['client_secret_post']
        }
      },
      webidSupport: {
        enabled: !!value.webId,
        webidEndpoint: value.webId || null
      },
      version: value.version,
      capabilities: value.capabilities ? value.capabilities.split(',').map(s => s.trim()) : [],
      dataTypes: value.dataTypes ? value.dataTypes.split(',').map(s => s.trim()) : [],
      contactInfo: {
        email: value.contactEmail,
        documentation: value.documentation,
        support: value.support
      },
      status: 'active',
      registeredAt: new Date(),
      lastUpdated: new Date()
    };

    // Remove empty fields
    if (!serviceData.apiSpecificationUrl) delete serviceData.apiSpecificationUrl;

    const service = new Service(serviceData);
    await service.save();

    logger.info('Service registered via UI', {
      serviceId: service._id.toString(),
      name: service.name,
      category: service.category
    });

    req.session.successMessage = 'Service registered successfully!';
    res.redirect(`/services/${service._id}`);
  } catch (error) {
    logger.error('Error registering service via UI:', error);
    res.status(500).render('error.njk', {
      title: 'Registration Error',
      statusCode: 500,
      message: 'Failed to register service. Please try again.'
    });
  }
});

// Discovery page
router.get('/discovery', async (req, res) => {
  try {
    // Get available categories and auth types for filters
    const [categories, authTypes] = await Promise.all([
      Service.distinct('category', { deletedAt: { $exists: false } }),
      Service.distinct('authenticationTypes', { deletedAt: { $exists: false } })
    ]);

    res.render('discovery.njk', {
      title: 'Service Discovery',
      pageId: 'discovery',
      categories: categories.sort(),
      authTypes: authTypes.flat().filter((v, i, a) => a.indexOf(v) === i).sort(),
      breadcrumbs: [
        { text: 'Home', href: '/' },
        { text: 'Discovery' }
      ]
    });
  } catch (error) {
    logger.error('Error loading discovery page:', error);
    res.status(500).render('error.njk', {
      title: 'Error',
      statusCode: 500,
      message: 'Failed to load discovery page'
    });
  }
});

module.exports = router;
