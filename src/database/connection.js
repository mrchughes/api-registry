/**
 * Database connection and configuration for API Registry PDS 2.2
 */

const mongoose = require('mongoose');
const winston = require('winston');
const { MongoMemoryServer } = require('mongodb-memory-server');

const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/database.log' })
    ]
});

class Database {
    constructor() {
        this.connection = null;
        this.isConnected = false;
        this.mongod = null;
    }

    async connect() {
        try {
            let mongoUri;

            logger.info('🔍 Database connection debugging', {
                NODE_ENV: process.env.NODE_ENV,
                MONGODB_URI: process.env.MONGODB_URI ? 'set' : 'not set',
                useInMemory: process.env.USE_MEMORY_DB === 'true'
            });

            // Use persistent database by default, in-memory only if explicitly requested
            if (process.env.USE_MEMORY_DB === 'true') {
                this.mongod = await MongoMemoryServer.create();
                mongoUri = this.mongod.getUri();
                logger.info('🚀 Using in-memory MongoDB (testing mode)', { uri: mongoUri });
            } else {
                mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/api-registry-pds22';
                logger.info('🔗 Using persistent MongoDB database', { uri: mongoUri });
            }

            // Configure mongoose options for production use
            const options = {
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                bufferCommands: false,
            };

            this.connection = await mongoose.connect(mongoUri, options);
            this.isConnected = true;

            logger.info('✅ Database connected successfully', {
                host: this.connection.connection.host,
                port: this.connection.connection.port,
                database: this.connection.connection.name
            });

            // Handle connection events
            mongoose.connection.on('error', (error) => {
                logger.error('❌ Database connection error:', error);
                this.isConnected = false;
            });

            mongoose.connection.on('disconnected', () => {
                logger.warn('⚠️ Database disconnected');
                this.isConnected = false;
            });

            mongoose.connection.on('reconnected', () => {
                logger.info('✅ Database reconnected');
                this.isConnected = true;
            });

            return this.connection;
        } catch (error) {
            logger.error('❌ Database connection failed:', error);
            this.isConnected = false;
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.connection) {
                await mongoose.connection.close();
                this.isConnected = false;
                logger.info('✅ Database disconnected gracefully');
            }

            // Stop in-memory MongoDB if it was used
            if (this.mongod) {
                await this.mongod.stop();
                logger.info('✅ In-memory MongoDB stopped');
            }
        } catch (error) {
            logger.error('❌ Error disconnecting from database:', error);
            throw error;
        }
    }

    getStatus() {
        return {
            connected: this.isConnected,
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            database: mongoose.connection.name
        };
    }

    async healthCheck() {
        try {
            if (!this.isConnected) {
                throw new Error('Database not connected');
            }

            // Simple ping to check database responsiveness
            await mongoose.connection.db.admin().ping();
            return { status: 'healthy', timestamp: new Date().toISOString() };
        } catch (error) {
            logger.error('❌ Database health check failed:', error);
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Export singleton instance
const database = new Database();

module.exports = {
    database,
    mongoose
};
