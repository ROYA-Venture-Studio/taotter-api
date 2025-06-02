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

// Virtual for completion percentage
boardSchema.virtual('completionPercentage').get(function() {
  if (this.analytics.totalTasks === 0) return 0;
  return Math.round((this.analytics.completedTasks / this.analytics.totalTasks) * 100);
});

// Virtual for active member count
boardSchema.virtual('activeMemberCount').get(function() {
  return this.members.length;
});

// Virtual for column count
boardSchema.virtual('columnCount').get(function() {
  return this.columns.filter(col => !col.isArchived).length;
});

// Virtual for WIP limit violations
boardSchema.virtual('wipViolations').get(function() {
  // This would be calculated based on actual task counts
  // Implementation would require task aggregation
  return [];
});

// Pre-save middleware to track changes
boardSchema.pre('save', function(next) {
  if (this.isNew) {
    this.history.push({
      action: 'created',
      performedBy: this.createdBy,
      performedByModel: 'Admin',
      changes: { created: true }
    });
  } else if (this.isModified()) {
    const changes = {};
    const modifiedPaths = this.modifiedPaths();
    
    modifiedPaths.forEach(path => {
      if (path !== 'updatedAt' && path !== 'history' && path !== 'analytics') {
        changes[path] = this[path];
      }
    });
    
    if (Object.keys(changes).length > 0) {
      this.history.push({
        action: 'updated',
        performedBy: this.ownerId,
        performedByModel: this.ownerModel,
        changes
      });
    }
  }
  
  next();
});

// Pre-save middleware to update analytics
boardSchema.pre('save', function(next) {
  // Update active members count
  this.analytics.activeMembers = this.members.length;
  
  // Update last calculated time
  this.analytics.lastCalculatedAt = new Date();
  
  next();
});

// Instance method to add member
boardSchema.methods.addMember = function(userId, userModel, role = 'member', permissions = {}, addedBy) {
  // Check if member already exists
  const existingMember = this.members.find(
    m => m.userId.toString() === userId.toString() && m.userModel === userModel
  );
  
  if (existingMember) {
    throw new Error('User is already a member of this board');
  }
  
  // Set default permissions based on role
  const defaultPermissions = this.getDefaultPermissions(role);
  const finalPermissions = { ...defaultPermissions, ...permissions };
  
  this.members.push({
    userId,
    userModel,
    role,
    permissions: finalPermissions,
    addedBy
  });
  
  this.history.push({
    action: 'member_added',
    performedBy: addedBy,
    performedByModel: 'Admin',
    changes: {
      userId,
      userModel,
      role
    }
  });
  
  return this.save();
};

// Instance method to remove member
boardSchema.methods.removeMember = function(userId, userModel, removedBy) {
  this.members = this.members.filter(
    m => !(m.userId.toString() === userId.toString() && m.userModel === userModel)
  );
  
  this.history.push({
    action: 'member_removed',
    performedBy: removedBy,
    performedByModel: 'Admin',
    changes: {
      userId,
      userModel
    }
  });
  
  return this.save();
};

// Instance method to update member permissions
boardSchema.methods.updateMemberPermissions = function(userId, userModel, newPermissions, updatedBy) {
  const member = this.members.find(
    m => m.userId.toString() === userId.toString() && m.userModel === userModel
  );
  
  if (!member) {
    throw new Error('Member not found');
  }
  
  const oldPermissions = { ...member.permissions };
  member.permissions = { ...member.permissions, ...newPermissions };
  
  this.history.push({
    action: 'updated',
    performedBy: updatedBy,
    performedByModel: 'Admin',
    changes: {
      memberPermissions: {
        userId,
        userModel,
        from: oldPermissions,
        to: member.permissions
      }
    }
  });
  
  return this.save();
};

// Instance method to add column
boardSchema.methods.addColumn = function(name, position, options = {}, createdBy) {
  const newColumn = {
    name,
    position,
    color: options.color || '#3b82f6',
    wipLimit: options.wipLimit || 0,
    isCompleted: options.isCompleted || false,
    settings: options.settings || {}
  };
  
  // Adjust positions of existing columns
  this.columns.forEach(col => {
    if (col.position >= position) {
      col.position += 1;
    }
  });
  
  this.columns.push(newColumn);
  
  // Sort columns by position
  this.columns.sort((a, b) => a.position - b.position);
  
  this.history.push({
    action: 'column_added',
    performedBy: createdBy,
    performedByModel: 'Admin',
    changes: {
      columnName: name,
      position
    }
  });
  
  return this.save();
};

// Instance method to update column
boardSchema.methods.updateColumn = function(columnId, updates, updatedBy) {
  const column = this.columns.id(columnId);
  if (!column) {
    throw new Error('Column not found');
  }
  
  const oldColumn = { ...column.toObject() };
  Object.assign(column, updates);
  
  this.history.push({
    action: 'column_updated',
    performedBy: updatedBy,
    performedByModel: 'Admin',
    changes: {
      columnId,
      from: oldColumn,
      to: updates
    }
  });
  
  return this.save();
};

