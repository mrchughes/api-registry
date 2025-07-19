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
    if (authType) query.authenticationTypes = { $in: [authType] };
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
      Service.distinct('authenticationTypes', { deletedAt: { $exists: false } })
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
      { value: 'data-store', text: 'Data Store' },
      { value: 'identity-provider', text: 'Identity Provider' },
      { value: 'application', text: 'Application' },
      { value: 'utility', text: 'Utility' },
      { value: 'integration', text: 'Integration' }
    ],
    authTypeOptions: [
      { value: 'solid-oidc', text: 'Solid-OIDC' },
      { value: 'did-challenge', text: 'DID Challenge' },
      { value: 'api-key', text: 'API Key' },
      { value: 'bearer-token', text: 'Bearer Token' },
      { value: 'none', text: 'No Authentication' }
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
      description: Joi.string().max(500),
      baseUrl: Joi.string().uri().required(),
      version: Joi.string().pattern(/^\d+\.\d+\.\d+$/).required(),
      category: Joi.string().valid('data-store', 'identity-provider', 'application', 'utility', 'integration').required(),
      webId: Joi.string().uri().allow(''),
      authenticationTypes: Joi.array().items(Joi.string()).min(1).required(),
      healthCheckUrl: Joi.string().uri().allow(''),
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
          { value: 'data-store', text: 'Data Store' },
          { value: 'identity-provider', text: 'Identity Provider' },
          { value: 'application', text: 'Application' },
          { value: 'utility', text: 'Utility' },
          { value: 'integration', text: 'Integration' }
        ],
        authTypeOptions: [
          { value: 'solid-oidc', text: 'Solid-OIDC' },
          { value: 'did-challenge', text: 'DID Challenge' },
          { value: 'api-key', text: 'API Key' },
          { value: 'bearer-token', text: 'Bearer Token' },
          { value: 'none', text: 'No Authentication' }
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
          { value: 'data-store', text: 'Data Store' },
          { value: 'identity-provider', text: 'Identity Provider' },
          { value: 'application', text: 'Application' },
          { value: 'utility', text: 'Utility' },
          { value: 'integration', text: 'Integration' }
        ],
        authTypeOptions: [
          { value: 'solid-oidc', text: 'Solid-OIDC' },
          { value: 'did-challenge', text: 'DID Challenge' },
          { value: 'api-key', text: 'API Key' },
          { value: 'bearer-token', text: 'Bearer Token' },
          { value: 'none', text: 'No Authentication' }
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
      ...value,
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
    if (!serviceData.webId) delete serviceData.webId;
    if (!serviceData.healthCheckUrl) delete serviceData.healthCheckUrl;
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
          }
          .app-card__status--active {
            background-color: #00703c;
            color: white;
          }
          .app-card__status--maintenance {
            background-color: #ffdd00;
            color: #0b0c0c;
          }
          .app-card__status--deprecated {
            background-color: #d4351c;
            color: white;
          }
          .app-version-tag {
            display: inline-block;
            background-color: #1d70b8;
            color: white;
            padding: 3px 8px;
            font-size: 14px;
            border-radius: 3px;
            margin-right: 5px;
            margin-bottom: 5px;
          }
          .app-version-tag--deprecated {
            background-color: #d4351c;
          }
        </style>
      </head>
      <body>
        <header class="govuk-header" role="banner" data-module="govuk-header">
          <div class="govuk-header__container govuk-width-container">
            <div class="govuk-header__logo">
              <a href="/" class="govuk-header__link govuk-header__link--homepage">
                <span class="govuk-header__logotype">API Registry</span>
              </a>
            </div>
            <div class="govuk-header__content">
              <nav>
                <ul class="govuk-header__navigation">
                  <li class="govuk-header__navigation-item govuk-header__navigation-item--active">
                    <a class="govuk-header__link" href="/">Home</a>
                  </li>
                  <li class="govuk-header__navigation-item">
                    <a class="govuk-header__link" href="/api-docs">API Documentation</a>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </header>

        <div class="app-container">
          <h1 class="govuk-heading-xl">API Registry</h1>
          <p class="govuk-body-l">Browse and discover available APIs</p>
          
          <div class="govuk-tabs" data-module="govuk-tabs">
            <h2 class="govuk-tabs__title">Browse APIs</h2>
            <ul class="govuk-tabs__list">
              <li class="govuk-tabs__list-item govuk-tabs__list-item--selected">
                <a class="govuk-tabs__tab" href="#services">
                  Services (${services.length})
                </a>
              </li>
              <li class="govuk-tabs__list-item">
                <a class="govuk-tabs__tab" href="#specifications">
                  API Specifications (${specs.length})
                </a>
              </li>
            </ul>
            
            <div class="govuk-tabs__panel" id="services">
              <h2 class="govuk-heading-l">Services</h2>
              
              ${services.length === 0 ? '<p class="govuk-body">No services registered yet</p>' : ''}
              
              ${services.map(service => {
      return `
                  <div class="app-card">
                    <h3 class="app-card__title govuk-heading-m">
                      ${service.name}
                      <span class="app-card__status app-card__status--${service.status}">${service.status}</span>
                    </h3>
                    <p class="govuk-body">${service.description || 'No description provided'}</p>
                    <p class="govuk-body">
                      <strong>Base URL:</strong> ${service.baseUrl}
                    </p>
                    ${service.owner ? `<p class="govuk-body"><strong>Owner:</strong> ${service.owner}</p>` : ''}
                    
                    <h4 class="govuk-heading-s">API Specifications</h4>
                    <div>
                      ${specs.filter(spec => spec.serviceName === service.name)
          .map(spec => `
                           <a href="/ui/${spec.serviceName}/${spec.version}" class="app-version-tag ${spec.deprecated ? 'app-version-tag--deprecated' : ''}">
                             v${spec.version}${spec.deprecated ? ' (deprecated)' : ''}
                           </a>
                         `).join('') || '<p class="govuk-body">No API specifications available</p>'}
                    </div>
                    
                    <div class="govuk-button-group" style="margin-top: 15px;">
                      <a href="/services/${service.name}" class="govuk-button govuk-button--secondary" data-module="govuk-button">
                        View Service Details
                      </a>
                    </div>
                  </div>
                `;
    }).join('')}
            </div>
            
            <div class="govuk-tabs__panel govuk-tabs__panel--hidden" id="specifications">
              <h2 class="govuk-heading-l">API Specifications</h2>
              
              ${specs.length === 0 ? '<p class="govuk-body">No API specifications registered yet</p>' : ''}
              
              <table class="govuk-table">
                <thead class="govuk-table__head">
                  <tr class="govuk-table__row">
                    <th scope="col" class="govuk-table__header">Service</th>
                    <th scope="col" class="govuk-table__header">Version</th>
                    <th scope="col" class="govuk-table__header">Status</th>
                    <th scope="col" class="govuk-table__header">Updated</th>
                    <th scope="col" class="govuk-table__header">Actions</th>
                  </tr>
                </thead>
                <tbody class="govuk-table__body">
                  ${specs.map(spec => {
      const updatedDate = new Date(spec.updatedAt).toLocaleDateString();
      return `
                      <tr class="govuk-table__row">
                        <td class="govuk-table__cell">${spec.serviceName}</td>
                        <td class="govuk-table__cell">${spec.version}</td>
                        <td class="govuk-table__cell">
                          ${spec.deprecated
          ? '<strong class="govuk-tag govuk-tag--red">Deprecated</strong>'
          : '<strong class="govuk-tag govuk-tag--green">Active</strong>'}
                        </td>
                        <td class="govuk-table__cell">${updatedDate}</td>
                        <td class="govuk-table__cell">
                          <a href="${spec.docsUrl}" class="govuk-button govuk-button--secondary" data-module="govuk-button" style="margin-bottom: 0;">
                            View Docs
                          </a>
                        </td>
                      </tr>
                    `;
    }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        <script>
          window.GOVUKFrontend.initAll();
        </script>
      </body>
      </html>
    `;

    res.send(html);
  } catch (error) {
    console.error('Error rendering UI:', error);
    res.status(500).send('Error loading UI');
  }
});

// Serve service details page
router.get('/service/:serviceName', async (req, res) => {
  try {
    const { serviceName } = req.params;

    // Get service details
    const service = await serviceService.getService(serviceName);
    if (!service) {
      return res.status(404).send('Service not found');
    }

    // Get specs for this service
    const specs = await specsService.getSpecsForService(serviceName);

    // Build HTML for the service details page
    // (similar to the main page but with more details for the specific service)
    // ...

    res.send('Service details page will be implemented here');
  } catch (error) {
    console.error('Error rendering service details:', error);
    res.status(500).send('Error loading service details');
  }
});

// Serve Swagger UI for a given service/version
router.get('/:serviceName/:version', async (req, res, next) => {
  try {
    const { serviceName, version } = req.params;
    const specPath = path.join(SPECS_DIR, serviceName, `${version}.json`);

    if (!fs.existsSync(specPath)) {
      return res.status(404).send('API specification not found');
    }

    const specData = JSON.parse(fs.readFileSync(specPath, 'utf8'));
    req.swaggerDoc = specData.specification;

    // Set up custom options for Swagger UI
    const options = {
      swaggerUrl: undefined,
      swaggerOptions: {
        docExpansion: 'list',
        defaultModelsExpandDepth: 1,
        filter: true
      },
      customCss: '.topbar { display: none }',
      customSiteTitle: `${serviceName} API v${version}`,
      customfavIcon: '/favicon.ico'
    };

    next();
  } catch (error) {
    console.error('Error loading API documentation:', error);
    res.status(500).send('Error loading API documentation');
  }
}, swaggerUi.serve, swaggerUi.setup(undefined, { explorer: true }));

module.exports = router;
