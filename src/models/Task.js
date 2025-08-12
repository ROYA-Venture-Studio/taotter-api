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
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

taskSchema.index({ boardId: 1, columnId: 1, position: 1 });
taskSchema.index({ columnId: 1, position: 1 }); // Added for move optimization
taskSchema.index({ assigneeId: 1, status: 1 });
taskSchema.index({ dueDate: 1, status: 1 });
taskSchema.index({ priority: 1, status: 1 });
taskSchema.index({ sprintId: 1 });
taskSchema.index({ createdBy: 1, createdByModel: 1 });
taskSchema.index({ 'tags.name': 1 }); // tags removed, but index left for migration safety

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

module.exports = mongoose.model('Task', taskSchema);
