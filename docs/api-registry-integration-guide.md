# How to Use the API Registry Service

## 1. Publish Your API Specification

Send a POST request to `http://api-registry:3005/specs` with your OpenAPI spec, service name, and version. Include the API key in the `X-API-Key` header.

**Example (Node.js):**
```js
const fs = require('fs');
const axios = require('axios');

async function publishApiSpec() {
  const apiSpec = JSON.parse(fs.readFileSync('./specifications/api-spec.json', 'utf8'));
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
}
```

## 2. Retrieve API Specifications

- To get a specific version: `GET http://api-registry:3005/specs/{serviceName}/{version}`
- To get the latest version: `GET http://api-registry:3005/specs/{serviceName}/latest`

**Example:**
```js
const axios = require('axios');
async function getServiceApiSpec(serviceName) {
  const response = await axios.get(`http://api-registry:3005/specs/${serviceName}/latest`);
  return response.data;
}
```

## 3. View Interactive API Documentation

Visit `http://api-registry:3005/ui/{serviceName}/{version}` in your browser.

## 4. API Registry’s Own API Docs

Visit `http://api-registry:3005/api-docs` for documentation.

## 5. Environment Variables Needed

- `API_REGISTRY_KEY` (for authentication)
- `SERVICE_NAME` and `SERVICE_VERSION` (for publishing)

---

Share this file with developers of other services to ensure proper integration with the API Registry.
