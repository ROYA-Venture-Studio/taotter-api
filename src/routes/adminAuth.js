const express = require('express');
const crypto = require('crypto');
const Admin = require('../models/Admin');
const { AppError } = require('../middleware/errorHandler');
const { 
  generateAdminTokens, 
  authenticateAdmin,
  authenticateSuperAdmin,
  validateRefreshToken,
  loginRateLimit 
} = require('../middleware/auth');
const { validate } = require('../utils/validation');
const logger = require('../utils/logger');
const { sendEmail } = require('../utils/communications');

const router = express.Router();

const { userSchemas } = require('../utils/validation');

const Joi = require('joi');

const createAdminSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  profile: Joi.object({
    firstName: Joi.string().min(2).max(50).required(),
    lastName: Joi.string().min(2).max(50).required(),
    department: Joi.string().valid(
      'operations',
      'business-development',
      'technical',
      'marketing',
      'finance',
      'legal',
      'hr',
      'management'
    ).required()
  }).required(),
  role: Joi.string().valid('admin', 'super_admin').optional()
});

const inviteAdminSchema = {
  email: {
    required: true,
    type: 'email',
    message: 'Valid email is required'
  },
  'profile.firstName': {
    required: true,
    type: 'string',
    minLength: 2,
    maxLength: 50,
    message: 'First name is required (2-50 characters)'
  },
  'profile.lastName': {
    required: true,
    type: 'string',
    minLength: 2,
    maxLength: 50,
    message: 'Last name is required (2-50 characters)'
  },
  'profile.department': {
    required: true,
    type: 'string',
    enum: ['operations', 'business-development', 'technical', 'marketing', 'finance', 'legal', 'hr', 'management'],
    message: 'Valid department is required'
  },
  role: {
    required: false,
    type: 'string',
    enum: ['admin', 'super_admin'],
    message: 'Valid role is required'
  }
};

// @route   POST /api/admin/auth/login
// @desc    Login admin
// @access  Public
router.post('/login', loginRateLimit, validate(userSchemas.login), async (req, res, next) => {
  try {
    const { email, password, deviceInfo } = req.body;
    
    // Find admin and include password
    const admin = await Admin.findOne({ email }).select('+password');
    
    if (!admin) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Prevent timing attacks
      return next(new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
    }
    
    // Check if account is locked
    if (admin.isLocked) {
      const lockTime = Math.ceil((admin.authentication.lockedUntil - Date.now()) / (1000 * 60));
      return next(new AppError(`Account locked for ${lockTime} minutes`, 401, 'ACCOUNT_LOCKED'));
    }
    
    // Check password
    const isPasswordValid = await admin.comparePassword(password);
    
    if (!isPasswordValid) {
      await admin.incLoginAttempts();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Prevent timing attacks
      
      logger.logSecurity('ADMIN_LOGIN_FAILED', `Invalid password for ${email}`, req.ip);
      return next(new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS'));
    }
    
    // Reset login attempts on successful login
    if (admin.authentication.loginAttempts > 0) {
      await admin.resetLoginAttempts();
    }
    
    // Update last login
    admin.authentication.lastLoginAt = new Date();
    await admin.save();
    
    // Generate tokens
    const { accessToken, refreshToken } = generateAdminTokens(admin);
    
    // Store refresh token
    await admin.addRefreshToken({
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      deviceInfo: deviceInfo || req.headers['user-agent'] || 'Unknown'
    });
    
    // Log successful login
    logger.logAuth('ADMIN_LOGIN_SUCCESS', email, req.ip);
    
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        admin: {
          id: admin._id,
          email: admin.email,
          profile: admin.profile,
          role: admin.role,
          status: admin.status,
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRE || '15m'
        }
      }
    });
    
  } catch (error) {
    logger.logError('Admin login failed', error, { email: req.body.email });
    next(error);
  }
});

