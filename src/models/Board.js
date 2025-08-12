const mongoose = require('mongoose');

const boardSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Board name is required'],
    trim: true,
    maxlength: [100, 'Board name cannot exceed 100 characters']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Board description cannot exceed 500 characters']
  },
  
  // Board type and purpose
  boardType: {
    type: String,
    required: [true, 'Board type is required'],
    enum: [
      'startup-project', // Individual startup's project board
      'admin-tasks',     // Admin team task management
      'department',      // Department-specific board
      'template'         // Template board for creating new boards
    ],
    index: true
  },

  // Sprint association (add this field)
  sprintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sprint',
    index: true
  },
  
  // Related entities
  relatedStartupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Startup',
    index: true
  },
  
  relatedQuestionnaireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Questionnaire',
    index: true
  },
  
  // Board ownership and management
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'ownerModel',
    required: [true, 'Board owner is required'],
    index: true
  },
  
  ownerModel: {
    type: String,
    required: true,
    enum: ['Admin', 'Startup']
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: [true, 'Creator is required'],
    index: true
  },
  
  // Board columns configuration
  columns: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId()
    },
    name: {
      type: String,
      required: [true, 'Column name is required'],
      trim: true,
      maxlength: [50, 'Column name cannot exceed 50 characters']
    },
    position: {
      type: Number,
      required: true,
      min: 0
    },
    color: {
      type: String,
      default: '#3b82f6'
    },
    wipLimit: {
      type: Number,
      min: 0,
      default: 0 // 0 means no limit
    },
    isCompleted: {
      type: Boolean,
      default: false // Tasks in this column are considered completed
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Board access control
  visibility: {
    type: String,
    enum: ['private', 'startup-only', 'admin-only', 'public'],
    default: 'private',
    index: true
  },
  
  // Team members and access
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'members.userModel',
      required: true
    },
    userModel: {
      type: String,
      required: true,
      enum: ['Admin', 'Startup']
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'viewer'],
      default: 'member'
    },
    permissions: {
      canCreateTasks: {
        type: Boolean,
        default: true
      },
      canEditTasks: {
        type: Boolean,
        default: true
      },
      canDeleteTasks: {
        type: Boolean,
        default: false
      },
      canManageColumns: {
        type: Boolean,
        default: false
      },
      canInviteMembers: {
        type: Boolean,
        default: false
      },
      canViewAnalytics: {
        type: Boolean,
        default: true
      }
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  
  
  
  
  // Board status and lifecycle
  status: {
    type: String,
    enum: ['active', 'completed', 'on-hold', 'archived'],
    default: 'active',
    index: true
  },
  
  archivedAt: Date,
  archivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  
  completedAt: Date,
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
boardSchema.index({ boardType: 1, status: 1 });
boardSchema.index({ relatedStartupId: 1 });
boardSchema.index({ ownerId: 1, ownerModel: 1 });
boardSchema.index({ createdBy: 1 });
boardSchema.index({ visibility: 1 });
boardSchema.index({ 'members.userId': 1, 'members.userModel': 1 });
boardSchema.index({ sprintId: 1 }); // Add index for sprintId

// ... rest of the file unchanged ...

module.exports = mongoose.model('Board', boardSchema);
