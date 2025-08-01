const express = require('express');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const Startup = require('../models/Startup');
const { AppError } = require('../middleware/errorHandler');
const { 
  generateStartupTokens, 
  authenticateStartup, 
  validateRefreshToken,
  loginRateLimit 
} = require('../middleware/auth');
const { validate } = require('../utils/validation'); // <-- FIXED: use 'validate'
const logger = require('../utils/logger');
const { sendEmail, sendSMS } = require('../utils/communications');

const router = express.Router();

// Initialize Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Validation schemas
const Joi = require('joi');
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
  profile: Joi.object({
    founderFirstName: Joi.string().min(2).max(50).required(),
    founderLastName: Joi.string().min(2).max(50).required(),
    companyName: Joi.string().max(100).optional()
  }).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});

// @route   POST /api/startup/auth/register
// @desc    Register a new startup
// @access  Public
router.post('/register', validate(registerSchema), async (req, res, next) => {
  try {
    const { email, password, phone, profile } = req.body;
    
    // Check if startup already exists
    const existingStartup = await Startup.findOne({ email });
    if (existingStartup) {
      return next(new AppError('Startup already exists with this email', 400, 'STARTUP_EXISTS'));
    }
    
    // Check if phone number is already used
    if (phone) {
      const existingPhone = await Startup.findOne({ phone });
      if (existingPhone) {
        return next(new AppError('Phone number already registered', 400, 'PHONE_EXISTS'));
      }
    }
    
    // Create startup
    const startup = new Startup({
      email,
      password,
      phone,
      profile
    });
    
    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    startup.verification.email.verificationToken = crypto
      .createHash('sha256')
      .update(emailVerificationToken)
      .digest('hex');
    
    await startup.save();
    
    // Generate tokens
    const { accessToken, refreshToken } = generateStartupTokens(startup);
    
    // Store refresh token
    await startup.addRefreshToken({
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      deviceInfo: req.headers['user-agent'] || 'Unknown'
    });
    
    // Send welcome email (Azure Communication Services)
    try {
      await sendEmail({
        to: email,
        template: 'signupSuccess',
        data: {
          name: `${profile.founderFirstName} ${profile.founderLastName}`,
          dashboardUrl: process.env.FRONTEND_URL + '/dashboard'
        }
      });
    } catch (emailError) {
      logger.logError('Welcome email sending failed during registration', emailError, { email });
    }

    // Send verification email (legacy, if enabled)
    if (process.env.ENABLE_EMAIL_VERIFICATION === 'true') {
      try {
        const verificationUrl = `${process.env.FRONTEND_URL}/startup/verify-email?token=${emailVerificationToken}`;
        await sendEmail({
          to: email,
          subject: 'Welcome to Taotter - Verify Your Email',
          template: 'startup-welcome',
          data: {
            founderName: startup.founderFullName,
            verificationUrl,
            companyName: profile.companyName || 'your startup'
          }
        });
      } catch (emailError) {
        logger.logError('Email sending failed during registration', emailError, { email });
      }
    }
    
    // Log successful registration
    logger.logAuth('STARTUP_REGISTER_SUCCESS', email, req.ip);
    
    res.status(201).json({
      success: true,
      message: 'Startup registered successfully',
      data: {
        startup: {
          id: startup._id,
          email: startup.email,
          profile: startup.profile,
          onboarding: startup.onboarding,
          verification: {
            email: {
              isVerified: startup.verification.email.isVerified
            },
            phone: {
              isVerified: startup.verification.phone.isVerified
            }
          }
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRE || '15m'
        }
      }
    });
    
  } catch (error) {
    logger.logError('Startup registration failed', error, { email: req.body.email });
    next(error);
  }
});

// @route   POST /api/startup/auth/login
// @desc    Login startup
// @access  Public
router.post('/login', loginRateLimit, validate(loginSchema), async (req, res, next) => {
  try {
    const { email, password, deviceInfo } = req.body;
    
    // Find startup and include password
    const startup = await Startup.findOne({ email }).select('+password');
    
    if (!startup) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Prevent timing attacks
      return next(new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
    }
    
    // Check if account is locked
    if (startup.isLocked) {
      const lockTime = Math.ceil((startup.authentication.lockedUntil - Date.now()) / (1000 * 60));
      return next(new AppError(`Account locked for ${lockTime} minutes`, 401, 'ACCOUNT_LOCKED'));
    }
    
    // Check password
    const isPasswordValid = await startup.comparePassword(password);
    
    if (!isPasswordValid) {
      await startup.incLoginAttempts();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Prevent timing attacks
      
      logger.logSecurity('STARTUP_LOGIN_FAILED', `Invalid password for ${email}`, req.ip);
      return next(new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
    }
    
    // Reset login attempts on successful login
    if (startup.authentication.loginAttempts > 0) {
      await startup.resetLoginAttempts();
    }
    
    // Update last login
    startup.authentication.lastLoginAt = new Date();
    await startup.save();
    
    // Generate tokens
    const { accessToken, refreshToken } = generateStartupTokens(startup);
    
    // Store refresh token
    await startup.addRefreshToken({
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      deviceInfo: deviceInfo || req.headers['user-agent'] || 'Unknown'
    });
    
    // Log successful login
    logger.logAuth('STARTUP_LOGIN_SUCCESS', email, req.ip);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        startup: {
          id: startup._id,
          email: startup.email,
          profile: startup.profile,
          onboarding: startup.onboarding,
          status: startup.status,
          verification: {
            email: {
              isVerified: startup.verification.email.isVerified
            },
            phone: {
              isVerified: startup.verification.phone.isVerified
            }
          }
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRE || '15m'
        }
      }
    });
    
  } catch (error) {
    logger.logError('Startup login failed', error, { email: req.body.email });
    next(error);
  }
});

// ... rest of the file remains unchanged ...
module.exports = router;
