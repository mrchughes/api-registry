#!/bin/bash

# Production Deployment Script for API Registry PDS 2.2
# This script sets up the production environment with all necessary configurations

set -e

echo "🚀 Starting API Registry PDS 2.2 Production Setup..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the api-registry directory"
    exit 1
fi

# 1. Environment Setup
print_status "Setting up production environment..."
if [ ! -f ".env.production" ]; then
    print_error ".env.production file not found. Please create it first."
    exit 1
fi

# Copy production environment
cp .env.production .env
print_status "Production environment variables loaded"

# 2. Dependencies Installation
print_status "Installing production dependencies..."
npm ci --only=production
print_status "Dependencies installed"

# 3. Database Setup
print_status "Setting up production database..."

# Check if MongoDB is running
if ! pgrep -x "mongod" > /dev/null; then
    print_warning "MongoDB not running. Starting MongoDB..."
    brew services start mongodb/brew/mongodb-community
    sleep 3
fi

# Create production database and user (if needed)
mongosh --eval "
use api-registry-pds22-production;
db.createUser({
  user: 'api-registry-prod',
  pwd: 'secure-password-change-this',
  roles: [
    { role: 'readWrite', db: 'api-registry-pds22-production' },
    { role: 'dbAdmin', db: 'api-registry-pds22-production' }
  ]
});
db.services.createIndex({ 'name': 1 }, { unique: true });
db.services.createIndex({ 'baseUrl': 1 }, { unique: true });
db.services.createIndex({ 'category': 1 });
db.services.createIndex({ 'authentication.type': 1 });
db.services.createIndex({ 'status': 1 });
db.services.createIndex({ 'registeredAt': -1 });
db.apispecifications.createIndex({ 'serviceId': 1, 'version': 1 }, { unique: true });
db.servicehealthlogs.createIndex({ 'serviceId': 1, 'timestamp': -1 });
" 2>/dev/null || print_warning "Database user may already exist"

print_status "Database indexes created"

# 4. Security Hardening
print_status "Applying security configurations..."

# Set proper file permissions
chmod 600 .env
chmod -R 755 src/
chmod -R 755 views/
chmod -R 755 public/

# Create logs directory if it doesn't exist
mkdir -p logs
chmod 755 logs

print_status "File permissions set"

# 5. Health Check Setup
print_status "Setting up health monitoring..."

# Create systemd service file (for Linux) or launchd plist (for macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS - create launchd plist
    cat > ~/Library/LaunchAgents/uk.gov.api-registry.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>uk.gov.api-registry</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/node</string>
        <string>$(pwd)/src/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$(pwd)</string>
    <key>KeepAlive</key>
    <true/>
    <key>RestartEnabled</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$(pwd)/logs/api-registry.log</string>
    <key>StandardErrorPath</key>
    <string>$(pwd)/logs/api-registry-error.log</string>
</dict>
</plist>
EOF
    print_status "macOS launchd service configured"
else
    # Linux - create systemd service
    sudo cat > /etc/systemd/system/api-registry.service << EOF
[Unit]
Description=API Registry PDS 2.2 Service
After=network.target mongod.service

[Service]
Type=simple
User=api-registry
WorkingDirectory=$(pwd)
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable api-registry.service
    print_status "Linux systemd service configured"
fi

# 6. SSL/TLS Setup (if certificates are available)
if [ -f "certs/server.crt" ] && [ -f "certs/server.key" ]; then
    print_status "SSL certificates found - HTTPS enabled"
    echo "HTTPS_ENABLED=true" >> .env
    echo "SSL_CERT_PATH=certs/server.crt" >> .env
    echo "SSL_KEY_PATH=certs/server.key" >> .env
else
    print_warning "No SSL certificates found. Service will run on HTTP only."
    print_warning "For production, please obtain SSL certificates and place them in the certs/ directory"
fi

# 7. Firewall Configuration
print_status "Configuring firewall rules..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 3005/tcp comment 'API Registry'
    sudo ufw allow 27017/tcp comment 'MongoDB'
    print_status "UFW firewall rules added"
elif command -v firewall-cmd &> /dev/null; then
    sudo firewall-cmd --permanent --add-port=3005/tcp
    sudo firewall-cmd --permanent --add-port=27017/tcp
    sudo firewall-cmd --reload
    print_status "firewalld rules added"
else
    print_warning "No supported firewall found. Please configure firewall manually."
fi

# 8. Performance Optimization
print_status "Applying performance optimizations..."

# Set Node.js production optimizations
echo "NODE_OPTIONS=--max-old-space-size=2048" >> .env

# 9. Monitoring Setup
print_status "Setting up monitoring..."

# Create monitoring script
cat > scripts/monitor-health.sh << 'EOF'
#!/bin/bash
# Health monitoring script for API Registry

HEALTH_URL="http://localhost:3005/health"
LOG_FILE="logs/health-monitor.log"

response=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL)

if [ $response -eq 200 ]; then
    echo "$(date): API Registry is healthy" >> $LOG_FILE
else
    echo "$(date): API Registry health check failed - HTTP $response" >> $LOG_FILE
    # Add alerting logic here (email, Slack, etc.)
fi
EOF

chmod +x scripts/monitor-health.sh

# Add to crontab for regular health checks
(crontab -l 2>/dev/null; echo "*/5 * * * * $(pwd)/scripts/monitor-health.sh") | crontab -
print_status "Health monitoring configured"

# 10. Final Security Checks
print_status "Running final security checks..."

# Check for default secrets
if grep -q "your-super-secure-session-secret-change-this-in-production" .env; then
    print_error "⚠️  Please change the default SESSION_SECRET in .env file!"
fi

if grep -q "your-jwt-secret-key-change-this-in-production" .env; then
    print_error "⚠️  Please change the default JWT_SECRET in .env file!"
fi

# 11. Build and Start Service
print_status "Building and starting service..."

# Create production start script
cat > start-production.sh << 'EOF'
#!/bin/bash
export NODE_ENV=production
export PM2_HOME=~/.pm2
node src/index.js
EOF

chmod +x start-production.sh

print_status "✅ Production setup complete!"
echo ""
print_status "🔧 Next steps:"
echo "   1. Update the secrets in .env file (SESSION_SECRET, JWT_SECRET, etc.)"
echo "   2. Obtain and install SSL certificates in certs/ directory"
echo "   3. Configure your reverse proxy (nginx/Apache) if needed"
echo "   4. Set up external monitoring and alerting"
echo "   5. Start the service with: ./start-production.sh"
echo ""
print_status "📊 Service will be available at:"
echo "   - HTTP:  http://localhost:3005"
echo "   - HTTPS: https://localhost:3005 (if SSL configured)"
echo "   - Health: http://localhost:3005/health"
echo "   - API:    http://localhost:3005/api/v1/"
echo ""
print_warning "Remember to:"
echo "   - Regularly backup your MongoDB database"
echo "   - Monitor the logs in logs/ directory"
echo "   - Keep dependencies updated for security"
echo "   - Test the disaster recovery procedures"
