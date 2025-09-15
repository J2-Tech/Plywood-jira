const winston = require('winston');

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
    trace: 5
};

// Define colors for each level
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
    trace: 'gray'
};

// Tell winston about the colors
winston.addColors(colors);

// Create the logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels,
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.colorize({ all: true }),
        winston.format.printf((info) => {
            return `${info.timestamp} ${info.level}: ${info.message}`;
        })
    ),
    transports: [
        new winston.transports.Console()
    ]
});

// Helper functions for different log levels
const logHelper = {
    error: (message, meta = {}) => {
        logger.error(message, meta);
    },
    
    warn: (message, meta = {}) => {
        logger.warn(message, meta);
    },
    
    info: (message, meta = {}) => {
        logger.info(message, meta);
    },
    
    http: (message, meta = {}) => {
        logger.http(message, meta);
    },
    
    debug: (message, meta = {}) => {
        logger.debug(message, meta);
    },
    
    trace: (message, meta = {}) => {
        logger.trace(message, meta);
    },
    
    // Special helper for API calls
    api: (method, url, status, duration) => {
        logger.http(`${method} ${url} - ${status} (${duration}ms)`);
    },
    
    // Special helper for authentication events
    auth: (event, userId = null) => {
        const message = userId ? `Auth ${event} for user ${userId}` : `Auth ${event}`;
        logger.info(message);
    },
    
    // Special helper for database operations
    db: (operation, table, duration) => {
        logger.debug(`DB ${operation} on ${table} (${duration}ms)`);
    },
    
    // Special helper for cache operations
    cache: (operation, key, hit = null) => {
        const message = hit !== null ? `Cache ${operation} ${key} - ${hit ? 'HIT' : 'MISS'}` : `Cache ${operation} ${key}`;
        logger.debug(message);
    }
};

module.exports = {
    logger,
    log: logHelper
};
