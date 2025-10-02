const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const startupSchema = new mongoose.Schema({
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
  
  phone: {
    type: String,
    sparse: true,
    unique: true,
    trim: true,
    match: [
      /^\+?[1-9]\d{1,14}$/,
      'Please provide a valid phone number'
    ]
  },
  
  password: {
    type: String,
    required: function() {
      return !this.googleId; // Password required if not Google OAuth user
    },
    minlength: [8, 'Password must be at least 8 characters'],
    select: false // Don't include password in queries by default
  },
  
  
  // Startup-specific profile information
  profile: {
    founderFirstName: {
      type: String,
      required: [true, 'Founder first name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters']
    },
    founderLastName: {
      type: String,
      required: [true, 'Founder last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    companyName: {
      type: String,
      trim: true,
      maxlength: [100, 'Company name cannot exceed 100 characters']
    },
    avatar: {
      type: String,
      default: null
    }
  },
  
  verification: {
    email: {
      isVerified: {
        type: Boolean,
        default: false
      },
      verificationToken: String,
      verifiedAt: Date
    },
    phone: {
      isVerified: {
        type: Boolean,
        default: false
      },
      verificationCode: String,
      codeExpiresAt: Date,
      verifiedAt: Date,
      attempts: {
        type: Number,
        default: 0
      }
    }
  },
  
  // Password reset functionality
  resetPassword: {
    code: String,
    expiresAt: Date,
    attempts: {
      type: Number,
      default: 0
    }
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
    passwordResetExpires: Date
  },
  
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending','verified'],
    default: 'pending' // Pending until email verification
  },
  
  // Onboarding and engagement tracking
  onboarding: {
    isCompleted: {
      type: Boolean,
      default: false
    },
    currentStep: {
      type: String,
      enum: [
        'profile',
        'questionnaire',
        'pending_review',
        'sprint_selection',
        'sprint_onboarding',
        'document_upload',
        'payment_pending',
        'meeting_scheduling',
        'meeting_scheduled',
        'active_sprint',
        'completed'
      ],
      default: 'profile'
    },
    completedAt: Date
  },
  
  // Startup metrics and tracking
  
  // Sprint documents and uploads
  
  // Admin assignments and notes

}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      if (ret.authentication && ret.authentication.refreshTokens) {
        delete ret.authentication.refreshTokens;
      }
      if (ret.verification && ret.verification.email && ret.verification.email.verificationToken) {
        delete ret.verification.email.verificationToken;
      }
      if (ret.verification && ret.verification.phone && ret.verification.phone.verificationCode) {
        delete ret.verification.phone.verificationCode;
      }
      if (ret.authentication && ret.authentication.passwordResetToken) {
        delete ret.authentication.passwordResetToken;
      }
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
startupSchema.index({ email: 1 });
startupSchema.index({ phone: 1 }, { sparse: true });
startupSchema.index({ googleId: 1 }, { sparse: true });
startupSchema.index({ status: 1 });
startupSchema.index({ assignedAdminId: 1 });
startupSchema.index({ 'profile.industry': 1 });
startupSchema.index({ 'profile.fundingStage': 1 });
startupSchema.index({ 'onboarding.currentStep': 1 });

// Virtual for full founder name
startupSchema.virtual('founderFullName').get(function() {
  return `${this.profile.founderFirstName} ${this.profile.founderLastName}`;
});

// Virtual to check if account is locked
startupSchema.virtual('isLocked').get(function() {
  return !!(this.authentication.lockedUntil && this.authentication.lockedUntil > Date.now());
});

// Virtual for onboarding progress percentage
startupSchema.virtual('onboardingProgress').get(function() {
  const steps = ['profile', 'questionnaire', 'verification', 'completed'];
  const currentIndex = steps.indexOf(this.onboarding.currentStep);
  return Math.round((currentIndex / (steps.length - 1)) * 100);
});

// Pre-save middleware to hash password
startupSchema.pre('save', async function(next) {
  // Only hash password if it's been modified (or is new)
  if (!this.isModified('password')) return next();
  
  // Hash password with cost of 12
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  this.password = await bcrypt.hash(this.password, saltRounds);
  
  next();
});

// Pre-save middleware to update engagement
startupSchema.pre('save', function(next) {
  if (this.isModified('engagement.lastActiveAt')) {
    this.engagement.totalSessions += 1;
  }
  next();
});

// Instance method to check password
startupSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to increment login attempts
startupSchema.methods.incLoginAttempts = async function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.authentication.lockedUntil && this.authentication.lockedUntil < Date.now()) {
    return this.updateOne({
      $unset: { 'authentication.lockedUntil': 1 },
      $set: { 'authentication.loginAttempts': 1 }
    });
  }
  
  const updates = { $inc: { 'authentication.loginAttempts': 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.authentication.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { 'authentication.lockedUntil': Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

// Instance method to reset login attempts
startupSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $unset: { 'authentication.loginAttempts': 1, 'authentication.lockedUntil': 1 }
  });
};

