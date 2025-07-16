// Middleware to check API key for protected routes
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  const configuredApiKey = process.env.API_KEY;
  
  if (!configuredApiKey) {
    console.warn('API_KEY environment variable is not set. Authentication is disabled.');
    return next();
  }
  
  if (!apiKey || apiKey !== configuredApiKey) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }
  
  next();
};

module.exports = apiKeyAuth;
