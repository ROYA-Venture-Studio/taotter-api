const winston = require('winston');
const path = require('path');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`,
  ),
);

// Define transports
const transports = [
  // Console transport
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }),
];

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  // Create logs directory if it doesn't exist
  const fs = require('fs');
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  transports.push(
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
  exitOnError: false,
});

// Handle uncaught exceptions and unhandled rejections
if (process.env.NODE_ENV === 'production') {
  logger.exceptions.handle(
    new winston.transports.File({ 
      filename: path.join(process.cwd(), 'logs', 'exceptions.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    })
  );

  logger.rejections.handle(
    new winston.transports.File({ 
      filename: path.join(process.cwd(), 'logs', 'rejections.log'),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    })
  );
}

// Create a stream for Morgan HTTP logging
logger.stream = {
  write: (message) => {
    logger.http(message.substring(0, message.lastIndexOf('\n')));
  },
};

// Helper functions for common logging patterns
logger.logError = (error, context = '') => {
  const errorMessage = error.stack || error.message || error;
  logger.error(`${context ? `[${context}] ` : ''}${errorMessage}`);
};

logger.logRequest = (req, res, responseTime) => {
  const { method, url, ip } = req;
  const { statusCode } = res;
  const userAgent = req.get('User-Agent') || 'Unknown';
  
  logger.http(
    `${method} ${url} ${statusCode} ${responseTime}ms - ${ip} - ${userAgent}`
  );
};

logger.logAuth = (action, userId, ip, success = true) => {
  const status = success ? 'SUCCESS' : 'FAILED';
  logger.info(`AUTH [${status}] ${action} - User: ${userId} - IP: ${ip}`);
};

logger.logDatabase = (action, collection, documentId = null) => {
  const doc = documentId ? ` - Doc: ${documentId}` : '';
  logger.debug(`DB ${action} - Collection: ${collection}${doc}`);
};

logger.logSocket = (event, userId, socketId) => {
  logger.debug(`SOCKET [${event}] - User: ${userId} - Socket: ${socketId}`);
};

logger.logSecurity = (event, details, ip) => {
  logger.warn(`SECURITY [${event}] - ${details} - IP: ${ip}`);
};

module.exports = logger;
