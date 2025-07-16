const fs = require('fs');
const axios = require('axios');

/**
 * Example code for how other services should publish their API specs to the API Registry
 */
async function publishApiSpec() {
  try {
    // Load the API specification from a file
    // In a real service, this would be your OpenAPI spec
    const apiSpec = JSON.parse(fs.readFileSync('./specifications/api-spec.json', 'utf8'));
    
    // Publish to the API Registry
    await axios.post('http://api-registry:3005/specs', {
      serviceName: process.env.SERVICE_NAME,
      version: process.env.SERVICE_VERSION,
      specification: apiSpec,
      description: 'API specification for ' + process.env.SERVICE_NAME
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.API_REGISTRY_KEY
      }
    });
    
    console.log('API specification published successfully to API Registry');
  } catch (error) {
    console.error('Failed to publish API specification:', error.message);
  }
}

/**
 * Example code for how services should retrieve other services' API specs
 */
async function getServiceApiSpec(serviceName) {
  try {
    // Get the latest version of the specified service's API
    const response = await axios.get(`http://api-registry:3005/specs/${serviceName}/latest`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch API spec for ${serviceName}:`, error.message);
    return null;
  }
}

/**
 * Example code for how services should retrieve a specific version of another service's API spec
 */
async function getSpecificServiceApiSpec(serviceName, version) {
  try {
    const response = await axios.get(`http://api-registry:3005/specs/${serviceName}/${version}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch API spec for ${serviceName} v${version}:`, error.message);
    return null;
  }
}

module.exports = {
  publishApiSpec,
  getServiceApiSpec,
  getSpecificServiceApiSpec
};
