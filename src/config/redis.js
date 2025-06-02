const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
  try {
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    };

    // Add password if provided
    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
    }

    // Create Redis client
    redisClient = redis.createClient(redisConfig);

    // Event listeners
    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis client error:', err);
    });

    redisClient.on('end', () => {
      logger.warn('Redis client disconnected');
    });

    // Connect to Redis
    await redisClient.connect();

    // Test the connection
    await redisClient.ping();
    logger.info('Redis connection successful');

    return redisClient;

  } catch (error) {
    logger.error('Redis connection failed:', error);
    // Don't throw error - Redis is optional for basic functionality
    return null;
  }
};

const getRedisClient = () => {
  return redisClient;
};

const disconnectRedis = async () => {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.quit();
      logger.info('Redis disconnected successfully');
    }
  } catch (error) {
    logger.error('Error disconnecting from Redis:', error);
  }
};

// Cache utility functions
const cacheSet = async (key, value, expireInSeconds = 3600) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }

    const serializedValue = JSON.stringify(value);
    await redisClient.setEx(key, expireInSeconds, serializedValue);
    return true;
  } catch (error) {
    logger.error('Redis SET error:', error);
    return false;
  }
};

const cacheGet = async (key) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return null;
    }

    const cachedValue = await redisClient.get(key);
    if (cachedValue) {
      return JSON.parse(cachedValue);
    }
    return null;
  } catch (error) {
    logger.error('Redis GET error:', error);
    return null;
  }
};

const cacheDel = async (key) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }

    await redisClient.del(key);
    return true;
  } catch (error) {
    logger.error('Redis DELETE error:', error);
    return false;
  }
};

const cacheExists = async (key) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }

    const exists = await redisClient.exists(key);
    return exists === 1;
  } catch (error) {
    logger.error('Redis EXISTS error:', error);
    return false;
  }
};

const cacheIncr = async (key, increment = 1) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return null;
    }

    const result = await redisClient.incrBy(key, increment);
    return result;
  } catch (error) {
    logger.error('Redis INCR error:', error);
    return null;
  }
};

const cacheExpire = async (key, expireInSeconds) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      return false;
    }

    await redisClient.expire(key, expireInSeconds);
    return true;
  } catch (error) {
    logger.error('Redis EXPIRE error:', error);
    return false;
  }
};

// Session management utilities
const setUserSession = async (userId, sessionData, expireInSeconds = 86400) => {
  const sessionKey = `session:${userId}`;
  return await cacheSet(sessionKey, sessionData, expireInSeconds);
};

const getUserSession = async (userId) => {
  const sessionKey = `session:${userId}`;
  return await cacheGet(sessionKey);
};

const deleteUserSession = async (userId) => {
  const sessionKey = `session:${userId}`;
  return await cacheDel(sessionKey);
};

// Rate limiting utilities
const incrementRateLimit = async (identifier, windowSeconds = 900) => {
  const key = `rate_limit:${identifier}`;
  const current = await cacheIncr(key);
  
  if (current === 1) {
    await cacheExpire(key, windowSeconds);
  }
  
  return current;
};

const getRateLimit = async (identifier) => {
  const key = `rate_limit:${identifier}`;
  const value = await cacheGet(key);
  return value || 0;
};

module.exports = {
  connectRedis,
  getRedisClient,
  disconnectRedis,
  cacheSet,
  cacheGet,
  cacheDel,
  cacheExists,
  cacheIncr,
  cacheExpire,
  setUserSession,
  getUserSession,
  deleteUserSession,
  incrementRateLimit,
  getRateLimit
};