// Instance method to remove column
boardSchema.methods.removeColumn = function(columnId, removedBy) {
  const column = this.columns.id(columnId);
  if (!column) {
    throw new Error('Column not found');
  }
  
  column.isArchived = true;
  
  this.history.push({
    action: 'column_removed',
    performedBy: removedBy,
    performedByModel: 'Admin',
    changes: {
      columnId,
      columnName: column.name
    }
  });
  
  return this.save();
};

// Instance method to check user permissions
boardSchema.methods.hasPermission = function(userId, userModel, permission) {
  const member = this.members.find(
    m => m.userId.toString() === userId.toString() && m.userModel === userModel
  );
  
  if (!member) return false;
  
  // Owner and admin roles have all permissions
  if (member.role === 'owner' || member.role === 'admin') return true;
  
  return member.permissions[permission] === true;
};

// Instance method to get default permissions for role
boardSchema.methods.getDefaultPermissions = function(role) {
  const permissionSets = {
    owner: {
      canCreateTasks: true,
      canEditTasks: true,
      canDeleteTasks: true,
      canManageColumns: true,
      canInviteMembers: true,
      canViewAnalytics: true
    },
    admin: {
      canCreateTasks: true,
      canEditTasks: true,
      canDeleteTasks: true,
      canManageColumns: true,
      canInviteMembers: true,
      canViewAnalytics: true
    },
    member: {
      canCreateTasks: true,
      canEditTasks: true,
      canDeleteTasks: false,
      canManageColumns: false,
      canInviteMembers: false,
      canViewAnalytics: true
    },
    viewer: {
      canCreateTasks: false,
      canEditTasks: false,
      canDeleteTasks: false,
      canManageColumns: false,
      canInviteMembers: false,
      canViewAnalytics: true
    }
  };
  
  return permissionSets[role] || permissionSets.viewer;
};

// Instance method to archive board
boardSchema.methods.archive = function(archivedBy) {
  this.isArchived = true;
  this.archivedAt = new Date();
  this.archivedBy = archivedBy;
  this.status = 'archived';
  
  this.history.push({
    action: 'archived',
    performedBy: archivedBy,
    performedByModel: 'Admin',
    changes: { archived: true }
  });
  
  return this.save();
};

// Instance method to restore board
boardSchema.methods.restore = function(restoredBy) {
  this.isArchived = false;
  this.archivedAt = undefined;
  this.archivedBy = undefined;
  this.status = 'active';
  
  this.history.push({
    action: 'restored',
    performedBy: restoredBy,
    performedByModel: 'Admin',
    changes: { restored: true }
  });
  
  return this.save();
};

// Static method to find boards by user
boardSchema.statics.findByUser = function(userId, userModel, options = {}) {
  const { includeArchived = false, boardType } = options;
  
  const query = {
    $or: [
      { ownerId: userId, ownerModel: userModel },
      { 'members.userId': userId, 'members.userModel': userModel }
    ],
    ...(includeArchived ? {} : { isArchived: false })
  };
  
  if (boardType) {
    query.boardType = boardType;
  }
  
  return this.find(query)
    .populate('ownerId')
    .populate('relatedStartupId', 'profile.companyName profile.founderFirstName profile.founderLastName')
    .populate('createdBy', 'profile.firstName profile.lastName')
    .sort({ updatedAt: -1 });
};

// Static method to find public templates
boardSchema.statics.findPublicTemplates = function(options = {}) {
  const { category, limit = 20, page = 1 } = options;
  
  const query = {
    'template.isTemplate': true,
    'template.isPublic': true,
    isArchived: false
  };
  
  if (category) {
    query['template.templateCategory'] = category;
  }
  
  return this.find(query)
    .populate('createdBy', 'profile.firstName profile.lastName')
    .sort({ 'template.usageCount': -1, createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit);
};

// Static method to get board statistics
boardSchema.statics.getStatistics = async function(filters = {}) {
  const matchStage = { isArchived: false };
  
  if (filters.boardType) {
    matchStage.boardType = filters.boardType;
  }
  
  if (filters.ownerId) {
    matchStage.ownerId = mongoose.Types.ObjectId(filters.ownerId);
  }
  
  if (filters.dateRange) {
    matchStage.createdAt = {
      $gte: new Date(filters.dateRange.start),
      $lte: new Date(filters.dateRange.end)
    };
  }
  
  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        onHold: { $sum: { $cond: [{ $eq: ['$status', 'on-hold'] }, 1, 0] } },
        avgTotalTasks: { $avg: '$analytics.totalTasks' },
        avgCompletedTasks: { $avg: '$analytics.completedTasks' },
        avgMembers: { $avg: '$analytics.activeMembers' },
        avgCompletionTime: { $avg: '$analytics.averageCompletionTime' }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    active: 0,
    completed: 0,
    onHold: 0,
    avgTotalTasks: 0,
    avgCompletedTasks: 0,
    avgMembers: 0,
    avgCompletionTime: 0
  };
};

module.exports = mongoose.model('Board', boardSchema);
