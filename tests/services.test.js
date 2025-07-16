const specsService = require('../src/services/specsService');
const fs = require('fs');
const path = require('path');

describe('Specs Service', () => {
  const serviceName = 'test-service';
  const version = '2.0.0';
  const spec = { openapi: '3.0.0', info: { title: 'Test', version }, paths: {} };
  const description = 'Test API';
  const deprecated = false;
  const STORAGE_DIR = path.join(__dirname, '../storage');

  afterAll(() => {
    // Cleanup
    const filePath = path.join(STORAGE_DIR, serviceName, `${version}.json`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const dir = path.join(STORAGE_DIR, serviceName);
    if (fs.existsSync(dir)) fs.rmdirSync(dir);
  });

  it('should save and retrieve a spec', async () => {
    const saved = await specsService.saveSpec({ serviceName, version, specification: spec, description, deprecated });
    expect(saved.serviceName).toBe(serviceName);
    expect(saved.version).toBe(version);
    const retrieved = await specsService.getSpec(serviceName, version);
    expect(retrieved.version).toBe(version);
  });

  it('should get the latest spec', async () => {
    const latest = await specsService.getLatestSpec(serviceName);
    expect(latest.version).toBe(version);
  });
});
