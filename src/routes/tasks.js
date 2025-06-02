const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const Board = require('../models/Board');
const { AppError } = require('../middleware/errorHandler');
const { authenticateAdmin } = require('../middleware/auth');
const { validateInput } = require('../utils/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const createTaskSchema = {
  title: {
    required: true,
    type: 'string',
    minLength: 3,
    maxLength: 200,
    message: 'Task title is required (3-200 characters)'
  },
  description: {
    required: false,
    type: 'string',
    maxLength: 5000,
    message: 'Description cannot exceed 5000 characters'
  },
  boardId: {
    required: true,
    type: 'string',
    message: 'Board ID is required'
  },
  columnId: {
    required: true,
    type: 'string',
    message: 'Column ID is required'
  },
  assigneeId: {
    required: false,
    type: 'string',
    message: 'Assignee ID must be a valid string'
  },
  priority: {
    required: false,
    type: 'string',
    enum: ['low', 'medium', 'high', 'critical'],
    message: 'Valid priority is required'
  },
  dueDate: {
    required: false,
    type: 'string',
    message: 'Due date must be a valid date string'
  },
  estimatedHours: {
    required: false,
    type: 'number',
    min: 0,
    message: 'Estimated hours must be a positive number'
  },
  tags: {
    required: false,
    type: 'array',
    message: 'Tags must be an array'
  }
};

const updateTaskSchema = {
  title: {
    required: false,
    type: 'string',
    minLength: 3,
    maxLength: 200,
    message: 'Task title must be 3-200 characters'
  },
  description: {
    required: false,
    type: 'string',
    maxLength: 5000,
    message: 'Description cannot exceed 5000 characters'
  },
  status: {
    required: false,
    type: 'string',
    enum: ['todo', 'in_progress', 'in_review', 'testing', 'completed', 'cancelled'],
    message: 'Valid status is required'
  },
  priority: {
    required: false,
    type: 'string',
    enum: ['low', 'medium', 'high', 'critical'],
    message: 'Valid priority is required'
  },
  assigneeId: {
    required: false,
    type: 'string',
    message: 'Assignee ID must be a valid string'
  },
  dueDate: {
    required: false,
    type: 'string',
    message: 'Due date must be a valid date string'
  },
  estimatedHours: {
    required: false,
    type: 'number',
    min: 0,
    message: 'Estimated hours must be a positive number'
  },
  progress: {
    required: false,
    type: 'number',
    min: 0,
    max: 100,
    message: 'Progress must be between 0 and 100'
  }
};

const moveTaskSchema = {
  columnId: {
    required: true,
    type: 'string',
    message: 'Column ID is required'
  },
  position: {
    required: true,
    type: 'number',
    min: 0,
    message: 'Position must be a non-negative number'
  }
};

const addCommentSchema = {
  content: {
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 2000,
    message: 'Comment content is required (1-2000 characters)'
  },
  isInternal: {
    required: false,
    type: 'boolean',
    message: 'isInternal must be a boolean'
  }
};

const logTimeSchema = {
  hours: {
    required: true,
    type: 'number',
    min: 0.1,
    max: 24,
    message: 'Hours must be between 0.1 and 24'
  },
  description: {
    required: true,
    type: 'string',
    minLength: 3,
    maxLength: 500,
    message: 'Time log description is required (3-500 characters)'
  },
  logDate: {
    required: false,
    type: 'string',
    message: 'Log date must be a valid date string'
  }
};

// Helper function to check task access
async function checkTaskAccess(taskId, userId, accessType = 'read') {
  const task = await Task.findById(taskId).populate('boardId');
  
  if (!task) {
    throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
  }
  
  const board = task.boardId;
  
  // Check board access
  const hasAccess = board.visibility === 'public' ||
                   board.createdBy.toString() === userId.toString() ||
                   board.permissions.users.some(u => u.userId.toString() === userId.toString());
  
  if (!hasAccess) {
    throw new AppError('You do not have access to this task', 403, 'TASK_ACCESS_DENIED');
  }
  
  // For write access, check additional permissions
  if (accessType === 'write') {
    const hasEditAccess = board.createdBy.toString() === userId.toString() ||
                         board.permissions.users.some(u => 
                           u.userId.toString() === userId.toString() && 
                           ['admin', 'editor'].includes(u.role)
                         ) ||
                         task.assigneeId?.toString() === userId.toString();
    
    if (!hasEditAccess) {
      throw new AppError('You do not have permission to edit this task', 403, 'TASK_EDIT_DENIED');
    }
  }
  
  return task;
}

