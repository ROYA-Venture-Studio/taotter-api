const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const adminSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email'
    ]
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't include password in queries by default
  },
  
  // Admin profile information
  profile: {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    avatar: {
      type: String,
      default: null
    }
  },
  
  // Admin role
  role: {
    type: String,
    enum: ['admin', 'super_admin'],
    default: 'admin',
    required: true
  },
  
  authentication: {
    refreshTokens: [{
      token: String,
      expiresAt: Date,
      deviceInfo: String,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    lastLoginAt: Date,
    loginAttempts: {
      type: Number,
      default: 0
    },
    lockedUntil: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    twoFactorEnabled: {
      type: Boolean,
      default: false
    },
    twoFactorSecret: String
  },
  
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  
  
  // Activity tracking
  activity: {
    lastActiveAt: {
      type: Date,
      default: Date.now
    },
    totalSessions: {
      type: Number,
      default: 0
    },
    questionnairesReviewed: {
      type: Number,
      default: 0
    },
    tasksCreated: {
      type: Number,
      default: 0
    },
    startupsHelped: {
      type: Number,
      default: 0
    }
  },
  
  // Admin creation and management
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  
  invitedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  
  inviteToken: String,
  inviteExpiresAt: Date,
  
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      if (ret.authentication && ret.authentication.refreshTokens) {
        delete ret.authentication.refreshTokens;
      }
      if (ret.authentication && ret.authentication.passwordResetToken) {
        delete ret.authentication.passwordResetToken;
      }
      if (ret.authentication && ret.authentication.twoFactorSecret) {
        delete ret.authentication.twoFactorSecret;
      }
      if (ret.inviteToken) {
        delete ret.inviteToken;
      }
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
adminSchema.index({ email: 1 });
adminSchema.index({ role: 1 });
adminSchema.index({ status: 1 });
adminSchema.index({ 'profile.department': 1 });
adminSchema.index({ 'workload.assignedStartups.startupId': 1 });
adminSchema.index({ createdBy: 1 });

// Virtual for full name
adminSchema.virtual('fullName').get(function() {
  return `${this.profile.firstName} ${this.profile.lastName}`;
});

// Virtual to check if account is locked
adminSchema.virtual('isLocked').get(function() {
  return !!(this.authentication.lockedUntil && this.authentication.lockedUntil > Date.now());
});

//// Pre-save middleware to hash password
adminSchema.pre('save', async function(next) {
  // Only hash password if it's been modified (or is new)
  if (!this.isModified('password')) return next();
  
  // Hash password with cost of 12
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  this.password = await bcrypt.hash(this.password, saltRounds);
  
  next();
});

// Instance method to check password
adminSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to increment login attempts
adminSchema.methods.incLoginAttempts = async function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.authentication.lockedUntil && this.authentication.lockedUntil < Date.now()) {
    return this.updateOne({
      $unset: { 'authentication.lockedUntil': 1 },
      $set: { 'authentication.loginAttempts': 1 }
    });
  }
  
  const updates = { $inc: { 'authentication.loginAttempts': 1 } };
  
  // Lock account after 3 failed attempts for 2 hours (stricter for admins)
  if (this.authentication.loginAttempts + 1 >= 3 && !this.isLocked) {
    updates.$set = { 'authentication.lockedUntil': Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

// Instance method to reset login attempts
adminSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $unset: { 'authentication.loginAttempts': 1, 'authentication.lockedUntil': 1 }
  });
};

// Instance method to add refresh token
adminSchema.methods.addRefreshToken = async function(tokenData) {
  this.authentication.refreshTokens.push(tokenData);
  
  // Keep only the last 3 refresh tokens (stricter for admins)
  if (this.authentication.refreshTokens.length > 3) {
    this.authentication.refreshTokens = this.authentication.refreshTokens.slice(-3);
  }
  
  return this.save();
};

// Instance method to remove refresh token
adminSchema.methods.removeRefreshToken = async function(token) {
  this.authentication.refreshTokens = this.authentication.refreshTokens.filter(
    rt => rt.token !== token
  );
  return this.save();
};

// Instance method to create password reset token
adminSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.authentication.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.authentication.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};


// Instance method to create invite token
adminSchema.methods.createInviteToken = function() {
  const inviteToken = crypto.randomBytes(32).toString('hex');
  
  this.inviteToken = crypto
    .createHash('sha256')
    .update(inviteToken)
    .digest('hex');
  
  this.inviteExpiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return inviteToken;
};

// Static method to find admin by reset token
adminSchema.statics.findByResetToken = function(token) {
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  return this.findOne({
    'authentication.passwordResetToken': hashedToken,
    'authentication.passwordResetExpires': { $gt: Date.now() }
  });
};

// Static method to find admin by invite token
adminSchema.statics.findByInviteToken = function(token) {
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  return this.findOne({
    inviteToken: hashedToken,
    inviteExpiresAt: { $gt: Date.now() }
  });
};


module.exports = mongoose.model('Admin', adminSchema);
