const { validateSpec } = require('../src/validators/openapiValidator');

describe('OpenAPI Validator', () => {
  it('should validate a correct OpenAPI spec', async () => {
    const spec = { 
      openapi: '3.0.0', 
      info: { title: 'Test', version: '1.0.0' }, 
      paths: {} 
    };
    const result = await validateSpec(spec);
    expect(result.valid).toBe(true);
  });

  it('should fail for an invalid OpenAPI spec', async () => {
    const spec = { info: { title: 'Test' } };
    const result = await validateSpec(spec);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
