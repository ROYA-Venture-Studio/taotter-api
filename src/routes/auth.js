const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const { 
  authenticate, 
  refreshTokenAuth, 
  generateTokens,
  requireVerification,
  userRateLimit
} = require('../middleware/auth');
const { validate, userSchemas } = require('../utils/validation');
const logger = require('../utils/logger');
const { sendEmail, sendSMS } = require('../utils/communications');

const router = express.Router();

// Initialize Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Register user
router.post('/register', 
  userRateLimit(5, 15 * 60 * 1000), // 5 attempts per 15 minutes
  validate(userSchemas.register),
  catchAsync(async (req, res, next) => {
    const { email, phone, password, firstName, lastName, company } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [
        { email },
        ...(phone ? [{ phone }] : [])
      ]
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return next(new AppError('Email is already registered', 409, 'EMAIL_EXISTS'));
      }
      if (existingUser.phone === phone) {
        return next(new AppError('Phone number is already registered', 409, 'PHONE_EXISTS'));
      }
    }

    // Create new user
    const user = new User({
      email,
      phone,
      password,
      profile: {
        firstName,
        lastName,
        company
      }
    });

    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Store refresh token
    await user.addRefreshToken({
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      deviceInfo: req.get('User-Agent') || 'Unknown'
    });

    logger.logAuth('REGISTER', user._id, req.ip);

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          profile: user.profile,
          role: user.role,
          status: user.status,
          verification: {
            email: user.verification.email.isVerified,
            phone: user.verification.phone.isVerified
          }
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRE || '15m'
        }
      },
      message: 'User registered successfully'
    });
  })
);

// Login user
router.post('/login',
  userRateLimit(10, 15 * 60 * 1000), // 10 attempts per 15 minutes
  validate(userSchemas.login),
  catchAsync(async (req, res, next) => {
    const { email, password } = req.body;

    // Find user and include password for comparison
    const user = await User.findOne({ email }).select('+password +authentication');

    if (!user || !(await user.comparePassword(password))) {
      // Increment login attempts if user exists
      if (user) {
        await user.incLoginAttempts();
      }
      
      logger.logAuth('LOGIN_FAILED', user?._id || 'Unknown', req.ip, false);
      return next(new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
    }

    // Check if account is locked
    if (user.isLocked) {
      logger.logAuth('LOGIN_LOCKED', user._id, req.ip, false);
      return next(new AppError('Account is temporarily locked. Try again later.', 423, 'ACCOUNT_LOCKED'));
    }

    // Check if account is active
    if (user.status !== 'active') {
      logger.logAuth('LOGIN_SUSPENDED', user._id, req.ip, false);
      return next(new AppError('Account has been suspended. Contact support.', 403, 'ACCOUNT_SUSPENDED'));
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Update last login
    user.authentication.lastLoginAt = new Date();
    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Store refresh token
    await user.addRefreshToken({
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      deviceInfo: req.get('User-Agent') || 'Unknown'
    });

    logger.logAuth('LOGIN', user._id, req.ip);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          profile: user.profile,
          role: user.role,
          status: user.status,
          verification: {
            email: user.verification.email.isVerified,
            phone: user.verification.phone.isVerified
          }
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRE || '15m'
        }
      },
      message: 'Login successful'
    });
  })
);

// Google OAuth login
router.post('/google',
  userRateLimit(10, 15 * 60 * 1000),
  validate(userSchemas.googleAuth),
  catchAsync(async (req, res, next) => {
    const { googleToken } = req.body;

    if (!process.env.GOOGLE_CLIENT_ID) {
      return next(new AppError('Google authentication is not configured', 503, 'GOOGLE_AUTH_DISABLED'));
    }

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: googleToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, given_name: firstName, family_name: lastName, picture: avatar } = payload;

    // Find or create user
    let user = await User.findOne({
      $or: [{ googleId }, { email }]
    });

    if (user) {
      // Update Google ID if not set
      if (!user.googleId) {
        user.googleId = googleId;
        user.verification.email.isVerified = true;
        user.verification.email.verifiedAt = new Date();
        await user.save();
      }
    } else {
      // Create new user
      user = new User({
        email,
        googleId,
        profile: {
          firstName,
          lastName,
          avatar
        },
        verification: {
          email: {
            isVerified: true,
            verifiedAt: new Date()
          }
        }
      });

      await user.save();
    }

    // Check account status
    if (user.status !== 'active') {
      logger.logAuth('GOOGLE_LOGIN_SUSPENDED', user._id, req.ip, false);
      return next(new AppError('Account has been suspended. Contact support.', 403, 'ACCOUNT_SUSPENDED'));
    }

    // Update last login
    user.authentication.lastLoginAt = new Date();
    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Store refresh token
    await user.addRefreshToken({
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      deviceInfo: req.get('User-Agent') || 'Unknown'
    });

    logger.logAuth('GOOGLE_LOGIN', user._id, req.ip);

    res.json({
      success: true,
      data: {
        user: {
          id: user._id,
          email: user.email,
          profile: user.profile,
          role: user.role,
          status: user.status,
          verification: {
            email: user.verification.email.isVerified,
            phone: user.verification.phone.isVerified
          }
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRE || '15m'
        }
      },
      message: 'Google login successful'
    });
  })
);

// Refresh access token
router.post('/refresh',
  userRateLimit(20, 15 * 60 * 1000),
  validate(userSchemas.refreshToken),
  refreshTokenAuth,
  catchAsync(async (req, res, next) => {
    const user = req.user;
    const oldRefreshToken = req.refreshToken;

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);

    // Remove old refresh token and add new one
    await user.removeRefreshToken(oldRefreshToken);
    await user.addRefreshToken({
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      deviceInfo: req.get('User-Agent') || 'Unknown'
    });

    logger.logAuth('TOKEN_REFRESH', user._id, req.ip);

    res.json({
      success: true,
      data: {
        tokens: {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn: process.env.JWT_EXPIRE || '15m'
        }
      },
      message: 'Token refreshed successfully'
    });
  })
);

