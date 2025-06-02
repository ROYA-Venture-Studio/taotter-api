const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true,
    maxlength: [200, 'Task title cannot exceed 200 characters']
  },
  
  description: {
    type: String,
    trim: true,
    maxlength: [5000, 'Task description cannot exceed 5000 characters']
  },
  
  taskType: {
    type: String,
    required: [true, 'Task type is required'],
    enum: [
      'development',
      'design',
      'research',
      'testing',
      'bug',
      'feature',
      'documentation',
      'meeting',
      'milestone',
      'review'
    ],
    index: true
  },
  
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'review', 'done', 'blocked'],
    default: 'todo',
    index: true
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true
  },
  
  // Task assignment and ownership
  assigneeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin', // Tasks are assigned to admins
    index: true
  },
  
  reporterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin', // Admin who reported/created the task
    index: true
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'createdByModel',
    required: true,
    index: true
  },
  
  createdByModel: {
    type: String,
    required: true,
    enum: ['Admin', 'Startup'],
    default: 'Admin'
  },
  
  // Board and project organization
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board',
    required: [true, 'Board ID is required'],
    index: true
  },
  
  columnId: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'Column ID is required'],
    index: true
  },
  
  sprintId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sprint',
    index: true
  },
  
  position: {
    type: Number,
    default: 0,
    index: true
  },
  
  // Time tracking
  dueDate: {
    type: Date,
    index: true
  },
  
  estimatedHours: {
    type: Number,
    min: 0,
    max: 1000
  },
  
  actualHours: {
    type: Number,
    min: 0,
    default: 0
  },
  
  timeEntries: [{
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true
    },
    hours: {
      type: Number,
      required: true,
      min: 0.1,
      max: 24
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Time entry description cannot exceed 500 characters']
    },
    date: {
      type: Date,
      required: true,
      default: Date.now
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Progress tracking
  progress: {
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    checklistItems: [{
      text: {
        type: String,
        required: true,
        trim: true,
        maxlength: [200, 'Checklist item cannot exceed 200 characters']
      },
      isCompleted: {
        type: Boolean,
        default: false
      },
      completedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
      },
      completedAt: Date,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    lastUpdatedAt: Date
  },
  
  // Tags and categorization
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
      enum: ['priority', 'type', 'department', 'custom'],
      default: 'custom'
    }
  }],
  
  // Task relationships
  dependencies: [{
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Task',
      required: true
    },
    type: {
      type: String,
      enum: ['blocks', 'blocked_by', 'relates_to', 'duplicates'],
      default: 'blocks'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  subtasks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  
  parentTaskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    index: true
  },
  
  // Comments and communication
  comments: [{
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'comments.authorModel',
      required: true
    },
    authorModel: {
      type: String,
      required: true,
      enum: ['Admin', 'Startup']
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [2000, 'Comment cannot exceed 2000 characters']
    },
    isInternal: {
      type: Boolean,
      default: false // Internal comments only visible to admins
    },
    mentions: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    }],
    attachments: [{
      filename: String,
      url: String,
      size: Number,
      mimeType: String
    }],
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    },
    isEdited: {
      type: Boolean,
      default: false
    }
  }],
  
  // Attachments and files
  attachments: [{
    filename: {
      type: String,
      required: true
    },
    originalName: String,
    url: {
      type: String,
      required: true
    },
    size: Number,
    mimeType: String,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'attachments.uploadedByModel',
      required: true
    },
    uploadedByModel: {
      type: String,
      required: true,
      enum: ['Admin', 'Startup']
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Task history and changes
  history: [{
    action: {
      type: String,
      required: true,
      enum: [
        'created',
        'updated',
        'moved',
        'assigned',
        'status_changed',
        'priority_changed',
        'commented',
        'time_logged'
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
    changes: mongoose.Schema.Types.Mixed, // Store what changed
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Related startup/project
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
  
  // Metadata
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
  
  // Notifications and watchers
  watchers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'watchers.userModel',
      required: true
    },
    userModel: {
      type: String,
      required: true,
      enum: ['Admin', 'Startup']
    },
    addedAt: {
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
taskSchema.index({ boardId: 1, columnId: 1, position: 1 });
taskSchema.index({ assigneeId: 1, status: 1 });
taskSchema.index({ dueDate: 1, status: 1 });
taskSchema.index({ priority: 1, status: 1 });
taskSchema.index({ relatedStartupId: 1 });
taskSchema.index({ sprintId: 1 });
taskSchema.index({ createdBy: 1, createdByModel: 1 });
taskSchema.index({ isArchived: 1 });
taskSchema.index({ 'tags.name': 1 });

// Virtual for overdue status
taskSchema.virtual('isOverdue').get(function() {
  return this.dueDate && this.dueDate < new Date() && this.status !== 'done';
});

// Virtual for days until due
taskSchema.virtual('daysUntilDue').get(function() {
  if (!this.dueDate) return null;
  const diff = this.dueDate - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Virtual for completion percentage based on checklist
taskSchema.virtual('checklistCompletion').get(function() {
  if (!this.progress.checklistItems || this.progress.checklistItems.length === 0) {
    return null;
  }
  const completed = this.progress.checklistItems.filter(item => item.isCompleted).length;
  return Math.round((completed / this.progress.checklistItems.length) * 100);
});

// Virtual for total time logged
taskSchema.virtual('totalTimeLogged').get(function() {
  return this.timeEntries.reduce((total, entry) => total + entry.hours, 0);
});

// Virtual for time variance (actual vs estimated)
taskSchema.virtual('timeVariance').get(function() {
  if (!this.estimatedHours) return null;
  return this.totalTimeLogged - this.estimatedHours;
});

// Pre-save middleware to update actual hours and progress
taskSchema.pre('save', function(next) {
  // Update actual hours from time entries
  this.actualHours = this.timeEntries.reduce((total, entry) => total + entry.hours, 0);
  
  // Auto-update progress percentage based on checklist if not manually set
  if (this.progress.checklistItems && this.progress.checklistItems.length > 0) {
    const completedItems = this.progress.checklistItems.filter(item => item.isCompleted).length;
    this.progress.percentage = Math.round((completedItems / this.progress.checklistItems.length) * 100);
  }
  
  // Mark as completed if progress is 100% and status isn't done
  if (this.progress.percentage === 100 && this.status !== 'done') {
    this.status = 'done';
    this.completedAt = new Date();
  }
  
  next();
});

// Pre-save middleware to track changes
taskSchema.pre('save', function(next) {
  if (this.isNew) {
    this.history.push({
      action: 'created',
      performedBy: this.createdBy,
      performedByModel: this.createdByModel,
      changes: { created: true }
    });
  } else {
    // Track what changed
    const changes = {};
    const modifiedPaths = this.modifiedPaths();
    
    modifiedPaths.forEach(path => {
      if (path !== 'updatedAt' && path !== 'history') {
        changes[path] = this[path];
      }
    });
    
    if (Object.keys(changes).length > 0) {
      this.history.push({
        action: 'updated',
        performedBy: this.progress.lastUpdatedBy || this.createdBy,
        performedByModel: this.createdByModel,
        changes
      });
    }
  }
  
  next();
});

// Instance method to move task to different column
taskSchema.methods.moveToColumn = function(columnId, position, performedBy, performedByModel = 'Admin') {
  const oldColumnId = this.columnId;
  this.columnId = columnId;
  this.position = position;
  
  this.history.push({
    action: 'moved',
    performedBy,
    performedByModel,
    changes: {
      from: oldColumnId,
      to: columnId,
      position
    }
  });
  
  return this.save();
};

// Instance method to assign task
taskSchema.methods.assignTo = function(adminId, performedBy, performedByModel = 'Admin') {
  const oldAssignee = this.assigneeId;
  this.assigneeId = adminId;
  
  this.history.push({
    action: 'assigned',
    performedBy,
    performedByModel,
    changes: {
      from: oldAssignee,
      to: adminId
    }
  });
  
  return this.save();
};

// Instance method to log time
taskSchema.methods.logTime = function(adminId, hours, description, date = new Date()) {
  this.timeEntries.push({
    adminId,
    hours,
    description,
    date
  });
  
  this.history.push({
    action: 'time_logged',
    performedBy: adminId,
    performedByModel: 'Admin',
    changes: {
      hours,
      description,
      date
    }
  });
  
  return this.save();
};

// Instance method to add comment
taskSchema.methods.addComment = function(authorId, authorModel, content, isInternal = false, mentions = []) {
  this.comments.push({
    authorId,
    authorModel,
    content,
    isInternal,
    mentions
  });
  
  this.history.push({
    action: 'commented',
    performedBy: authorId,
    performedByModel: authorModel,
    changes: {
      comment: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
      isInternal
    }
  });
  
  return this.save();
};

// Instance method to update status
taskSchema.methods.updateStatus = function(newStatus, performedBy, performedByModel = 'Admin') {
  const oldStatus = this.status;
  this.status = newStatus;
  
  if (newStatus === 'done' && !this.completedAt) {
    this.completedAt = new Date();
    this.completedBy = performedBy;
    this.progress.percentage = 100;
  }
  
  this.history.push({
    action: 'status_changed',
    performedBy,
    performedByModel,
    changes: {
      from: oldStatus,
      to: newStatus
    }
  });
  
  return this.save();
};

// Instance method to add watcher
taskSchema.methods.addWatcher = function(userId, userModel) {
  const existingWatcher = this.watchers.find(
    w => w.userId.toString() === userId.toString() && w.userModel === userModel
  );
  
  if (!existingWatcher) {
    this.watchers.push({ userId, userModel });
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Instance method to remove watcher
taskSchema.methods.removeWatcher = function(userId, userModel) {
  this.watchers = this.watchers.filter(
    w => !(w.userId.toString() === userId.toString() && w.userModel === userModel)
  );
  return this.save();
};

// Instance method to archive task
taskSchema.methods.archive = function(performedBy) {
  this.isArchived = true;
  this.archivedAt = new Date();
  this.archivedBy = performedBy;
  
  return this.save();
};

// Static method to find tasks by board and column
taskSchema.statics.findByBoardAndColumn = function(boardId, columnId, options = {}) {
  const { includeArchived = false } = options;
  
  const query = { 
    boardId, 
    columnId,
    ...(includeArchived ? {} : { isArchived: false })
  };
  
  return this.find(query)
    .populate('assigneeId', 'profile.firstName profile.lastName')
    .populate('createdBy')
    .sort({ position: 1 });
};

// Static method to find overdue tasks
taskSchema.statics.findOverdue = function(options = {}) {
  const { assigneeId, limit = 50 } = options;
  
  const query = {
    dueDate: { $lt: new Date() },
    status: { $ne: 'done' },
    isArchived: false
  };
  
  if (assigneeId) {
    query.assigneeId = assigneeId;
  }
  
  return this.find(query)
    .populate('assigneeId', 'profile.firstName profile.lastName')
    .populate('boardId', 'name')
    .sort({ dueDate: 1 })
    .limit(limit);
};

// Static method to get task statistics
taskSchema.statics.getStatistics = async function(filters = {}) {
  const matchStage = { isArchived: false };
  
  if (filters.boardId) {
    matchStage.boardId = mongoose.Types.ObjectId(filters.boardId);
  }
  
  if (filters.assigneeId) {
    matchStage.assigneeId = mongoose.Types.ObjectId(filters.assigneeId);
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
        todo: { $sum: { $cond: [{ $eq: ['$status', 'todo'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
        review: { $sum: { $cond: [{ $eq: ['$status', 'review'] }, 1, 0] } },
        done: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
        blocked: { $sum: { $cond: [{ $eq: ['$status', 'blocked'] }, 1, 0] } },
        overdue: { 
          $sum: { 
            $cond: [
              { 
                $and: [
                  { $lt: ['$dueDate', new Date()] },
                  { $ne: ['$status', 'done'] }
                ]
              }, 
              1, 
              0
            ] 
          } 
        },
        avgEstimatedHours: { $avg: '$estimatedHours' },
        avgActualHours: { $avg: '$actualHours' },
        totalTimeLogged: { $sum: '$actualHours' }
      }
    }
  ]);
  
  return stats[0] || {
    total: 0,
    todo: 0,
    inProgress: 0,
    review: 0,
    done: 0,
    blocked: 0,
    overdue: 0,
    avgEstimatedHours: 0,
    avgActualHours: 0,
    totalTimeLogged: 0
  };
};

// Static method to find tasks due soon
taskSchema.statics.findDueSoon = function(days = 3, options = {}) {
  const { assigneeId } = options;
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);
  
  const query = {
    dueDate: { 
      $gte: new Date(),
      $lte: futureDate 
    },
    status: { $ne: 'done' },
    isArchived: false
  };
  
  if (assigneeId) {
    query.assigneeId = assigneeId;
  }
  
  return this.find(query)
    .populate('assigneeId', 'profile.firstName profile.lastName')
    .populate('boardId', 'name')
    .sort({ dueDate: 1 });
};

module.exports = mongoose.model('Task', taskSchema);
