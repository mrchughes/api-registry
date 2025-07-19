/**
 * Quick test to verify schema alignment between Joi validation and Mongoose models
 */

const request = require('supertest');
const express = require('express');
const app = require('./src/index.js');
const { connectDatabase } = require('./src/database/connection');
const { Service } = require('./src/database/models');

async function testSchemaAlignment() {
    console.log('🧪 Testing Schema Alignment...');

    try {
        // Test data that should match both Joi validation and Mongoose schema
        const testServiceData = {
            name: 'test-pds-service',
            displayName: 'Test PDS Service',
            description: 'A test service for schema validation',
            category: 'government',
            baseUrl: 'https://test.example.com',
            healthCheckUrl: 'https://test.example.com/health',
            authenticationType: 'solid-oidc-like',
            version: '1.0.0',
            webId: 'https://test.example.com/profile#me',
            contactEmail: 'test@example.com',
            documentation: 'https://test.example.com/docs'
        };

        console.log('1. Testing POST /api/services endpoint...');

        const response = await request(app)
            .post('/api/services')
            .send(testServiceData)
            .set('Content-Type', 'application/json');

        console.log(`   Response status: ${response.status}`);

        if (response.status === 201) {
            console.log('   ✅ API endpoint accepted the data');
            console.log(`   Service ID: ${response.body.id}`);

            // Verify the service was saved correctly in the database
            const savedService = await Service.findById(response.body.id);
            if (savedService) {
                console.log('   ✅ Service saved to database successfully');
                console.log(`   Authentication type: ${savedService.authentication.type}`);
                console.log(`   Category: ${savedService.category}`);
                console.log(`   Display name: ${savedService.displayName}`);
            } else {
                console.log('   ❌ Service not found in database');
            }
        } else {
            console.log('   ❌ API endpoint rejected the data');
            console.log(`   Error: ${JSON.stringify(response.body, null, 2)}`);
        }

        console.log('\n2. Testing UI form submission...');

        const uiResponse = await request(app)
            .post('/services/new')
            .send(testServiceData)
            .set('Content-Type', 'application/x-www-form-urlencoded');

        console.log(`   Response status: ${uiResponse.status}`);

        if (uiResponse.status === 302) {
            console.log('   ✅ UI form accepted and redirected');
        } else {
            console.log('   ❌ UI form validation failed');
            console.log(`   Response: ${uiResponse.text?.substring(0, 200)}...`);
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run the test
if (require.main === module) {
    testSchemaAlignment()
        .then(() => {
            console.log('\n🏁 Schema alignment test completed');
            process.exit(0);
        })
        .catch((error) => {
            console.error('💥 Test crashed:', error);
            process.exit(1);
        });
}

module.exports = testSchemaAlignment;
