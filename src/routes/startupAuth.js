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
const { validateInput } = require('../utils/validation');
const logger = require('../utils/logger');
const { sendEmail, sendSMS } = require('../utils/communications');

const router = express.Router();

// Initialize Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Validation schemas
const registerSchema = {
  email: {
    required: true,
    type: 'email',
    message: 'Valid email is required'
  },
  password: {
    required: true,
    type: 'string',
    minLength: 8,
    message: 'Password must be at least 8 characters'
  },
  'profile.founderFirstName': {
    required: true,
    type: 'string',
    minLength: 2,
    maxLength: 50,
    message: 'Founder first name is required (2-50 characters)'
  },
  'profile.founderLastName': {
    required: true,
    type: 'string',
    minLength: 2,
    maxLength: 50,
    message: 'Founder last name is required (2-50 characters)'
  },
  'profile.companyName': {
    required: false,
    type: 'string',
    maxLength: 100,
    message: 'Company name cannot exceed 100 characters'
  },
  phone: {
    required: false,
    type: 'string',
    pattern: /^\+?[1-9]\d{1,14}$/,
    message: 'Valid phone number is required'
  }
};

const loginSchema = {
  email: {
    required: true,
    type: 'email',
    message: 'Valid email is required'
  },
  password: {
    required: true,
    type: 'string',
    message: 'Password is required'
  }
};

// @route   POST /api/startup/auth/register
// @desc    Register a new startup
// @access  Public
router.post('/register', validateInput(registerSchema), async (req, res, next) => {
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
    
    // Send verification email
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
router.post('/login', loginRateLimit, validateInput(loginSchema), async (req, res, next) => {
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

// @route   POST /api/startup/auth/google
// @desc    Google OAuth login
// @access  Public
router.post('/google', async (req, res, next) => {
  try {
    const { googleToken, deviceInfo } = req.body;
    
    if (!googleToken) {
      return next(new AppError('Google token is required', 400, 'GOOGLE_TOKEN_REQUIRED'));
    }
    
    if (!process.env.GOOGLE_CLIENT_ID) {
      return next(new AppError('Google OAuth not configured', 500, 'GOOGLE_OAUTH_NOT_CONFIGURED'));
    }
    
    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    const { sub: googleId, email, given_name, family_name, picture } = payload;
    
    if (!email) {
      return next(new AppError('Email not provided by Google', 400, 'GOOGLE_EMAIL_MISSING'));
    }
    
    // Check if startup exists
    let startup = await Startup.findOne({ 
      $or: [
        { email },
        { googleId }
      ]
    });
    
    if (startup) {
      // Update Google ID if not set
      if (!startup.googleId) {
        startup.googleId = googleId;
      }
      
      // Update profile if missing data
      if (!startup.profile.founderFirstName && given_name) {
        startup.profile.founderFirstName = given_name;
      }
      if (!startup.profile.founderLastName && family_name) {
        startup.profile.founderLastName = family_name;
      }
      if (!startup.profile.avatar && picture) {
        startup.profile.avatar = picture;
      }
      
      // Mark email as verified since it's from Google
      if (!startup.verification.email.isVerified) {
        startup.verification.email.isVerified = true;
        startup.verification.email.verifiedAt = new Date();
      }
      
      // Update last login
      startup.authentication.lastLoginAt = new Date();
      await startup.save();
      
    } else {
      // Create new startup
      startup = new Startup({
        email,
        googleId,
        profile: {
          founderFirstName: given_name || 'User',
          founderLastName: family_name || 'Google',
          avatar: picture
        },
        verification: {
          email: {
            isVerified: true,
            verifiedAt: new Date()
          }
        },
        authentication: {
          lastLoginAt: new Date()
        }
      });
      
      await startup.save();
      
      logger.logAuth('STARTUP_GOOGLE_REGISTER', email, req.ip);
    }
    
    // Generate tokens
    const { accessToken, refreshToken } = generateStartupTokens(startup);
    
    // Store refresh token
    await startup.addRefreshToken({
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      deviceInfo: deviceInfo || req.headers['user-agent'] || 'Unknown'
    });
    
    // Log successful login
    logger.logAuth('STARTUP_GOOGLE_LOGIN_SUCCESS', email, req.ip);
    
    res.json({
      success: true,
      message: startup.isNew ? 'Account created successfully' : 'Login successful',
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
    logger.logError('Google OAuth failed', error, { body: req.body });
    
    if (error.message.includes('Token used too late')) {
      return next(new AppError('Google token expired', 400, 'GOOGLE_TOKEN_EXPIRED'));
    }
    
    next(new AppError('Google authentication failed', 400, 'GOOGLE_AUTH_FAILED'));
  }
});

// @route   POST /api/startup/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', validateRefreshToken, async (req, res, next) => {
  try {
    const { user: startup, refreshToken: oldRefreshToken } = req;
    
    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateStartupTokens(startup);
    
    // Remove old refresh token and add new one
    await startup.removeRefreshToken(oldRefreshToken);
    await startup.addRefreshToken({
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      deviceInfo: req.headers['user-agent'] || 'Unknown'
    });
    
    logger.logAuth('STARTUP_TOKEN_REFRESH', startup.email, req.ip);
    
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        tokens: {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn: process.env.JWT_EXPIRE || '15m'
        }
      }
    });
    
  } catch (error) {
    logger.logError('Token refresh failed', error);
    next(error);
  }
});

// @route   POST /api/startup/auth/logout
// @desc    Logout startup
// @access  Private
router.post('/logout', authenticateStartup, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      await req.user.removeRefreshToken(refreshToken);
    }
    
    logger.logAuth('STARTUP_LOGOUT', req.user.email, req.ip);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    logger.logError('Logout failed', error);
    next(error);
  }
});