// @route   POST /api/admin/auth/refresh
// @desc    Refresh access token
// @access  Public
router.post('/refresh', validateRefreshToken, async (req, res, next) => {
  try {
    const { user: admin, refreshToken: oldRefreshToken } = req;
    
    // Ensure it's an admin refresh
    if (req.userType !== 'admin') {
      return next(new AppError('Invalid token type', 400, 'INVALID_TOKEN_TYPE'));
    }
    
    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateAdminTokens(admin);
    
    // Remove old refresh token and add new one
    await admin.removeRefreshToken(oldRefreshToken);
    await admin.addRefreshToken({
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      deviceInfo: req.headers['user-agent'] || 'Unknown'
    });
    
    logger.logAuth('ADMIN_TOKEN_REFRESH', admin.email, req.ip);
    
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
    logger.logError('Admin token refresh failed', error);
    next(error);
  }
});

// @route   POST /api/admin/auth/logout
// @desc    Logout admin
// @access  Private
router.post('/logout', authenticateAdmin, async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (refreshToken) {
      await req.user.removeRefreshToken(refreshToken);
    }
    
    logger.logAuth('ADMIN_LOGOUT', req.user.email, req.ip);
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
    
  } catch (error) {
    logger.logError('Admin logout failed', error);
    next(error);
  }
});

