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
    isArchived: {
      type: Boolean,
      default: false
    },
    settings: {
      autoAssign: {
        type: Boolean,
        default: false
      },
      autoAssignTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
      },
      requireDescription: {
        type: Boolean,
        default: false
      },
      allowExternalUsers: {
        type: Boolean,
        default: true // Allow startups to create tasks in this column
      }
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
  
  // Board settings and configuration
  settings: {
    autoArchiveCompletedTasks: {
      type: Boolean,
      default: false
    },
    autoArchiveDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365
    },
    allowComments: {
      type: Boolean,
      default: true
    },
    allowAttachments: {
      type: Boolean,
      default: true
    },
    requireTaskAssignment: {
      type: Boolean,
      default: false
    },
    notifyOnTaskCreation: {
      type: Boolean,
      default: true
    },
    notifyOnTaskCompletion: {
      type: Boolean,
      default: true
    },
    defaultTaskPriority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    workingDays: [{
      type: String,
      enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    }],
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
  },
  
  // Board templates and automation
  template: {
    isTemplate: {
      type: Boolean,
      default: false
    },
    templateCategory: {
      type: String,
      enum: ['software-development', 'marketing', 'business-planning', 'research', 'general'],
      index: true
    },
    templateTags: [String],
    isPublic: {
      type: Boolean,
      default: false
    },
    usageCount: {
      type: Number,
      default: 0
    }
  },
  
  // Automation rules
  automationRules: [{
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId()
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    trigger: {
      event: {
        type: String,
        enum: ['task_created', 'task_moved', 'task_completed', 'due_date_approaching'],
        required: true
      },
      conditions: mongoose.Schema.Types.Mixed
    },
    actions: [{
      type: {
        type: String,
        enum: ['assign_task', 'move_task', 'set_priority', 'add_comment', 'send_notification'],
        required: true
      },
      parameters: mongoose.Schema.Types.Mixed
    }],
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Board statistics and analytics
  analytics: {
    totalTasks: {
      type: Number,
      default: 0
    },
    completedTasks: {
      type: Number,
      default: 0
    },
    averageCompletionTime: {
      type: Number,
      default: 0 // in hours
    },
    lastTaskCreated: Date,
    lastTaskCompleted: Date,
    activeMembers: {
      type: Number,
      default: 0
    },
    monthlyTasksCreated: [{
      month: {
        type: String,
        required: true
      },
      year: {
        type: Number,
        required: true
      },
      count: {
        type: Number,
        default: 0
      }
    }],
    lastCalculatedAt: Date
  },
  
  // Board status and lifecycle
  status: {
    type: String,
    enum: ['active', 'completed', 'on-hold', 'archived'],
    default: 'active',
    index: true
  },
  
  isArchived: {
    type: Boolean,
    default: false,
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
  },
  
  // Board tags and categorization
  tags: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    color: {
      type: String,
      default: '#3b82f6'
    },
    category: {
      type: String,
      enum: ['project', 'department', 'priority', 'status', 'custom'],
      default: 'custom'
    }
  }],
  
  // Integration and external connections
  integrations: [{
    type: {
      type: String,
      enum: ['github', 'gitlab', 'slack', 'discord', 'email'],
      required: true
    },
    config: mongoose.Schema.Types.Mixed,
    isActive: {
      type: Boolean,
      default: true
    },
    lastSync: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Board history and audit trail
  history: [{
    action: {
      type: String,
      required: true,
      enum: [
        'created',
        'updated',
        'member_added',
        'member_removed',
        'column_added',
        'column_updated',
        'column_removed',
        'archived',
        'restored'
      ]
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'history.performedByModel',
      required: true
    },
    performedByModel: {
      type: String,
      required: true,
      enum: ['Admin', 'Startup']
    },
    changes: mongoose.Schema.Types.Mixed,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }]
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
boardSchema.index({ isArchived: 1 });
boardSchema.index({ 'template.isTemplate': 1, 'template.isPublic': 1 });
boardSchema.index({ 'tags.name': 1 });
boardSchema.index({ sprintId: 1 }); // Add index for sprintId

// ... rest of the file unchanged ...

module.exports = mongoose.model('Board', boardSchema);