// ==================== TASK CRUD OPERATIONS ====================

// @route   GET /api/tasks
// @desc    Get tasks with filtering and pagination
// @access  Private (Admin)
router.get('/', authenticateAdmin, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      boardId,
      assigneeId,
      status,
      priority,
      search,
      dueDate,
      isOverdue,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const query = { isArchived: false };
    
    // Apply filters
    if (boardId) query.boardId = boardId;
    if (assigneeId) query.assigneeId = assigneeId;
    if (status) query.status = status;
    if (priority) query.priority = priority;
    
    // Search in title and description
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Due date filtering
    if (dueDate) {
      const date = new Date(dueDate);
      const nextDay = new Date(date.getTime() + 24 * 60 * 60 * 1000);
      query.dueDate = { $gte: date, $lt: nextDay };
    }
    
    // Overdue filter
    if (isOverdue === 'true') {
      query.dueDate = { $lt: new Date() };
      query.status = { $nin: ['completed', 'cancelled'] };
    }
    
    // Access control - only show tasks from boards user has access to
    const accessibleBoards = await Board.find({
      $or: [
        { createdBy: req.user._id },
        { 'permissions.users.userId': req.user._id },
        { visibility: 'public' }
      ]
    }).select('_id');
    
    query.boardId = { $in: accessibleBoards.map(b => b._id) };
    
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const tasks = await Task.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('boardId', 'name boardType')
      .populate('assigneeId', 'profile.firstName profile.lastName profile.avatar')
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('watchers.userId', 'profile.firstName profile.lastName');
    
    const total = await Task.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        tasks: tasks.map(task => ({
          id: task._id,
          title: task.title,
          description: task.description,
          status: task.status,
          priority: task.priority,
          board: task.boardId,
          assignee: task.assigneeId,
          createdBy: task.createdBy,
          createdAt: task.createdAt,
          updatedAt: task.updatedAt,
          dueDate: task.dueDate,
          estimatedHours: task.estimatedHours,
          actualHours: task.timeTracking.totalHours,
          progress: task.progress,
          tags: task.tags,
          watchers: task.watchers,
          commentsCount: task.comments.length,
          attachmentsCount: task.attachments.length,
          isOverdue: task.dueDate && task.dueDate < new Date() && !['completed', 'cancelled'].includes(task.status)
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          limit: parseInt(limit)
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/tasks/:id
// @desc    Get task details
// @access  Private (Admin)
router.get('/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'read');
    
    const populatedTask = await Task.findById(req.params.id)
      .populate('boardId', 'name columns')
      .populate('assigneeId', 'profile.firstName profile.lastName profile.avatar profile.department')
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('comments.authorId', 'profile.firstName profile.lastName profile.avatar')
      .populate('watchers.userId', 'profile.firstName profile.lastName')
      .populate('subtasks.assigneeId', 'profile.firstName profile.lastName')
      .populate('timeTracking.logs.loggedBy', 'profile.firstName profile.lastName');
    
    res.json({
      success: true,
      data: {
        task: {
          id: populatedTask._id,
          title: populatedTask.title,
          description: populatedTask.description,
          status: populatedTask.status,
          priority: populatedTask.priority,
          board: populatedTask.boardId,
          columnId: populatedTask.columnId,
          position: populatedTask.position,
          assignee: populatedTask.assigneeId,
          createdBy: populatedTask.createdBy,
          createdAt: populatedTask.createdAt,
          updatedAt: populatedTask.updatedAt,
          dueDate: populatedTask.dueDate,
          completedAt: populatedTask.completedAt,
          estimatedHours: populatedTask.estimatedHours,
          progress: populatedTask.progress,
          tags: populatedTask.tags,
          watchers: populatedTask.watchers,
          subtasks: populatedTask.subtasks,
          comments: populatedTask.comments.filter(comment => 
            !comment.isInternal || req.user.role === 'super_admin' || 
            populatedTask.boardId.createdBy.toString() === req.user._id.toString()
          ),
          attachments: populatedTask.attachments,
          timeTracking: populatedTask.timeTracking,
          activityLog: populatedTask.activityLog.slice(-20), // Last 20 activities
          dependencies: populatedTask.dependencies,
          customFields: populatedTask.customFields,
          isOverdue: populatedTask.dueDate && populatedTask.dueDate < new Date() && 
                    !['completed', 'cancelled'].includes(populatedTask.status)
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/tasks
// @desc    Create new task
// @access  Private (Admin)
router.post('/', authenticateAdmin, validateInput(createTaskSchema), async (req, res, next) => {
  try {
    const {
      title,
      description,
      boardId,
      columnId,
      assigneeId,
      priority = 'medium',
      dueDate,
      estimatedHours,
      tags = []
    } = req.body;
    
    // Validate board and column
    const board = await Board.findById(boardId);
    if (!board) {
      return next(new AppError('Board not found', 404, 'BOARD_NOT_FOUND'));
    }
    
    const column = board.columns.id(columnId);
    if (!column) {
      return next(new AppError('Column not found', 404, 'COLUMN_NOT_FOUND'));
    }
    
    // Check board access
    const hasAccess = board.visibility === 'public' ||
                     board.createdBy.toString() === req.user._id.toString() ||
                     board.permissions.users.some(u => u.userId.toString() === req.user._id.toString());
    
    if (!hasAccess) {
      return next(new AppError('You do not have access to this board', 403, 'BOARD_ACCESS_DENIED'));
    }
    
    // Validate assignee if provided
    if (assigneeId) {
      const Admin = require('../models/Admin');
      const assignee = await Admin.findById(assigneeId);
      if (!assignee) {
        return next(new AppError('Assignee not found', 404, 'ASSIGNEE_NOT_FOUND'));
      }
    }
    
    // Get position for new task (end of column)
    const tasksInColumn = await Task.find({ boardId, columnId }).sort({ position: -1 }).limit(1);
    const position = tasksInColumn.length > 0 ? tasksInColumn[0].position + 1 : 0;
    
    // Create task
    const task = new Task({
      title,
      description,
      boardId,
      columnId,
      position,
      assigneeId: assigneeId || null,
      priority,
      dueDate: dueDate ? new Date(dueDate) : null,
      estimatedHours: estimatedHours || null,
      tags: tags.map(tag => ({
        name: tag.name || tag,
        color: tag.color || '#e3f2fd'
      })),
      createdBy: req.user._id,
      status: getStatusFromColumn(column),
      activityLog: [{
        action: 'created',
        description: 'Task created',
        userId: req.user._id,
        timestamp: new Date()
      }]
    });
    
    // Add assignee as watcher if assigned
    if (assigneeId) {
      task.watchers.push({
        userId: assigneeId,
        addedAt: new Date()
      });
    }
    
    // Add creator as watcher
    task.watchers.push({
      userId: req.user._id,
      addedAt: new Date()
    });
    
    await task.save();
    
    // Populate for response
    const populatedTask = await Task.findById(task._id)
      .populate('boardId', 'name')
      .populate('assigneeId', 'profile.firstName profile.lastName profile.avatar')
      .populate('createdBy', 'profile.firstName profile.lastName');
    
    logger.logInfo(`Task created by admin ${req.user._id}`, {
      taskId: task._id,
      boardId: boardId,
      title: title
    });
    
    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: {
        task: {
          id: populatedTask._id,
          title: populatedTask.title,
          description: populatedTask.description,
          status: populatedTask.status,
          priority: populatedTask.priority,
          board: populatedTask.boardId,
          columnId: populatedTask.columnId,
          position: populatedTask.position,
          assignee: populatedTask.assigneeId,
          createdBy: populatedTask.createdBy,
          createdAt: populatedTask.createdAt,
          dueDate: populatedTask.dueDate,
          estimatedHours: populatedTask.estimatedHours,
          tags: populatedTask.tags
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/tasks/:id
// @desc    Update task
// @access  Private (Admin)
router.put('/:id', authenticateAdmin, validateInput(updateTaskSchema), async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'write');
    
    const {
      title,
      description,
      status,
      priority,
      assigneeId,
      dueDate,
      estimatedHours,
      progress,
      tags
    } = req.body;
    
    const oldValues = {
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId?.toString(),
      dueDate: task.dueDate,
      estimatedHours: task.estimatedHours,
      progress: task.progress
    };
    
    // Update fields
    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (priority !== undefined) task.priority = priority;
    if (dueDate !== undefined) task.dueDate = dueDate ? new Date(dueDate) : null;
    if (estimatedHours !== undefined) task.estimatedHours = estimatedHours;
    if (progress !== undefined) task.progress = progress;
    if (tags !== undefined) {
      task.tags = tags.map(tag => ({
        name: tag.name || tag,
        color: tag.color || '#e3f2fd'
      }));
    }
    
    // Handle status change
    if (status !== undefined && status !== task.status) {
      task.status = status;
      
      if (status === 'completed') {
        task.completedAt = new Date();
        task.progress = 100;
      } else if (task.completedAt) {
        task.completedAt = null;
      }
      
      // Log status change
      task.activityLog.push({
        action: 'status_changed',
        description: `Status changed from ${oldValues.status} to ${status}`,
        userId: req.user._id,
        timestamp: new Date(),
        metadata: {
          oldValue: oldValues.status,
          newValue: status
        }
      });
    }
    
    // Handle assignee change
    if (assigneeId !== undefined) {
      const oldAssigneeId = task.assigneeId?.toString();
      
      if (assigneeId && assigneeId !== oldAssigneeId) {
        // Validate new assignee
        const Admin = require('../models/Admin');
        const newAssignee = await Admin.findById(assigneeId);
        if (!newAssignee) {
          return next(new AppError('Assignee not found', 404, 'ASSIGNEE_NOT_FOUND'));
        }
        
        task.assigneeId = assigneeId;
        
        // Add new assignee as watcher if not already watching
        const isWatching = task.watchers.some(w => w.userId.toString() === assigneeId);
        if (!isWatching) {
          task.watchers.push({
            userId: assigneeId,
            addedAt: new Date()
          });
        }
        
        // Log assignment change
        task.activityLog.push({
          action: 'assigned',
          description: `Task assigned to ${newAssignee.profile.firstName} ${newAssignee.profile.lastName}`,
          userId: req.user._id,
          timestamp: new Date(),
          metadata: {
            assigneeId: assigneeId,
            assigneeName: `${newAssignee.profile.firstName} ${newAssignee.profile.lastName}`
          }
        });
      } else if (!assigneeId && oldAssigneeId) {
        // Unassign task
        task.assigneeId = null;
        
        task.activityLog.push({
          action: 'unassigned',
          description: 'Task unassigned',
          userId: req.user._id,
          timestamp: new Date()
        });
      }
    }
    
    // Log other significant changes
    const changes = [];
    if (title !== undefined && title !== oldValues.title) changes.push('title');
    if (priority !== undefined && priority !== oldValues.priority) changes.push('priority');
    if (dueDate !== undefined && dueDate !== oldValues.dueDate) changes.push('due date');
    
    if (changes.length > 0) {
      task.activityLog.push({
        action: 'updated',
        description: `Updated ${changes.join(', ')}`,
        userId: req.user._id,
        timestamp: new Date(),
        metadata: { changes }
      });
    }
    
    await task.save();
    
    // Populate for response
    const populatedTask = await Task.findById(task._id)
      .populate('boardId', 'name')
      .populate('assigneeId', 'profile.firstName profile.lastName profile.avatar')
      .populate('createdBy', 'profile.firstName profile.lastName');
    
    logger.logInfo(`Task updated by admin ${req.user._id}`, {
      taskId: task._id,
      changes: changes
    });
    
    res.json({
      success: true,
      message: 'Task updated successfully',
      data: {
        task: {
          id: populatedTask._id,
          title: populatedTask.title,
          description: populatedTask.description,
          status: populatedTask.status,
          priority: populatedTask.priority,
          assignee: populatedTask.assigneeId,
          dueDate: populatedTask.dueDate,
          estimatedHours: populatedTask.estimatedHours,
          progress: populatedTask.progress,
          tags: populatedTask.tags,
          updatedAt: populatedTask.updatedAt
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/tasks/:id/move
// @desc    Move task to different column/position
// @access  Private (Admin)
router.post('/:id/move', authenticateAdmin, validateInput(moveTaskSchema), async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'write');
    const { columnId, position } = req.body;
    
    // Validate column exists in board
    const board = await Board.findById(task.boardId);
    const targetColumn = board.columns.id(columnId);
    if (!targetColumn) {
      return next(new AppError('Target column not found', 404, 'COLUMN_NOT_FOUND'));
    }
    
    const oldColumnId = task.columnId;
    const oldPosition = task.position;
    
    // Update positions of other tasks
    if (columnId === oldColumnId.toString()) {
      // Moving within same column
      if (position > oldPosition) {
        // Moving down - decrement positions of tasks between old and new position
        await Task.updateMany(
          {
            boardId: task.boardId,
            columnId: columnId,
            position: { $gt: oldPosition, $lte: position }
          },
          { $inc: { position: -1 } }
        );
      } else if (position < oldPosition) {
        // Moving up - increment positions of tasks between new and old position
        await Task.updateMany(
          {
            boardId: task.boardId,
            columnId: columnId,
            position: { $gte: position, $lt: oldPosition }
          },
          { $inc: { position: 1 } }
        );
      }
    } else {
      // Moving to different column
      // Decrement positions in old column
      await Task.updateMany(
        {
          boardId: task.boardId,
          columnId: oldColumnId,
          position: { $gt: oldPosition }
        },
        { $inc: { position: -1 } }
      );
      
      // Increment positions in new column
      await Task.updateMany(
        {
          boardId: task.boardId,
          columnId: columnId,
          position: { $gte: position }
        },
        { $inc: { position: 1 } }
      );
    }
    
    // Update task
    task.columnId = columnId;
    task.position = position;
    task.status = getStatusFromColumn(targetColumn);
    
    // Log the move
    task.activityLog.push({
      action: 'moved',
      description: `Moved to column: ${targetColumn.name}`,
      userId: req.user._id,
      timestamp: new Date(),
      metadata: {
        oldColumnId: oldColumnId.toString(),
        newColumnId: columnId,
        oldPosition,
        newPosition: position
      }
    });
    
    await task.save();
    
    logger.logInfo(`Task moved by admin ${req.user._id}`, {
      taskId: task._id,
      fromColumn: oldColumnId.toString(),
      toColumn: columnId,
      position
    });
    
    res.json({
      success: true,
      message: 'Task moved successfully',
      data: {
        task: {
          id: task._id,
          columnId: task.columnId,
          position: task.position,
          status: task.status
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// Helper function to map column to status
function getStatusFromColumn(column) {
  const statusMap = {
    'todo': 'todo',
    'backlog': 'todo',
    'in progress': 'in_progress',
    'in-progress': 'in_progress',
    'doing': 'in_progress',
    'review': 'in_review',
    'in review': 'in_review',
    'testing': 'testing',
    'done': 'completed',
    'completed': 'completed',
    'finished': 'completed'
  };
  
  const columnName = column.name.toLowerCase();
  return statusMap[columnName] || 'todo';
}

// @route   DELETE /api/tasks/:id
// @desc    Delete (archive) task
// @access  Private (Admin)
router.delete('/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'write');
    
    // Check if user can delete (only creator or board admin)
    const board = await Board.findById(task.boardId);
    const canDelete = board.createdBy.toString() === req.user._id.toString() ||
                     task.createdBy.toString() === req.user._id.toString() ||
                     req.user.role === 'super_admin';
    
    if (!canDelete) {
      return next(new AppError('You do not have permission to delete this task', 403, 'TASK_DELETE_DENIED'));
    }
    
    // Archive instead of delete
    task.isArchived = true;
    task.archivedAt = new Date();
    task.archivedBy = req.user._id;
    
    // Log deletion
    task.activityLog.push({
      action: 'archived',
      description: 'Task archived',
      userId: req.user._id,
      timestamp: new Date()
    });
    
    await task.save();
    
    // Update positions of remaining tasks in column
    await Task.updateMany(
      {
        boardId: task.boardId,
        columnId: task.columnId,
        position: { $gt: task.position },
        isArchived: false
      },
      { $inc: { position: -1 } }
    );
    
    logger.logInfo(`Task archived by admin ${req.user._id}`, {
      taskId: task._id,
      boardId: task.boardId
    });
    
    res.json({
      success: true,
      message: 'Task archived successfully'
    });
    
  } catch (error) {
    next(error);
  }
});

module.exports = router;