// @route   GET /api/startup/auth/me
// @desc    Get current startup info
// @access  Private
router.get('/me', authenticateStartup, async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        startup: {
          id: req.user._id,
          email: req.user.email,
          profile: req.user.profile,
          onboarding: req.user.onboarding,
          status: req.user.status,
          engagement: req.user.engagement,
          verification: {
            email: {
              isVerified: req.user.verification.email.isVerified
            },
            phone: {
              isVerified: req.user.verification.phone.isVerified
            }
          },
          createdAt: req.user.createdAt,
          updatedAt: req.user.updatedAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/startup/auth/verify-email
// @desc    Verify email address
// @access  Public
router.post('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return next(new AppError('Verification token is required', 400, 'TOKEN_REQUIRED'));
    }
    
    // Hash the token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    // Find startup with this token
    const startup = await Startup.findOne({
      'verification.email.verificationToken': hashedToken
    });
    
    if (!startup) {
      return next(new AppError('Invalid or expired verification token', 400, 'INVALID_TOKEN'));
    }
    
    // Mark email as verified
    startup.verification.email.isVerified = true;
    startup.verification.email.verifiedAt = new Date();
    startup.verification.email.verificationToken = undefined;
    
    // Update onboarding step if needed
    if (startup.onboarding.currentStep === 'verification') {
      startup.onboarding.currentStep = 'completed';
    }
    
    await startup.save();
    
    logger.logAuth('EMAIL_VERIFIED', startup.email, req.ip);
    
    res.json({
      success: true,
      message: 'Email verified successfully'
    });
    
  } catch (error) {
    logger.logError('Email verification failed', error);
    next(error);
  }
});

