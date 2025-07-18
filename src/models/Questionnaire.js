const mongoose = require('mongoose');

const questionnaireSchema = new mongoose.Schema({
  // Reference to the startup submitting the questionnaire
  startupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Startup',
    required: false, // Make optional for anonymous submission
    index: true
  },
  temporaryId: {
    type: String,
    index: true,
    sparse: true
  },
  
  // Basic Information Step
  basicInfo: {
    startupName: {
      type: String,
      required: [true, 'Startup name is required'],
      trim: true,
      maxlength: [100, 'Startup name cannot exceed 100 characters']
    },
    taskType: {
      type: String,
      required: [true, 'Task type is required'],
      enum: [
        'mvp-development',
        'idea-validation',
        'market-research',
        'branding-design',
        'business-planning',
        'funding-preparation',
        'technical-consulting',
        'custom'
      ],
      index: true
    },
    taskDescription: {
      type: String,
      required: [true, 'Task description is required'],
      trim: true,
      minlength: [10, 'Task description must be at least 10 characters'],
      maxlength: [2000, 'Task description cannot exceed 2000 characters']
    },
    startupStage: {
      type: String,
      required: [true, 'Startup stage is required'],
      enum: [
        'idea',
        'prototype',
        'mvp',
        'validation',
        'early-stage',
        'growth-stage',
        'scaling'
      ],
      index: true
    },
    keyGoals: {
      type: String,
      required: [true, 'Key goals are required'],
      trim: true,
      minlength: [10, 'Key goals must be at least 10 characters'],
      maxlength: [1000, 'Key goals cannot exceed 1000 characters']
    },
    timeCommitment: {
      type: String,
      required: [true, 'Time commitment is required'],
      enum: ['full-time', 'part-time']
    }
  },
  
  // Requirements Step
  requirements: {
    milestones: [{
      type: String,
      trim: true
    }],
    customMilestone: {
      type: String,
      trim: true,
      maxlength: [500, 'Custom milestone cannot exceed 500 characters']
    },
    timeline: {
      type: String,
      enum: [
        '1-2 weeks',
        '3-4 weeks',
        '1-2 months',
        '3-6 months',
        '6+ months'
      ],
      index: true
    },
    budgetRange: {
      type: String,
      trim: true,
      index: true
    },
    additionalRequirements: {
      type: String,
      trim: true,
      maxlength: [1000, 'Additional requirements cannot exceed 1000 characters']
    }
  },
  
  // Service Selection Step
  serviceSelection: {
    selectedService: {
      type: String,
      trim: true
    },
    customRequest: {
      type: String,
      trim: true,
      maxlength: [1000, 'Custom request cannot exceed 1000 characters']
    },
    isCustom: {
      type: Boolean,
      default: false
    },
    urgency: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
      index: true
    }
  },
  
  // Progress tracking
  progress: {
    currentStep: {
      type: Number,
      min: 1,
      max: 3,
      default: 1
    },
    completedSteps: [{
      step: {
        type: Number,
        required: true
      },
      completedAt: {
        type: Date,
        default: Date.now
      }
    }],
    isCompleted: {
      type: Boolean,
      default: false
    },
    completedAt: Date,
    completionPercentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 33
    }
  },
  
  // Status and workflow
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'revision_requested', 'sprint_created'],
    default: 'draft',
    index: true
  },
  
  submittedAt: Date,
  
  // Admin review
  review: {
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      index: true
    },
    reviewedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'revision_requested'],
      default: 'pending'
    },
    adminNotes: {
      type: String,
      trim: true,
      maxlength: [2000, 'Admin notes cannot exceed 2000 characters']
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters']
    },
    revisionNotes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Revision notes cannot exceed 1000 characters']
    },
    estimatedProjectValue: {
      type: Number,
      min: 0
    },
    estimatedDuration: {
      type: String,
      enum: [
        '1-2 weeks',
        '3-4 weeks',
        '1-2 months',
        '3-6 months',
        '6+ months'
      ]
    },
    assignedAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      index: true
    }
  },
  
  // Analytics and tracking
  analytics: {
    timeSpent: {
      step1: { type: Number, default: 0 }, // in seconds
      step2: { type: Number, default: 0 },
      step3: { type: Number, default: 0 },
      total: { type: Number, default: 0 }
    },
    viewCount: {
      type: Number,
      default: 0
    },
    lastViewedAt: Date,
    deviceInfo: {
      userAgent: String,
      platform: String,
      browser: String
    },
    ipAddress: String
  },
  
  // Versioning for revisions
  version: {
    type: Number,
    default: 1
  },
  
  previousVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Questionnaire'
  },
  
  // Tags for categorization
  tags: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    color: String,
    category: {
      type: String,
      enum: ['auto', 'manual', 'admin'],
      default: 'auto'
    }
  }],
  
  // Internal notes and flags
  internalNotes: [{
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    },
    note: {
      type: String,
      required: true,
      trim: true
    },
    isPrivate: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  flags: {
    isHighPriority: {
      type: Boolean,
      default: false
    },
    requiresSpecialAttention: {
      type: Boolean,
      default: false
    },
    hasComplexRequirements: {
      type: Boolean,
      default: false
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
questionnaireSchema.index({ startupId: 1, status: 1 });
questionnaireSchema.index({ 'basicInfo.taskType': 1, status: 1 });
questionnaireSchema.index({ 'basicInfo.startupStage': 1 });
questionnaireSchema.index({ 'requirements.budgetRange': 1 });
questionnaireSchema.index({ 'requirements.timeline': 1 });
questionnaireSchema.index({ 'review.reviewedBy': 1 });
questionnaireSchema.index({ 'review.assignedAdminId': 1 });
questionnaireSchema.index({ submittedAt: -1 });
questionnaireSchema.index({ 'serviceSelection.urgency': 1 });
questionnaireSchema.index({ 'flags.isHighPriority': 1 });

// Virtual for estimated budget value (for sorting/analytics)
questionnaireSchema.virtual('estimatedBudgetValue').get(function() {
  const budgetMap = {
    'Under $5,000': 2500,
    '$5,000 - $10,000': 7500,
    '$10,000 - $25,000': 17500,
    '$25,000 - $50,000': 37500,
    '$50,000 - $100,000': 75000,
    'Over $100,000': 150000
  };
  return budgetMap[this.requirements?.budgetRange] || 0;
});

// Virtual for time to completion
questionnaireSchema.virtual('timeToComplete').get(function() {
  if (!this.progress.isCompleted || !this.createdAt || !this.progress.completedAt) {
    return null;
  }
  return Math.round((this.progress.completedAt - this.createdAt) / (1000 * 60)); // in minutes
});

// Virtual for review turnaround time
questionnaireSchema.virtual('reviewTurnaroundTime').get(function() {
  if (!this.submittedAt || !this.review.reviewedAt) {
    return null;
  }
  return Math.round((this.review.reviewedAt - this.submittedAt) / (1000 * 60 * 60)); // in hours
});

// Virtual for days since submission
questionnaireSchema.virtual('daysSinceSubmission').get(function() {
  if (!this.submittedAt) return null;
  return Math.floor((Date.now() - this.submittedAt) / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to update progress
questionnaireSchema.pre('save', function(next) {
  // Update completion percentage based on filled steps
  let filledSteps = 0;
  
  if (this.basicInfo?.startupName && this.basicInfo?.taskType && this.basicInfo?.taskDescription) {
    filledSteps++;
  }
  if (this.requirements?.timeline && this.requirements?.budgetRange) {
    filledSteps++;
  }
  if (this.serviceSelection && (this.serviceSelection.selectedService || this.serviceSelection.customRequest)) {
    filledSteps++;
  }
  
  this.progress.completionPercentage = Math.round((filledSteps / 3) * 100);
  
  // Mark as completed if all steps are filled
  if (filledSteps === 3 && !this.progress.isCompleted) {
    this.progress.isCompleted = true;
    this.progress.completedAt = new Date();
    this.progress.currentStep = 3;
  }
  
  // Auto-generate tags based on content
  this.generateAutoTags();
  
  next();
});

// Pre-save middleware to update analytics
questionnaireSchema.pre('save', function(next) {
  if (this.isModified('analytics.timeSpent')) {
    this.analytics.timeSpent.total = 
      this.analytics.timeSpent.step1 + 
      this.analytics.timeSpent.step2 + 
      this.analytics.timeSpent.step3;
  }
  next();
});

// Instance method to submit questionnaire
questionnaireSchema.methods.submit = function() {
  if (!this.progress.isCompleted) {
    throw new Error('Questionnaire must be completed before submission');
  }
  
  this.status = 'submitted';
  this.submittedAt = new Date();
  
  return this.save();
};

// Instance method to update step progress
questionnaireSchema.methods.updateStepProgress = function(step, timeSpent = 0) {
  this.progress.currentStep = Math.max(this.progress.currentStep, step);
  
  // Add to completed steps if not already there
  const existingStep = this.progress.completedSteps.find(s => s.step === step);
  if (!existingStep) {
    this.progress.completedSteps.push({ step });
  }
  
  // Update time spent
  if (timeSpent > 0) {
    this.analytics.timeSpent[`step${step}`] += timeSpent;
  }
  
  return this.save();
};

// Instance method to assign to admin
questionnaireSchema.methods.assignToAdmin = function(adminId) {
  this.review.assignedAdminId = adminId;
  this.status = 'under_review';
  
  return this.save();
};

// Instance method to approve questionnaire
questionnaireSchema.methods.approve = function(adminId, notes = '') {
  this.review.reviewedBy = adminId;
  this.review.reviewedAt = new Date();
  this.review.status = 'approved';
  this.review.adminNotes = notes;
  this.status = 'approved';
  
  return this.save();
};

// Instance method to reject questionnaire
questionnaireSchema.methods.reject = function(adminId, reason, notes = '') {
  this.review.reviewedBy = adminId;
  this.review.reviewedAt = new Date();
  this.review.status = 'rejected';
  this.review.rejectionReason = reason;
  this.review.adminNotes = notes;
  this.status = 'rejected';
  
  return this.save();
};

// Instance method to request revision
questionnaireSchema.methods.requestRevision = function(adminId, revisionNotes) {
  this.review.reviewedBy = adminId;
  this.review.reviewedAt = new Date();
  this.review.status = 'revision_requested';
  this.review.revisionNotes = revisionNotes;
  this.status = 'revision_requested';
  
  return this.save();
};

// Instance method to create revision
questionnaireSchema.methods.createRevision = function() {
  const revision = new this.constructor({
    ...this.toObject(),
    _id: undefined,
    createdAt: undefined,
    updatedAt: undefined,
    version: this.version + 1,
    previousVersionId: this._id,
    status: 'draft',
    submittedAt: undefined,
    review: {
      status: 'pending'
    },
    progress: {
      ...this.progress,
      isCompleted: false,
      completedAt: undefined
    }
  });
  
  return revision.save();
};

// Instance method to add internal note
questionnaireSchema.methods.addInternalNote = function(adminId, note, isPrivate = true) {
  this.internalNotes.push({
    adminId,
    note,
    isPrivate
  });
  
  return this.save();
};

// Instance method to generate auto tags
questionnaireSchema.methods.generateAutoTags = function() {
  const autoTags = [];
  
  // Remove existing auto tags
  this.tags = this.tags.filter(tag => tag.category !== 'auto');
  
  // Add task type tag
  if (this.basicInfo?.taskType) {
    autoTags.push({
      name: this.basicInfo.taskType.replace('-', ' ').toUpperCase(),
      category: 'auto',
      color: '#3b82f6'
    });
  }
  
  // Add startup stage tag
  if (this.basicInfo?.startupStage) {
    autoTags.push({
      name: this.basicInfo.startupStage.replace('-', ' ').toUpperCase(),
      category: 'auto',
      color: '#10b981'
    });
  }
  
  // Add budget range tag
  if (this.requirements?.budgetRange) {
    autoTags.push({
      name: this.requirements.budgetRange,
      category: 'auto',
      color: '#f59e0b'
    });
  }
  
  // Add urgency tag
  if (this.serviceSelection?.urgency && this.serviceSelection.urgency !== 'medium') {
    autoTags.push({
      name: `${this.serviceSelection.urgency.toUpperCase()} PRIORITY`,
      category: 'auto',
      color: this.serviceSelection.urgency === 'urgent' ? '#ef4444' : '#f97316'
    });
  }
  
  // Add high value tag for large budgets
  if (this.estimatedBudgetValue > 50000) {
    autoTags.push({
      name: 'HIGH VALUE',
      category: 'auto',
      color: '#8b5cf6'
    });
  }
  
  this.tags.push(...autoTags);
};

// Static method to find questionnaires by status
questionnaireSchema.statics.findByStatus = function(status, options = {}) {
  const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = options;
  
  return this.find({ status })
    .populate('startupId', 'profile.founderFirstName profile.founderLastName profile.companyName email')
    .populate('review.reviewedBy', 'profile.firstName profile.lastName')
    .populate('review.assignedAdminId', 'profile.firstName profile.lastName')
    .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
};

// Static method to get questionnaire statistics
questionnaireSchema.statics.getStatistics = async function(filters = {}) {
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
  
  if (filters.taskType) {
    matchStage['basicInfo.taskType'] = filters.taskType;
  }
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        submitted: { $sum: { $cond: [{ $eq: ['$status', 'submitted'] }, 1, 0] } },
        underReview: { $sum: { $cond: [{ $eq: ['$status', 'under_review'] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        avgCompletionTime: { $avg: '$analytics.timeSpent.total' },
        avgBudgetValue: { $avg: '$estimatedBudgetValue' }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    submitted: 0,
    underReview: 0,
    approved: 0,
    rejected: 0,
    avgCompletionTime: 0,
    avgBudgetValue: 0
  };
};

// Static method to find pending reviews for admin
questionnaireSchema.statics.findPendingReviews = function(adminId = null, options = {}) {
  const query = {
    status: { $in: ['submitted', 'under_review'] }
  };
  
  if (adminId) {
    query['review.assignedAdminId'] = adminId;
  }
  
  const { page = 1, limit = 20 } = options;
  
  return this.find(query)
    .populate('startupId', 'profile.founderFirstName profile.founderLastName profile.companyName email')
    .sort({ submittedAt: 1 }) // Oldest first
    .limit(limit * 1)
    .skip((page - 1) * limit);
};

module.exports = mongoose.model('Questionnaire', questionnaireSchema);
