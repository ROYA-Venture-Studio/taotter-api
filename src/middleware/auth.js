const jwt = require('jsonwebtoken');
const { AppError } = require('./errorHandler');
const Startup = require('../models/Startup');
const Admin = require('../models/Admin');
const logger = require('../utils/logger');

// Generate JWT token
const generateToken = (payload, secret, expiresIn) => {
  return jwt.sign(payload, secret, { expiresIn });
};

// Generate tokens for startup
const generateStartupTokens = (startup) => {
  const payload = {
    id: startup._id,
    email: startup.email,
    userType: 'startup'
  };
  
  const accessToken = generateToken(
    payload,
    process.env.JWT_SECRET,
    process.env.JWT_EXPIRE || '15m'
  );
  
  const refreshToken = generateToken(
    payload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRE || '7d'
  );
  
  return { accessToken, refreshToken };
};

// Generate tokens for admin
const generateAdminTokens = (admin) => {
  const payload = {
    id: admin._id,
    email: admin.email,
    userType: 'admin',
    role: admin.role
  };
  
  const accessToken = generateToken(
    payload,
    process.env.JWT_SECRET,
    process.env.JWT_EXPIRE || '15m'
  );
  
  const refreshToken = generateToken(
    payload,
    process.env.JWT_REFRESH_SECRET,
    process.env.JWT_REFRESH_EXPIRE || '7d'
  );
  
  return { accessToken, refreshToken };
};

// Verify JWT token
const verifyToken = (token, secret) => {
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw new AppError('Token has expired', 401, 'TOKEN_EXPIRED');
    } else if (error.name === 'JsonWebTokenError') {
      throw new AppError('Invalid token', 401, 'INVALID_TOKEN');
    } else {
      throw new AppError('Token verification failed', 401, 'TOKEN_VERIFICATION_FAILED');
    }
  }
};

// Base authentication middleware
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('No token provided', 401, 'NO_TOKEN'));
    }
    
    const token = authHeader.substring(7);
    
    // Verify token
    const decoded = verifyToken(token, process.env.JWT_SECRET);
    
    let user;
    
    // Get user based on type
    if (decoded.userType === 'startup') {
      user = await Startup.findById(decoded.id).select('+password');
      
      if (!user) {
        return next(new AppError('Startup not found', 401, 'USER_NOT_FOUND'));
      }
      
      // Check if startup account is active
      if (user.status === 'suspended') {
        return next(new AppError('Account is suspended', 401, 'ACCOUNT_SUSPENDED'));
      }
      
      if (user.status === 'inactive') {
        return next(new AppError('Account is inactive', 401, 'ACCOUNT_INACTIVE'));
      }
      
      // Update last active time
      user.engagement.lastActiveAt = new Date();
      await user.save();
      
    } else if (decoded.userType === 'admin') {
      user = await Admin.findById(decoded.id).select('+password');
      
      if (!user) {
        return next(new AppError('Admin not found', 401, 'USER_NOT_FOUND'));
      }
      
      // Check if admin account is active
      if (user.status === 'suspended') {
        return next(new AppError('Account is suspended', 401, 'ACCOUNT_SUSPENDED'));
      }
      
      if (user.status === 'inactive') {
        return next(new AppError('Account is inactive', 401, 'ACCOUNT_INACTIVE'));
      }
      
      // Update last active time
      user.activity.lastActiveAt = new Date();
      await user.save();
      
    } else {
      return next(new AppError('Invalid user type', 401, 'INVALID_USER_TYPE'));
    }
    
    // Check if account is locked
    if (user.isLocked) {
      return next(new AppError('Account is temporarily locked', 401, 'ACCOUNT_LOCKED'));
    }
    
    // Attach user to request
    req.user = user;
    req.userType = decoded.userType;
    
    // Log authentication
    logger.logAuth('AUTH_SUCCESS', `${decoded.userType} ${user.email}`, req.ip);
    
    next();
  } catch (error) {
    logger.logSecurity('AUTH_FAILED', error.message, req.ip);
    next(error);
  }
};

// Startup-only authentication middleware
const authenticateStartup = async (req, res, next) => {
  await authenticate(req, res, (error) => {
    if (error) return next(error);
    
    if (req.userType !== 'startup') {
      return next(new AppError('Access denied. Startup account required.', 403, 'STARTUP_REQUIRED'));
    }
    
    next();
  });
};

// Admin-only authentication middleware
const authenticateAdmin = async (req, res, next) => {
  await authenticate(req, res, (error) => {
    if (error) return next(error);
    
    if (req.userType !== 'admin') {
      return next(new AppError('Access denied. Admin account required.', 403, 'ADMIN_REQUIRED'));
    }
    
    next();
  });
};

// Super admin only middleware
const authenticateSuperAdmin = async (req, res, next) => {
  await authenticateAdmin(req, res, (error) => {
    if (error) return next(error);
    
    if (req.user.role !== 'super_admin') {
      return next(new AppError('Access denied. Super admin privileges required.', 403, 'SUPER_ADMIN_REQUIRED'));
    }
    
    next();
  });
};

