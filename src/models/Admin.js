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
    },
    jobTitle: {
      type: String,
      trim: true,
      maxlength: [100, 'Job title cannot exceed 100 characters']
    },
    department: {
      type: String,
      enum: [
        'operations',
        'business-development',
        'technical',
        'marketing',
        'finance',
        'legal',
        'hr',
        'management'
      ],
      required: [true, 'Department is required']
    },
    phone: {
      type: String,
      trim: true,
      match: [
        /^\+?[1-9]\d{1,14}$/,
        'Please provide a valid phone number'
      ]
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [500, 'Bio cannot exceed 500 characters']
    },
    expertise: [{
      type: String,
      enum: [
        'business-strategy',
        'technical-development',
        'marketing',
        'fundraising',
        'legal',
        'operations',
        'product-management',
        'user-experience',
        'data-analytics',
        'mentoring'
      ]
    }],
    preferences: {
      notifications: {
        email: {
          type: Boolean,
          default: true
        },
        browser: {
          type: Boolean,
          default: true
        }
      },
      theme: {
        type: String,
        enum: ['light', 'dark'],
        default: 'light'
      },
      workingHours: {
        start: {
          type: String,
          default: '09:00'
        },
        end: {
          type: String,
          default: '17:00'
        },
        timezone: {
          type: String,
          default: 'UTC'
        }
      }
    }
  },
  
  // Admin role and permissions
  role: {
    type: String,
    enum: ['admin', 'super_admin'],
    default: 'admin',
    required: true
  },
  
  permissions: {
    startups: {
      view: {
        type: Boolean,
        default: true
      },
      edit: {
        type: Boolean,
        default: true
      },
      delete: {
        type: Boolean,
        default: false
      }
    },
    questionnaires: {
      view: {
        type: Boolean,
        default: true
      },
      review: {
        type: Boolean,
        default: true
      },
      approve: {
        type: Boolean,
        default: true
      }
    },
    tasks: {
      view: {
        type: Boolean,
        default: true
      },
      create: {
        type: Boolean,
        default: true
      },
      edit: {
        type: Boolean,
        default: true
      },
      delete: {
        type: Boolean,
        default: false
      }
    },
    boards: {
      view: {
        type: Boolean,
        default: true
      },
      create: {
        type: Boolean,
        default: true
      },
      edit: {
        type: Boolean,
        default: true
      },
      delete: {
        type: Boolean,
        default: false
      }
    },
    analytics: {
      view: {
        type: Boolean,
        default: true
      },
      export: {
        type: Boolean,
        default: false
      }
    },
    system: {
      userManagement: {
        type: Boolean,
        default: false
      },
      systemSettings: {
        type: Boolean,
        default: false
      },
      auditLogs: {
        type: Boolean,
        default: false
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
  
  // Admin workload and assignments
  workload: {
    assignedStartups: [{
      startupId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Startup'
      },
      assignedAt: {
        type: Date,
        default: Date.now
      },
      status: {
        type: String,
        enum: ['active', 'completed', 'transferred'],
        default: 'active'
      }
    }],
    maxCapacity: {
      type: Number,
      default: 10
    },
    currentLoad: {
      type: Number,
      default: 0
    }
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
  
  // Emergency contact
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String,
    email: String
  }
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

// Virtual for workload percentage
adminSchema.virtual('workloadPercentage').get(function() {
  if (this.workload.maxCapacity === 0) return 0;
  return Math.round((this.workload.currentLoad / this.workload.maxCapacity) * 100);
});

// Virtual to check if admin is available for new assignments
adminSchema.virtual('isAvailable').get(function() {
  return this.status === 'active' && this.workload.currentLoad < this.workload.maxCapacity;
});

// Pre-save middleware to hash password
adminSchema.pre('save', async function(next) {
  // Only hash password if it's been modified (or is new)
  if (!this.isModified('password')) return next();
  
  // Hash password with cost of 12
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  this.password = await bcrypt.hash(this.password, saltRounds);
  
  next();
});

// Pre-save middleware to set permissions based on role
adminSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    if (this.role === 'super_admin') {
      // Super admin gets all permissions
      this.permissions = {
        startups: { view: true, edit: true, delete: true },
        questionnaires: { view: true, review: true, approve: true },
        tasks: { view: true, create: true, edit: true, delete: true },
        boards: { view: true, create: true, edit: true, delete: true },
        analytics: { view: true, export: true },
        system: { userManagement: true, systemSettings: true, auditLogs: true }
      };
    }
  }
  next();
});

// Pre-save middleware to update workload
adminSchema.pre('save', function(next) {
  if (this.isModified('workload.assignedStartups')) {
    this.workload.currentLoad = this.workload.assignedStartups.filter(
      assignment => assignment.status === 'active'
    ).length;
  }
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

// Instance method to assign startup
adminSchema.methods.assignStartup = function(startupId) {
  // Check if already assigned
  const existingAssignment = this.workload.assignedStartups.find(
    assignment => assignment.startupId.toString() === startupId.toString()
  );
  
  if (!existingAssignment) {
    this.workload.assignedStartups.push({
      startupId,
      status: 'active'
    });
  } else if (existingAssignment.status !== 'active') {
    existingAssignment.status = 'active';
    existingAssignment.assignedAt = new Date();
  }
  
  return this.save();
};

// Instance method to unassign startup
adminSchema.methods.unassignStartup = function(startupId, reason = 'completed') {
  const assignment = this.workload.assignedStartups.find(
    assignment => assignment.startupId.toString() === startupId.toString()
  );
  
  if (assignment) {
    assignment.status = reason;
  }
  
  return this.save();
};

// Instance method to check permission
adminSchema.methods.hasPermission = function(resource, action) {
  if (this.role === 'super_admin') return true;
  
  const resourcePermissions = this.permissions[resource];
  if (!resourcePermissions) return false;
  
  return resourcePermissions[action] === true;
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

// Static method to find available admin for assignment
adminSchema.statics.findAvailableAdmin = function(criteria = {}) {
  const query = {
    status: 'active',
    $expr: { $lt: ['$workload.currentLoad', '$workload.maxCapacity'] }
  };
  
  if (criteria.department) {
    query['profile.department'] = criteria.department;
  }
  
  if (criteria.expertise) {
    query['profile.expertise'] = { $in: criteria.expertise };
  }
  
  return this.findOne(query).sort({ 'workload.currentLoad': 1 });
};

// Static method to get admin statistics
adminSchema.statics.getStatistics = async function(filters = {}) {
  const matchStage = {};
  
  if (filters.department) {
    matchStage['profile.department'] = filters.department;
  }
  
  if (filters.role) {
    matchStage.role = filters.role;
  }
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        suspended: { $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] } },
        totalCapacity: { $sum: '$workload.maxCapacity' },
        currentLoad: { $sum: '$workload.currentLoad' },
        avgQuestionnairesReviewed: { $avg: '$activity.questionnairesReviewed' },
        avgTasksCreated: { $avg: '$activity.tasksCreated' }
      }
    }
  ]);
  
  const result = stats[0] || {
    total: 0,
    active: 0,
    suspended: 0,
    totalCapacity: 0,
    currentLoad: 0,
    avgQuestionnairesReviewed: 0,
    avgTasksCreated: 0
  };
  
  result.capacityUtilization = result.totalCapacity > 0 
    ? Math.round((result.currentLoad / result.totalCapacity) * 100) 
    : 0;
  
  return result;
};

module.exports = mongoose.model('Admin', adminSchema);