// Logout (invalidate refresh token)
router.post('/logout',
  authenticate,
  catchAsync(async (req, res, next) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await req.user.removeRefreshToken(refreshToken);
    }

    logger.logAuth('LOGOUT', req.user._id, req.ip);

    res.json({
      success: true,
      message: 'Logout successful'
    });
  })
);

// Logout from all devices
router.post('/logout-all',
  authenticate,
  catchAsync(async (req, res, next) => {
    req.user.authentication.refreshTokens = [];
    await req.user.save();

    logger.logAuth('LOGOUT_ALL', req.user._id, req.ip);

    res.json({
      success: true,
      message: 'Logged out from all devices'
    });
  })
);

// Send phone verification code
router.post('/verify-phone/send',
  authenticate,
  requireVerification('phone'),
  userRateLimit(3, 15 * 60 * 1000), // 3 attempts per 15 minutes
  catchAsync(async (req, res, next) => {
    const user = req.user;

    if (!user.phone) {
      return next(new AppError('Phone number is not set', 400, 'PHONE_NOT_SET'));
    }

    // Generate verification code
    const verificationCode = user.generatePhoneVerificationCode();
    await user.save();

    // Send SMS (if SMS service is enabled)
    if (process.env.ENABLE_SMS_VERIFICATION === 'true') {
      try {
        await sendSMS(user.phone, `Your Taotter verification code is: ${verificationCode}`);
      } catch (error) {
        logger.logError(error, 'SMS Verification');
        return next(new AppError('Failed to send verification code', 500, 'SMS_SEND_FAILED'));
      }
    }

    logger.logAuth('PHONE_VERIFICATION_SENT', user._id, req.ip);

    res.json({
      success: true,
      message: 'Verification code sent successfully',
      data: {
        // In development, return the code for testing
        ...(process.env.NODE_ENV === 'development' && { verificationCode })
      }
    });
  })
);

// Verify phone number
router.post('/verify-phone',
  authenticate,
  validate(userSchemas.verifyPhone),
  userRateLimit(5, 15 * 60 * 1000), // 5 attempts per 15 minutes
  catchAsync(async (req, res, next) => {
    const { verificationCode } = req.body;
    const user = req.user;

    const isValid = user.verifyPhoneCode(verificationCode);

    if (!isValid) {
      logger.logAuth('PHONE_VERIFICATION_FAILED', user._id, req.ip, false);
      return next(new AppError('Invalid or expired verification code', 400, 'INVALID_VERIFICATION_CODE'));
    }

    await user.save();

    logger.logAuth('PHONE_VERIFIED', user._id, req.ip);

    res.json({
      success: true,
      message: 'Phone number verified successfully',
      data: {
        user: {
          verification: {
            phone: user.verification.phone.isVerified
          }
        }
      }
    });
  })
);

// Forgot password
router.post('/forgot-password',
  userRateLimit(3, 15 * 60 * 1000), // 3 attempts per 15 minutes
  validate(userSchemas.forgotPassword),
  catchAsync(async (req, res, next) => {
    const { email } = req.body;

    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if email exists or not
      return res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save();

    // Send email (if email service is enabled)
    if (process.env.ENABLE_EMAIL_VERIFICATION === 'true') {
      try {
        const resetURL = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        sendEmail({
          to: user.email,
          subject: 'Password Reset Request',
          template: 'passwordReset',
          data: {
            name: user.profile.firstName,
            resetURL,
            expiresIn: '10 minutes'
          }
        }).catch(err => logger.logError(err, 'Async Email Send'));
      } catch (error) {
        logger.logError(error, 'Password Reset Email');
        user.authentication.passwordResetToken = undefined;
        user.authentication.passwordResetExpires = undefined;
        await user.save();
        return next(new AppError('Failed to send reset email', 500, 'EMAIL_SEND_FAILED'));
      }
    }

    logger.logAuth('PASSWORD_RESET_REQUESTED', user._id, req.ip);

    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent',
      data: {
        // In development, return the token for testing
        ...(process.env.NODE_ENV === 'development' && { resetToken })
      }
    });
  })
);

// Reset password
router.post('/reset-password',
  userRateLimit(5, 15 * 60 * 1000),
  validate(userSchemas.resetPassword),
  catchAsync(async (req, res, next) => {
    const { resetToken, newPassword } = req.body;

    // Find user by reset token
    const user = await User.findByResetToken(resetToken);

    if (!user) {
      return next(new AppError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN'));
    }

    // Update password
    user.password = newPassword;
    user.authentication.passwordResetToken = undefined;
    user.authentication.passwordResetExpires = undefined;
    
    // Clear all refresh tokens for security
    user.authentication.refreshTokens = [];
    
    await user.save();

    logger.logAuth('PASSWORD_RESET', user._id, req.ip);

    res.json({
      success: true,
      message: 'Password reset successfully. Please log in with your new password.'
    });
  })
);

// Get current user
router.get('/me',
  authenticate,
  catchAsync(async (req, res, next) => {
    res.json({
      success: true,
      data: {
        user: req.user
      }
    });
  })
);

// Check authentication status
router.get('/status',
  authenticate,
  catchAsync(async (req, res, next) => {
    res.json({
      success: true,
      data: {
        isAuthenticated: true,
        user: {
          id: req.user._id,
          email: req.user.email,
          role: req.user.role,
          status: req.user.status
        }
      }
    });
  })
);

module.exports = router;
