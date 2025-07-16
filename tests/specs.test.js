const request = require('supertest');
const express = require('express');
const specsRouter = require('../src/routes/specs');

const app = express();
app.use(express.json());
app.use('/specs', specsRouter);

describe('API Registry Service', () => {
  it('should register a new API spec', async () => {
    const res = await request(app)
      .post('/specs')
      .send({
        serviceName: 'test-service',
        version: '1.0.0',
        specification: { openapi: '3.0.0', info: { title: 'Test', version: '1.0.0' }, paths: {} },
        description: 'Test API',
        deprecated: false
      });
    expect(res.statusCode).toBe(201);
    expect(res.body.serviceName).toBe('test-service');
    expect(res.body.version).toBe('1.0.0');
  });

  it('should get a registered API spec', async () => {
    await request(app)
      .post('/specs')
      .send({
        serviceName: 'test-service',
        version: '1.0.1',
        specification: { openapi: '3.0.0', info: { title: 'Test', version: '1.0.1' }, paths: {} },
        description: 'Test API',
        deprecated: false
      });
    const res = await request(app).get('/specs/test-service/1.0.1');
    expect(res.statusCode).toBe(200);
    expect(res.body.version).toBe('1.0.1');
  });

  it('should get the latest API spec', async () => {
    const res = await request(app).get('/specs/test-service/latest');
    expect(res.statusCode).toBe(200);
    expect(res.body.version).toBe('1.0.1');
  });
});