// @route   GET /api/admin/auth/me
// @desc    Get current admin info
// @access  Private
router.get('/me', authenticateAdmin, async (req, res, next) => {
  try {
    // Populate assigned startups
    await req.user.populate('workload.assignedStartups.startupId', 'profile.founderFirstName profile.founderLastName profile.companyName email');
    
    res.json({
      success: true,
      data: {
        admin: {
          id: req.user._id,
          email: req.user.email,
          profile: req.user.profile,
          role: req.user.role,
          permissions: req.user.permissions,
          status: req.user.status,
          workload: req.user.workload,
          activity: req.user.activity,
          workloadPercentage: req.user.workloadPercentage,
          isAvailable: req.user.isAvailable,
          createdAt: req.user.createdAt,
          updatedAt: req.user.updatedAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/admin/auth/invite
// @desc    Invite new admin (Super Admin only)
// @access  Private (Super Admin)
router.post('/invite', authenticateSuperAdmin, validate(inviteAdminSchema), async (req, res, next) => {
  try {
    const { email, profile, role = 'admin' } = req.body;
    
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return next(new AppError('Admin already exists with this email', 400, 'ADMIN_EXISTS'));
    }
    
    // Create admin without password
    const admin = new Admin({
      email,
      profile,
      role,
      status: 'inactive', // Will be activated when they set password
      createdBy: req.user._id,
      invitedBy: req.user._id
    });
    
    // Generate invite token
    const inviteToken = admin.createInviteToken();
    await admin.save();
    
    // Send invitation email
    try {
      const inviteUrl = `${process.env.ADMIN_FRONTEND_URL}/admin/setup-account?token=${inviteToken}`;
      sendEmail({
        to: email,
        subject: 'Invitation to Join Taotter Admin Panel',
        template: 'admin-invite',
        data: {
          adminName: admin.fullName,
          inviterName: req.user.fullName,
          inviteUrl,
          role: admin.role,
          department: admin.profile.department
        }
      }).catch(err => logger.logError(err, 'Async Email Send'));
    } catch (emailError) {
      // Delete the admin if email fails
      await Admin.findByIdAndDelete(admin._id);
      logger.logError('Admin invite email failed', emailError);
      return next(new AppError('Failed to send invitation email', 500, 'EMAIL_SEND_FAILED'));
    }
    
    logger.logAuth('ADMIN_INVITED', `${email} by ${req.user.email}`, req.ip);
    
    res.status(201).json({
      success: true,
      message: 'Admin invitation sent successfully',
      data: {
        admin: {
          id: admin._id,
          email: admin.email,
          profile: admin.profile,
          role: admin.role,
          status: admin.status,
          invitedAt: admin.createdAt
        }
      }
    });
    
  } catch (error) {
    logger.logError('Admin invitation failed', error);
    next(error);
  }
});

// @route   POST /api/admin/auth/setup-account
// @desc    Setup admin account with password
// @access  Public
router.post('/setup-account', async (req, res, next) => {
  try {
    const { token, password } = req.body;
    
    if (!token || !password) {
      return next(new AppError('Token and password are required', 400, 'TOKEN_PASSWORD_REQUIRED'));
    }
    
    if (password.length < 8) {
      return next(new AppError('Password must be at least 8 characters', 400, 'PASSWORD_TOO_SHORT'));
    }
    
    // Find admin by invite token
    const admin = await Admin.findByInviteToken(token);
    
    if (!admin) {
      return next(new AppError('Invalid or expired invitation token', 400, 'INVALID_INVITE_TOKEN'));
    }
    
    // Set password and activate account
    admin.password = password;
    admin.status = 'active';
    admin.inviteToken = undefined;
    admin.inviteExpiresAt = undefined;
    admin.authentication.lastLoginAt = new Date();
    
    await admin.save();
    
    // Generate tokens
    const { accessToken, refreshToken } = generateAdminTokens(admin);
    
    // Store refresh token
    await admin.addRefreshToken({
      token: refreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      deviceInfo: req.headers['user-agent'] || 'Unknown'
    });
    
    logger.logAuth('ADMIN_ACCOUNT_SETUP', admin.email, req.ip);
    
    res.json({
      success: true,
      message: 'Account setup completed successfully',
      data: {
        admin: {
          id: admin._id,
          email: admin.email,
          profile: admin.profile,
          role: admin.role,
          permissions: admin.permissions,
          status: admin.status
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: process.env.JWT_EXPIRE || '15m'
        }
      }
    });
    
  } catch (error) {
    logger.logError('Admin account setup failed', error);
    next(error);
  }
});

// @route   POST /api/admin/auth/create
// @desc    Create admin directly (Super Admin only)
// @access  Private (Super Admin)
router.post('/create', 
  // authenticateSuperAdmin, 
  validate(createAdminSchema), async (req, res, next) => {
  try {
    const { email, password, profile, role = 'admin' } = req.body;
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return next(new AppError('Admin already exists with this email', 400, 'ADMIN_EXISTS'));
    }
    
    if (!password || password.length < 8) {
      return next(new AppError('Password must be at least 8 characters', 400, 'PASSWORD_REQUIRED'));
    }
    
    // Create admin
    const admin = new Admin({
      email,
      password,
      profile,
      role,
      status: 'active',
      createdBy: "684e02ee985a60e9fb88f1b0"
    });
    
    await admin.save();
    
    // Send welcome email
    try {
      sendEmail({
        to: email,
        subject: 'Welcome to Taotter Admin Panel',
        template: 'admin-welcome',
        data: {
          adminName: admin.fullName,
          creatorName: req.user.fullName,
          loginUrl: `${process.env.ADMIN_FRONTEND_URL}/admin/login`,
          role: admin.role,
          department: admin.profile.department
        }
      }).catch(err => logger.logError(err, 'Async Email Send'));
    } catch (emailError) {
      logger.logError('Admin welcome email failed', emailError);
      // Don't fail the request if email fails
    }
    
    logger.logAuth('ADMIN_CREATED', `${email} by ${req.user.email}`, req.ip);
    
    res.status(201).json({
      success: true,
      message: 'Admin created successfully',
      data: {
        admin: {
          id: admin._id,
          email: admin.email,
          profile: admin.profile,
          role: admin.role,
          permissions: admin.permissions,
          status: admin.status,
          createdAt: admin.createdAt
        }
      }
    });
    
  } catch (error) {
    logger.logError('Admin creation failed', error);
    next(error);
  }
});

// @route   POST /api/admin/auth/forgot-password
// @desc    Request password reset
// @access  Public
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return next(new AppError('Email is required', 400, 'EMAIL_REQUIRED'));
    }
    
    const admin = await Admin.findOne({ email });
    
    // Always return success to prevent email enumeration
    if (!admin) {
      return res.json({
        success: true,
        message: 'If an account exists, password reset instructions have been sent'
      });
    }
    
    // Generate reset token
    const resetToken = admin.createPasswordResetToken();
    await admin.save();
    
    // Send reset email
    try {
      const resetUrl = `${process.env.ADMIN_FRONTEND_URL}/admin/reset-password?token=${resetToken}`;
      sendEmail({
        to: email,
        subject: 'Admin Password Reset Request',
        template: 'admin-password-reset',
        data: {
          adminName: admin.fullName,
          resetUrl
        }
      }).catch(err => logger.logError(err, 'Async Email Send'));
    } catch (emailError) {
      admin.authentication.passwordResetToken = undefined;
      admin.authentication.passwordResetExpires = undefined;
      await admin.save();
      
      logger.logError('Admin password reset email failed', emailError);
      return next(new AppError('Email could not be sent', 500, 'EMAIL_SEND_FAILED'));
    }
    
    logger.logAuth('ADMIN_PASSWORD_RESET_REQUESTED', email, req.ip);
    
    res.json({
      success: true,
      message: 'If an account exists, password reset instructions have been sent'
    });
    
  } catch (error) {
    logger.logError('Admin password reset request failed', error);
    next(error);
  }
});

// @route   POST /api/admin/auth/reset-password
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
    
    // Find admin by reset token
    const admin = await Admin.findByResetToken(token);
    
    if (!admin) {
      return next(new AppError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN'));
    }
    
    // Update password
    admin.password = password;
    admin.authentication.passwordResetToken = undefined;
    admin.authentication.passwordResetExpires = undefined;
    
    // Reset login attempts
    await admin.resetLoginAttempts();
    
    await admin.save();
    
    logger.logAuth('ADMIN_PASSWORD_RESET_SUCCESS', admin.email, req.ip);
    
    res.json({
      success: true,
      message: 'Password reset successfully'
    });
    
  } catch (error) {
    logger.logError('Admin password reset failed', error);
    next(error);
  }
});