// Permission-based authorization middleware
const authorize = (...permissions) => {
  return (req, res, next) => {
    // Only admins have permissions
    if (req.userType !== 'admin') {
      return next(new AppError('Access denied. Admin account required.', 403, 'ADMIN_REQUIRED'));
    }
    
    // Super admins have all permissions
    if (req.user.role === 'super_admin') {
      return next();
    }
    
    // Check if admin has required permissions
    const hasPermission = permissions.some(permission => {
      const [resource, action] = permission.split('.');
      return req.user.hasPermission(resource, action);
    });
    
    if (!hasPermission) {
      return next(new AppError('Insufficient permissions', 403, 'INSUFFICIENT_PERMISSIONS'));
    }
    
    next();
  };
};

// Optional authentication middleware (doesn't fail if no token)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(); // Continue without authentication
    }
    
    const token = authHeader.substring(7);
    const decoded = verifyToken(token, process.env.JWT_SECRET);
    
    let user;
    
    if (decoded.userType === 'startup') {
      user = await Startup.findById(decoded.id);
    } else if (decoded.userType === 'admin') {
      user = await Admin.findById(decoded.id);
    }
    
    if (user && user.status === 'active' && !user.isLocked) {
      req.user = user;
      req.userType = decoded.userType;
    }
    
    next();
  } catch (error) {
    // Continue without authentication if token is invalid
    next();
  }
};

// Middleware to check if user owns resource or is admin
const ownerOrAdmin = (resourceUserIdPath = 'startupId') => {
  return (req, res, next) => {
    // Admins can access any resource
    if (req.userType === 'admin') {
      return next();
    }
    
    // For startups, check if they own the resource
    if (req.userType === 'startup') {
      const resourceUserId = req.params[resourceUserIdPath] || req.body[resourceUserIdPath];
      
      if (!resourceUserId) {
        return next(new AppError('Resource user ID not found', 400, 'RESOURCE_USER_ID_MISSING'));
      }
      
      if (req.user._id.toString() !== resourceUserId.toString()) {
        return next(new AppError('Access denied. You can only access your own resources.', 403, 'RESOURCE_ACCESS_DENIED'));
      }
    }
    
    next();
  };
};

// Middleware to validate refresh token
const validateRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return next(new AppError('Refresh token is required', 400, 'REFRESH_TOKEN_REQUIRED'));
    }
    
    // Verify refresh token
    const decoded = verifyToken(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    let user;
    
    // Get user based on type
    if (decoded.userType === 'startup') {
      user = await Startup.findById(decoded.id);
    } else if (decoded.userType === 'admin') {
      user = await Admin.findById(decoded.id);
    } else {
      return next(new AppError('Invalid user type in token', 400, 'INVALID_TOKEN_USER_TYPE'));
    }
    
    if (!user) {
      return next(new AppError('User not found', 401, 'USER_NOT_FOUND'));
    }
    
    // Check if refresh token exists in user's tokens
    const tokenExists = user.authentication.refreshTokens.some(
      token => token.token === refreshToken && token.expiresAt > new Date()
    );
    
    if (!tokenExists) {
      return next(new AppError('Invalid or expired refresh token', 401, 'INVALID_REFRESH_TOKEN'));
    }
    
    req.user = user;
    req.userType = decoded.userType;
    req.refreshToken = refreshToken;
    
    next();
  } catch (error) {
    next(error);
  }
};

// Rate limiting for login attempts
const loginRateLimit = async (req, res, next) => {
  try {
    const { email } = req.body;
    const clientIP = req.ip;
    
    // This is a simple in-memory rate limiting
    // In production, you'd want to use Redis
    if (!req.app.locals.loginAttempts) {
      req.app.locals.loginAttempts = {};
    }
    
    const key = `${email}_${clientIP}`;
    const attempts = req.app.locals.loginAttempts[key] || { count: 0, resetTime: Date.now() };
    
    // Reset counter every 15 minutes
    if (Date.now() > attempts.resetTime) {
      attempts.count = 0;
      attempts.resetTime = Date.now() + 15 * 60 * 1000; // 15 minutes
    }
    
    // Allow max 5 attempts per 15 minutes
    if (attempts.count >= 5) {
      logger.logSecurity('RATE_LIMIT_LOGIN', `Too many login attempts for ${email}`, clientIP);
      return next(new AppError('Too many login attempts. Please try again later.', 429, 'TOO_MANY_ATTEMPTS'));
    }
    
    // Increment attempt counter
    attempts.count++;
    req.app.locals.loginAttempts[key] = attempts;
    
    next();
  } catch (error) {
    next(error);
  }
};

// Middleware to check if startup has completed onboarding
const requireOnboarding = (req, res, next) => {
  if (req.userType === 'startup' && !req.user.onboarding.isCompleted) {
    return next(new AppError('Please complete your onboarding first', 403, 'ONBOARDING_REQUIRED'));
  }
  next();
};

// Middleware to check email verification
const requireEmailVerification = (req, res, next) => {
  if (req.userType === 'startup' && !req.user.verification.email.isVerified) {
    return next(new AppError('Please verify your email address first', 403, 'EMAIL_VERIFICATION_REQUIRED'));
  }
  next();
};

module.exports = {
  generateStartupTokens,
  generateAdminTokens,
  verifyToken,
  authenticate,
  authenticateStartup,
  authenticateAdmin,
  authenticateSuperAdmin,
  authorize,
  optionalAuth,
  ownerOrAdmin,
  validateRefreshToken,
  loginRateLimit,
  requireOnboarding,
  requireEmailVerification
};
