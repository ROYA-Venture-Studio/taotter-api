const mongoose = require('mongoose');

const packageOptionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 1000
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    enum: ['USD', 'EUR', 'GBP','QAR'],
    default: 'QAR'
  },
  engagementHours: {
    type: Number,
    required: false,
    min: 0
  },
  duration: {
    type: Number, // Duration in weeks
    required: false,
    min: 0
  },
  hourlyRate: {
    type: Number,
    min: 0,
    required: false
  },
  amount: {
    type: Number,
    min: 0,
    required: false
  },
  paymentLink: {
    type: String,
    trim: true,
    required: false
  },
  QTY: {
    type: Number,
    min: 0,
    required: false
  },
  discount: {
    type: Number,
    min: 0,
    required: false
  },
  tier: {
    type: String,
    required: false
  }
}, { _id: true });

const milestoneSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  dueDate: Date,
  completedAt: Date,
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'completed', 'overdue'],
    default: 'pending'
  },
  deliverables: [{
    name: String,
    description: String,
    fileUrl: String,
    completedAt: Date
  }],
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  }
}, { timestamps: true, _id: true });

const teamMemberSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  role: {
    type: String,
    required: true,
    enum: ['lead', 'developer', 'designer', 'pm', 'qa', 'consultant']
  },
  assignedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { _id: true });

const statusHistorySchema = new mongoose.Schema({
  status: {
    type: String,
    required: true
  },
  changedAt: {
    type: Date,
    default: Date.now
  },
  changedBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'statusHistory.userType'
  },
  userType: {
    type: String,
    required: true,
    enum: ['admin', 'startup']
  },
  note: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, { _id: true });

// Sprint attachments schemas
const sprintDocumentSchema = new mongoose.Schema({
  fileName: String,
  originalName: String,
  fileUrl: String,
  fileType: String,
  documentType: String,
  uploadedAt: { type: Date, default: Date.now }
}, { _id: false });

const sprintDocumentsBlockSchema = new mongoose.Schema({
  uploadedFiles: [sprintDocumentSchema],
  contactLists: String,
  appDemo: String,
  submittedAt: Date
}, { _id: false });