// @route   GET /api/admin/auth/validate-invite/:token
// @desc    Validate invitation token
// @access  Public
router.get('/validate-invite/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    
    const admin = await Admin.findByInviteToken(token);
    
    if (!admin) {
      return next(new AppError('Invalid or expired invitation token', 400, 'INVALID_INVITE_TOKEN'));
    }
    
    res.json({
      success: true,
      message: 'Invitation token is valid',
      data: {
        admin: {
          email: admin.email,
          profile: admin.profile,
          role: admin.role,
          department: admin.profile.department
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/admin/auth/change-password
// @desc    Change password (authenticated)
// @access  Private
router.put('/change-password', authenticateAdmin, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    if (!currentPassword || !newPassword) {
      return next(new AppError('Current password and new password are required', 400, 'PASSWORDS_REQUIRED'));
    }
    
    if (newPassword.length < 8) {
      return next(new AppError('New password must be at least 8 characters', 400, 'PASSWORD_TOO_SHORT'));
    }
    
    // Get admin with password
    const admin = await Admin.findById(req.user._id).select('+password');
    
    // Verify current password
    const isCurrentPasswordValid = await admin.comparePassword(currentPassword);
    
    if (!isCurrentPasswordValid) {
      return next(new AppError('Current password is incorrect', 400, 'INVALID_CURRENT_PASSWORD'));
    }
    
    // Update password
    admin.password = newPassword;
    await admin.save();
    
    logger.logAuth('ADMIN_PASSWORD_CHANGED', admin.email, req.ip);
    
    res.json({
      success: true,
      message: 'Password changed successfully'
    });
    
  } catch (error) {
    logger.logError('Admin password change failed', error);
    next(error);
  }
});

module.exports = router;
