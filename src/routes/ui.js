const express = require('express');
const router = express.Router();
const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const path = require('path');
const specsService = require('../services/specsService');
const serviceService = require('../services/serviceService');

const STORAGE_DIR = path.join(__dirname, '../../storage');
const SPECS_DIR = path.join(STORAGE_DIR, 'specs');

// Serve main browsing UI
router.get('/', async (req, res) => {
  try {
    // Get all services
    const services = await serviceService.listServices();
    // Get all specs
    const specs = await specsService.listSpecs();

    // Build HTML for the UI
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>API Registry</title>
        <link rel="stylesheet" href="https://design-system.service.gov.uk/stylesheets/govuk-frontend-4.7.0.min.css">
        <script src="https://design-system.service.gov.uk/javascripts/govuk-frontend-4.7.0.min.js"></script>
        <style>
          .app-container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 30px 15px;
          }
          .app-card {
            border: 1px solid #b1b4b6;
            padding: 15px;
            margin-bottom: 20px;
            background-color: #f8f8f8;
          }
          .app-card__title {
            margin-top: 0;
          }
          .app-card__status {
            display: inline-block;
            padding: 5px 10px;
            font-size: 16px;
            font-weight: bold;
            border-radius: 3px;
            margin-left: 10px;
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