const sprintSchema = new mongoose.Schema({
  questionnaireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Questionnaire',
    required: true
    },

  // Sprint attachments block
  sprintDocuments: {
    type: sprintDocumentsBlockSchema,
    default: () => ({ uploadedFiles: [], contactLists: '', appDemo: '', submittedAt: null })
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  type: {
    type: String,
    required: true,
    enum: ['mvp', 'validation', 'branding', 'marketing', 'fundraising', 'custom']
  },
  status: {
    type: String,
    required: true,
    enum: [
      'draft',
      'available',
      'package_selected',
      'documents_submitted',
      'meeting_scheduled',
      'in_progress',
      'on_hold',
      'completed',
      'cancelled',
      'inactive'
    ],
    default: 'draft'
  },
  estimatedDuration: {
    type: Number, // Duration in days
    required: true,
    min: 1,
    max: 365
  },
  packageOptions: [packageOptionSchema],
  selectedPackage: packageOptionSchema,

  // Top-level deliverables for the sprint
  deliverables: [{ type: String, trim: true }],

  // Payment status for selected package
  selectedPackagePaymentStatus: {
    type: String,
    enum: ['paid', 'unpaid'],
    default: 'unpaid'
  },
  selectedPackagePaymentVerifiedAt: Date,
  selectedPackagePaymentVerifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  documentsSubmitted: {
    type: Boolean,
    default: false
  },
  meetingScheduled: {
    isScheduled: {
      type: Boolean,
      default: false
    },
    meetingUrl: String,
    scheduledAt: Date,
    meetingType: {
      type: String,
      enum: ['kickoff', 'review', 'demo', 'feedback', 'completion']
    },
    scheduledBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'meetingScheduled.scheduledByType'
    },
    scheduledByType: {
      type: String,
      enum: ['admin', 'startup']
    },
    notes: String
  },
  progress: {
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    currentPhase: {
      type: String,
      enum: ['planning', 'design', 'development', 'testing', 'review', 'deployment', 'completed'],
      default: 'planning'
    },
    completedMilestones: {
      type: Number,
      default: 0
    },
    totalMilestones: {
      type: Number,
      default: 0
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  milestones: [milestoneSchema],
  startDate: Date,
  endDate: Date,
  actualEndDate: Date,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
  },
  statusHistory: [statusHistorySchema],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
sprintSchema.index({ questionnaireId: 1 });
sprintSchema.index({ status: 1 });
sprintSchema.index({ type: 1 });
sprintSchema.index({ createdBy: 1 });
sprintSchema.index({ 'assignedTeam.teamLead': 1 });
sprintSchema.index({ 'assignedTeam.members.userId': 1 });
sprintSchema.index({ startDate: 1, endDate: 1 });
sprintSchema.index({ priority: 1 });
sprintSchema.index({ createdAt: -1 });


// Pre-save middleware to update progress calculations
sprintSchema.pre('save', function(next) {
  if (this.milestones && this.milestones.length > 0) {
    this.progress.totalMilestones = this.milestones.length;
    this.progress.completedMilestones = this.milestones.filter(m => m.status === 'completed').length;
    
    if (this.progress.totalMilestones > 0) {
      this.progress.percentage = Math.round((this.progress.completedMilestones / this.progress.totalMilestones) * 100);
    }
  }
  
  // Update budget remaining
  if (this.budget && this.budget.allocated) {
    this.budget.remaining = this.budget.allocated - (this.budget.spent || 0);
  }
  
  this.progress.lastUpdated = new Date();
  next();
});

// Static methods
sprintSchema.statics.getSprintsByStatus = function(status) {
  return this.find({ status })
    .populate('questionnaireId', 'basicInfo.startupName')
    .populate('createdBy', 'profile.firstName profile.lastName')
    .sort({ createdAt: -1 });
};

sprintSchema.statics.getSprintsForStartup = function(startupId) {
  return this.aggregate([
    {
      $lookup: {
        from: 'questionnaires',
        localField: 'questionnaireId',
        foreignField: '_id',
        as: 'questionnaire'
      }
    },
    {
      $match: {
        'questionnaire.startupId': startupId
      }
    }
  ]);
};

sprintSchema.statics.getOverdueSprints = function() {
  return this.find({
    endDate: { $lt: new Date() },
    status: { $nin: ['completed', 'cancelled'] }
  })
    .populate('questionnaireId', 'basicInfo.startupName')
    .populate('assignedTeam.teamLead', 'profile.firstName profile.lastName');
};

// Instance methods
sprintSchema.methods.addMilestone = function(milestoneData) {
  this.milestones.push(milestoneData);
  return this.save();
};

sprintSchema.methods.updateProgress = function(percentage, phase) {
  this.progress.percentage = Math.min(Math.max(percentage, 0), 100);
  if (phase) this.progress.currentPhase = phase;
  this.progress.lastUpdated = new Date();
  return this.save();
};

sprintSchema.methods.addTeamMember = function(userId, role) {
  // Check if member already exists
  const existingMember = this.assignedTeam.members.find(
    member => member.userId.toString() === userId.toString()
  );
  
  if (!existingMember) {
    this.assignedTeam.members.push({ userId, role });
    return this.save();
  }
  
  return Promise.resolve(this);
};

sprintSchema.methods.removeTeamMember = function(userId) {
  this.assignedTeam.members = this.assignedTeam.members.filter(
    member => member.userId.toString() !== userId.toString()
  );
  return this.save();
};

sprintSchema.methods.addNote = function(content, createdBy, createdByType, isInternal = false) {
  this.notes.push({
    content,
    createdBy,
    createdByType,
    isInternal
  });
  return this.save();
};

sprintSchema.methods.addFeedback = function(rating, feedback, category) {
  this.clientFeedback.push({
    rating,
    feedback,
    category
  });
  return this.save();
};

const Sprint = mongoose.model('Sprint', sprintSchema);

module.exports = Sprint;