// @route   POST /api/startup/auth/send-phone-verification
// @desc    Send phone verification code
// @access  Private
router.post('/send-phone-verification', authenticateStartup, async (req, res, next) => {
  try {
    const startup = req.user;
    
    if (!startup.phone) {
      return next(new AppError('Phone number not provided', 400, 'PHONE_REQUIRED'));
    }
    
    if (startup.verification.phone.isVerified) {
      return next(new AppError('Phone number already verified', 400, 'PHONE_ALREADY_VERIFIED'));
    }
    
    // Generate verification code
    const verificationCode = startup.generatePhoneVerificationCode();
    await startup.save();
    
    // Send SMS
    if (process.env.ENABLE_SMS_VERIFICATION === 'true') {
      try {
        await sendSMS({
          to: startup.phone,
          message: `Your Taotter verification code is: ${verificationCode}. Valid for 10 minutes.`
        });
      } catch (smsError) {
        logger.logError('SMS sending failed', smsError);
        return next(new AppError('Failed to send verification code', 500, 'SMS_SEND_FAILED'));
      }
    }
    
    logger.logAuth('PHONE_VERIFICATION_SENT', startup.email, req.ip);
    
    res.json({
      success: true,
      message: 'Verification code sent to your phone'
    });
    
  } catch (error) {
    logger.logError('Phone verification sending failed', error);
    next(error);
  }
});

// @route   POST /api/startup/auth/verify-phone
// @desc    Verify phone number
// @access  Private
router.post('/verify-phone', authenticateStartup, async (req, res, next) => {
  try {
    const { code } = req.body;
    const startup = req.user;
    
    if (!code) {
      return next(new AppError('Verification code is required', 400, 'CODE_REQUIRED'));
    }
    
    // Verify code
    const isValid = startup.verifyPhoneCode(code);
    
    if (!isValid) {
      await startup.save(); // Save attempt count
      return next(new AppError('Invalid or expired verification code', 400, 'INVALID_CODE'));
    }
    
    await startup.save();
    
    logger.logAuth('PHONE_VERIFIED', startup.email, req.ip);
    
    res.json({
      success: true,
      message: 'Phone number verified successfully'
    });
    
  } catch (error) {
    logger.logError('Phone verification failed', error);
    next(error);
  }
});

// @route   POST /api/startup/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return next(new AppError('Email is required', 400, 'EMAIL_REQUIRED'));
    }
    
    const startup = await Startup.findOne({ email });
    
    // Always return success to prevent email enumeration
    if (!startup) {
      return res.json({
        success: true,
        message: 'If an account exists, password reset instructions have been sent'
      });
    }
    
    // Generate reset token
    const resetToken = startup.createPasswordResetToken();
    await startup.save();
    
    // Send reset email
    try {
      const resetUrl = `${process.env.FRONTEND_URL}/startup/reset-password?token=${resetToken}`;
      await sendEmail({
        to: email,
        subject: 'Password Reset Request',
        template: 'password-reset',
        data: {
          founderName: startup.founderFullName,
          resetUrl
        }
      });
    } catch (emailError) {
      startup.authentication.passwordResetToken = undefined;
      startup.authentication.passwordResetExpires = undefined;
      await startup.save();
      
      logger.logError('Password reset email failed', emailError);
      return next(new AppError('Email could not be sent', 500, 'EMAIL_SEND_FAILED'));
    }
    
    logger.logAuth('PASSWORD_RESET_REQUESTED', email, req.ip);
    
    res.json({
      success: true,
      message: 'If an account exists, password reset instructions have been sent'
    });
    
  } catch (error) {
    logger.logError('Password reset request failed', error);
    next(error);
  }
});

// @route   POST /api/startup/auth/reset-password
// @desc    Reset password
// @access  Public
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return next(new AppError('Token and password are required', 400, 'TOKEN_PASSWORD_REQUIRED'));
    }
    
    if (password.length < 8) {
      return next(new AppError('Password must be at least 8 characters', 400, 'PASSWORD_TOO_SHORT'));
    }
    
    // Find startup by reset token
    const startup = await Startup.findByResetToken(token);
    
    if (!startup) {
      return next(new AppError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN'));
    }
    
    // Update password
    startup.password = password;
    startup.authentication.passwordResetToken = undefined;
    startup.authentication.passwordResetExpires = undefined;
    
    // Reset login attempts
    await startup.resetLoginAttempts();
    
    await startup.save();
    
    logger.logAuth('PASSWORD_RESET_SUCCESS', startup.email, req.ip);
    
    res.json({
      success: true,
      message: 'Password reset successfully'
    });
    
  } catch (error) {
    logger.logError('Password reset failed', error);
    next(error);
  }
});

module.exports = router;
