const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
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
  
  googleId: {
    type: String,
    sparse: true,
    unique: true
  },
  
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
    company: {
      type: String,
      trim: true,
      maxlength: [100, 'Company name cannot exceed 100 characters']
    },
    avatar: {
      type: String,
      default: null
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    preferences: {
      notifications: {
        email: {
          type: Boolean,
          default: true
        },
        sms: {
          type: Boolean,
          default: true
        },
        push: {
          type: Boolean,
          default: true
        }
      },
      theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light'
      }
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
  
  role: {
    type: String,
    enum: ['client', 'admin', 'super_admin'],
    default: 'client'
  },
  
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  
  // Admin-specific fields
  department: {
    type: String,
    required: function() {
      return this.role === 'admin' || this.role === 'super_admin';
    }
  },
  
  teamIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team'
  }]
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.authentication.refreshTokens;
      delete ret.verification.email.verificationToken;
      delete ret.verification.phone.verificationCode;
      delete ret.authentication.passwordResetToken;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ googleId: 1 }, { sparse: true });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ 'authentication.refreshTokens.token': 1 });
userSchema.index({ 'authentication.passwordResetToken': 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.profile.firstName} ${this.profile.lastName}`;
});

// Virtual to check if account is locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.authentication.lockedUntil && this.authentication.lockedUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash password if it's been modified (or is new)
  if (!this.isModified('password')) return next();
  
  // Hash password with cost of 12
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  this.password = await bcrypt.hash(this.password, saltRounds);
  
  next();
});

// Pre-save middleware to clean up expired refresh tokens
userSchema.pre('save', function(next) {
  if (this.isModified('authentication.refreshTokens')) {
    this.authentication.refreshTokens = this.authentication.refreshTokens.filter(
      token => token.expiresAt > new Date()
    );
  }
  next();
});

// Instance method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to increment login attempts
userSchema.methods.incLoginAttempts = async function() {
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
userSchema.methods.resetLoginAttempts = async function() {
  return this.updateOne({
    $unset: { 'authentication.loginAttempts': 1, 'authentication.lockedUntil': 1 }
  });
};

// Instance method to add refresh token
userSchema.methods.addRefreshToken = async function(tokenData) {
  this.authentication.refreshTokens.push(tokenData);
  
  // Keep only the last 5 refresh tokens
  if (this.authentication.refreshTokens.length > 5) {
    this.authentication.refreshTokens = this.authentication.refreshTokens.slice(-5);
  }
  
  return this.save();
};

// Instance method to remove refresh token
userSchema.methods.removeRefreshToken = async function(token) {
  this.authentication.refreshTokens = this.authentication.refreshTokens.filter(
    rt => rt.token !== token
  );
  return this.save();
};

// Instance method to generate phone verification code
userSchema.methods.generatePhoneVerificationCode = function() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.verification.phone.verificationCode = code;
  this.verification.phone.codeExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
  this.verification.phone.attempts = 0;
  return code;
};

// Instance method to verify phone code
userSchema.methods.verifyPhoneCode = function(code) {
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

// Instance method to generate password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.authentication.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.authentication.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Static method to find user by reset token
userSchema.statics.findByResetToken = function(token) {
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  return this.findOne({
    'authentication.passwordResetToken': hashedToken,
    'authentication.passwordResetExpires': { $gt: Date.now() }
  });
};

module.exports = mongoose.model('User', userSchema);
