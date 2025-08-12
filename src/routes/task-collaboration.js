const express = require('express');
const Task = require('../models/Task');
const { AppError } = require('../middleware/errorHandler');
const { authenticateAdmin } = require('../middleware/auth');
const { validate } = require('../utils/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
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
  },
  mentions: {
    required: false,
    type: 'array',
    message: 'Mentions must be an array of user IDs'
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

const addSubtaskSchema = {
  title: {
    required: true,
    type: 'string',
    minLength: 3,
    maxLength: 200,
    message: 'Subtask title is required (3-200 characters)'
  },
  description: {
    required: false,
    type: 'string',
    maxLength: 1000,
    message: 'Description cannot exceed 1000 characters'
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

// ==================== COMMENTS ====================

// @route   POST /api/tasks/:id/comments
// @desc    Add comment to task
// @access  Private (Admin)
router.post('/:id/comments', authenticateAdmin, validate(require('joi').object({
  content: require('joi').string().min(1).max(2000).required(),
  isInternal: require('joi').boolean().optional()
})), async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'read');
    const { content, isInternal = false, mentions = [] } = req.body;
    
    // Create comment
    const comment = {
      content,
      authorId: req.user._id,
      isInternal,
      mentions: mentions.filter(id => id !== req.user._id.toString()), // Don't mention yourself
      createdAt: new Date()
    };
    
    task.comments.push(comment);
    
    // Activity log removed (field does not exist)
    
    // Watchers feature removed (field does not exist)
    
    await task.save();
    
    // Populate comment for response
    const populatedTask = await Task.findById(task._id)
      .populate('comments.authorId', 'profile.firstName profile.lastName profile.avatar');
    
    const addedComment = populatedTask.comments[populatedTask.comments.length - 1];
    
    logger.logInfo(`Comment added to task ${task._id} by admin ${req.user._id}`, {
      taskId: task._id,
      commentId: addedComment._id,
      isInternal
    });
    
    res.status(201).json({
      success: true,
      message: 'Comment added successfully',
      data: {
        comment: {
          id: addedComment._id,
          content: addedComment.content,
          author: addedComment.authorId,
          isInternal: addedComment.isInternal,
          mentions: addedComment.mentions,
          createdAt: addedComment.createdAt
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/tasks/:id/comments/:commentId
// @desc    Update comment
// @access  Private (Admin)
router.put('/:id/comments/:commentId', authenticateAdmin, async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'read');
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
      return next(new AppError('Comment content is required', 400, 'COMMENT_CONTENT_REQUIRED'));
    }
    
    const comment = task.comments.id(req.params.commentId);
    if (!comment) {
      return next(new AppError('Comment not found', 404, 'COMMENT_NOT_FOUND'));
    }
    
    // Check if user can edit comment (author or admin)
    const canEdit = comment.authorId.toString() === req.user._id.toString() ||
                   req.user.role === 'super_admin' ||
                   task.boardId.createdBy.toString() === req.user._id.toString();
    
    if (!canEdit) {
      return next(new AppError('You can only edit your own comments', 403, 'COMMENT_EDIT_DENIED'));
    }
    
    comment.content = content.trim();
    comment.editedAt = new Date();
    comment.editedBy = req.user._id;
    
    // Activity log removed (field does not exist)
    
    await task.save();
    
    res.json({
      success: true,
      message: 'Comment updated successfully',
      data: {
        comment: {
          id: comment._id,
          content: comment.content,
          editedAt: comment.editedAt,
          editedBy: comment.editedBy
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/tasks/:id/comments/:commentId
// @desc    Delete comment
// @access  Private (Admin)
router.delete('/:id/comments/:commentId', authenticateAdmin, async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'read');
    
    const comment = task.comments.id(req.params.commentId);
    if (!comment) {
      return next(new AppError('Comment not found', 404, 'COMMENT_NOT_FOUND'));
    }
    
    // Check if user can delete comment
    const canDelete = comment.authorId.toString() === req.user._id.toString() ||
                     req.user.role === 'super_admin' ||
                     task.boardId.createdBy.toString() === req.user._id.toString();
    
    if (!canDelete) {
      return next(new AppError('You can only delete your own comments', 403, 'COMMENT_DELETE_DENIED'));
    }
    
    task.comments.pull(req.params.commentId);
    
    // Activity log removed (field does not exist)
    
    await task.save();
    
    res.json({
      success: true,
      message: 'Comment deleted successfully'
    });
    
  } catch (error) {
    next(error);
  }
});

// ==================== TIME TRACKING ====================

// @route   POST /api/tasks/:id/time-logs
// @desc    Log time for task
// @access  Private (Admin)
router.post('/:id/time-logs', authenticateAdmin, validate(logTimeSchema), async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'write');
    const { hours, description, logDate } = req.body;
    
    // Time tracking removed (field does not exist)
    res.status(501).json({
      success: false,
      message: 'Time tracking is not supported on this system.'
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/tasks/:id/time-logs
// @desc    Get time logs for task
// @access  Private (Admin)
router.get('/:id/time-logs', authenticateAdmin, async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'read');
    
    // Time tracking removed (field does not exist)
    res.status(501).json({
      success: false,
      message: 'Time tracking is not supported on this system.'
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/tasks/:id/time-logs/:logId
// @desc    Delete time log
// @access  Private (Admin)
router.delete('/:id/time-logs/:logId', authenticateAdmin, async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'write');
    
    // Time tracking removed (field does not exist)
    res.status(501).json({
      success: false,
      message: 'Time tracking is not supported on this system.'
    });
    
  } catch (error) {
    next(error);
  }
});

// ==================== SUBTASKS ====================

// @route   POST /api/tasks/:id/subtasks
// @desc    Add subtask
// @access  Private (Admin)
router.post('/:id/subtasks', authenticateAdmin, validate(addSubtaskSchema), async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'write');
    const { title, description, assigneeId, dueDate } = req.body;
    
    // Validate assignee if provided
    if (assigneeId) {
      const Admin = require('../models/Admin');
      const assignee = await Admin.findById(assigneeId);
      if (!assignee) {
        return next(new AppError('Assignee not found', 404, 'ASSIGNEE_NOT_FOUND'));
      }
    }
    
    const subtask = {
      title,
      description: description || '',
      assigneeId: assigneeId || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      createdBy: req.user._id,
      createdAt: new Date()
    };
    
    task.subtasks.push(subtask);
    
    // Activity log removed (field does not exist)
    
    await task.save();
    
    // Populate for response
    const populatedTask = await Task.findById(task._id)
      .populate('subtasks.assigneeId', 'profile.firstName profile.lastName profile.avatar')
      .populate('subtasks.createdBy', 'profile.firstName profile.lastName');
    
    const addedSubtask = populatedTask.subtasks[populatedTask.subtasks.length - 1];
    
    logger.logInfo(`Subtask added to task ${task._id} by admin ${req.user._id}`, {
      taskId: task._id,
      subtaskId: addedSubtask._id,
      subtaskTitle: title
    });
    
    res.status(201).json({
      success: true,
      message: 'Subtask added successfully',
      data: {
        subtask: {
          id: addedSubtask._id,
          title: addedSubtask.title,
          description: addedSubtask.description,
          status: addedSubtask.status,
          assignee: addedSubtask.assigneeId,
          dueDate: addedSubtask.dueDate,
          createdBy: addedSubtask.createdBy,
          createdAt: addedSubtask.createdAt
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/tasks/:id/subtasks/:subtaskId
// @desc    Update subtask
// @access  Private (Admin)
router.put('/:id/subtasks/:subtaskId', authenticateAdmin, async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'write');
    const { title, description, status, assigneeId, dueDate } = req.body;
    
    const subtask = task.subtasks.id(req.params.subtaskId);
    if (!subtask) {
      return next(new AppError('Subtask not found', 404, 'SUBTASK_NOT_FOUND'));
    }
    
    const oldStatus = subtask.status;
    
    // Update fields
    if (title !== undefined) subtask.title = title;
    if (description !== undefined) subtask.description = description;
    if (status !== undefined) {
      subtask.status = status;
      if (status === 'completed') {
        subtask.completedAt = new Date();
      } else if (subtask.completedAt) {
        subtask.completedAt = null;
      }
    }
    if (assigneeId !== undefined) subtask.assigneeId = assigneeId || null;
    if (dueDate !== undefined) subtask.dueDate = dueDate ? new Date(dueDate) : null;
    
    // Add activity log
    const changes = [];
    if (status !== undefined && status !== oldStatus) {
      changes.push(`status: ${oldStatus} → ${status}`);
    }
    if (title !== undefined) changes.push('title');
    if (assigneeId !== undefined) changes.push('assignee');
    
    // Activity log removed (field does not exist)
    
    await task.save();
    
    res.json({
      success: true,
      message: 'Subtask updated successfully',
      data: {
        subtask: {
          id: subtask._id,
          title: subtask.title,
          description: subtask.description,
          status: subtask.status,
          assigneeId: subtask.assigneeId,
          dueDate: subtask.dueDate,
          completedAt: subtask.completedAt
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/tasks/:id/subtasks/:subtaskId
// @desc    Delete subtask
// @access  Private (Admin)
router.delete('/:id/subtasks/:subtaskId', authenticateAdmin, async (req, res, next) => {
  try {
    const task = await checkTaskAccess(req.params.id, req.user._id, 'write');
    
    const subtask = task.subtasks.id(req.params.subtaskId);
    if (!subtask) {
      return next(new AppError('Subtask not found', 404, 'SUBTASK_NOT_FOUND'));
    }
    
    const subtaskTitle = subtask.title;
    task.subtasks.pull(req.params.subtaskId);
    
    // Activity log removed (field does not exist)
    
    await task.save();
    
    res.json({
      success: true,
      message: 'Subtask deleted successfully'
    });
    
  } catch (error) {
    next(error);
  }
});

module.exports = router;
