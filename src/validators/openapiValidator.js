const SwaggerParser = require('@apidevtools/swagger-parser');

exports.validateSpec = async (spec) => {
  try {
    // Parse and validate the OpenAPI document
    await SwaggerParser.validate(spec);
    return { valid: true };
  } catch (err) {
    return { 
      valid: false, 
      errors: [err.message] 
    };
  }
};