// Instance method to add refresh token
startupSchema.methods.addRefreshToken = async function(tokenData) {
  this.authentication.refreshTokens.push(tokenData);
  
  // Keep only the last 5 refresh tokens
  if (this.authentication.refreshTokens.length > 5) {
    this.authentication.refreshTokens = this.authentication.refreshTokens.slice(-5);
  }
  
  return this.save();
};

// Instance method to remove refresh token
startupSchema.methods.removeRefreshToken = async function(token) {
  this.authentication.refreshTokens = this.authentication.refreshTokens.filter(
    rt => rt.token !== token
  );
  return this.save();
};

// Instance method to generate phone verification code
startupSchema.methods.generatePhoneVerificationCode = function() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.verification.phone.verificationCode = code;
  this.verification.phone.codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  this.verification.phone.attempts = 0;
  return code;
};

// Instance method to verify phone code
startupSchema.methods.verifyPhoneCode = function(code) {
  if (this.verification.phone.verificationCode !== code) {
    this.verification.phone.attempts += 1;
    return false;
  }
  
  if (this.verification.phone.codeExpiresAt < new Date()) {
    return false;
  }
  
  if (this.verification.phone.attempts >= 3) {
    return false;
  }
  
  this.verification.phone.isVerified = true;
  this.verification.phone.verifiedAt = new Date();
  this.verification.phone.verificationCode = undefined;
  this.verification.phone.codeExpiresAt = undefined;
  this.verification.phone.attempts = 0;
  
  return true;
};

// Instance method to create password reset token
startupSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.authentication.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.authentication.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Instance method to update onboarding step
startupSchema.methods.updateOnboardingStep = function(step) {
  this.onboarding.currentStep = step;
  
  if (step === 'completed') {
    this.onboarding.isCompleted = true;
    this.onboarding.completedAt = new Date();
    this.status = 'active';
  }
  
  return this.save();
};

// Instance method to add admin note
startupSchema.methods.addAdminNote = function(adminId, note, isPrivate = true) {
  this.adminNotes.push({
    adminId,
    note,
    isPrivate
  });
  return this.save();
};

// Static method to find startup by reset token
startupSchema.statics.findByResetToken = function(token) {
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  return this.findOne({
    'authentication.passwordResetToken': hashedToken,
    'authentication.passwordResetExpires': { $gt: Date.now() }
  });
};

// Static method to get startup statistics
startupSchema.statics.getStatistics = async function(filters = {}) {
  const matchStage = {};
  
  if (filters.dateRange) {
    matchStage.createdAt = {
      $gte: new Date(filters.dateRange.start),
      $lte: new Date(filters.dateRange.end)
    };
  }
  
  if (filters.status) {
    matchStage.status = filters.status;
  }
  
  if (filters.industry) {
    matchStage['profile.industry'] = filters.industry;
  }
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        suspended: { $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] } },
        onboardingCompleted: { $sum: { $cond: ['$onboarding.isCompleted', 1, 0] } },
        avgQuestionnaires: { $avg: '$engagement.questionnairesSubmitted' },
        avgTasksCompleted: { $avg: '$engagement.tasksCompleted' }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    active: 0,
    pending: 0,
    suspended: 0,
    onboardingCompleted: 0,
    avgQuestionnaires: 0,
    avgTasksCompleted: 0
  };
};

module.exports = mongoose.model('Startup', startupSchema);
