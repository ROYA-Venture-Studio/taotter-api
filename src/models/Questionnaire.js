const mongoose = require('mongoose');

const questionnaireSchema = new mongoose.Schema({
  // Link to created sprint (if any)
  sprintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sprint'
  },
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
        'growth',
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
    enum: ['draft', 'submitted', 'meeting_scheduled', 'sprint_created', 'proposal_created'],
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
  
  // Versioning for revisions
  version: {
    type: Number,
    default: 1
  },
  
  previousVersionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Questionnaire'
  },
  
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



// Instance method to submit questionnaire
questionnaireSchema.methods.submit = function() {
  if (!this.progress.isCompleted) {
    throw new Error('Questionnaire must be completed before submission');
  }
  
  this.status = 'submitted';
  this.submittedAt = new Date();
  
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
