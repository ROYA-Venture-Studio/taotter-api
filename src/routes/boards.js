const express = require('express');
const Board = require('../models/Board');
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const { AppError } = require('../middleware/errorHandler');
const { authenticateAdmin } = require('../middleware/auth');
const { validateInput } = require('../utils/validation');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const createBoardSchema = {
  name: {
    required: true,
    type: 'string',
    minLength: 3,
    maxLength: 100,
    message: 'Board name is required (3-100 characters)'
  },
  description: {
    required: false,
    type: 'string',
    maxLength: 500,
    message: 'Description cannot exceed 500 characters'
  },
  boardType: {
    required: true,
    type: 'string',
    enum: ['sprint', 'team', 'project', 'personal'],
    message: 'Valid board type is required'
  },
  sprintId: {
    required: false,
    type: 'string',
    message: 'Sprint ID must be a valid string'
  },
  columns: {
    required: true,
    type: 'array',
    minItems: 1,
    message: 'At least one column is required'
  },
  visibility: {
    required: false,
    type: 'string',
    enum: ['public', 'team', 'private'],
    message: 'Valid visibility is required'
  }
};

const updateBoardSchema = {
  name: {
    required: false,
    type: 'string',
    minLength: 3,
    maxLength: 100,
    message: 'Board name must be 3-100 characters'
  },
  description: {
    required: false,
    type: 'string',
    maxLength: 500,
    message: 'Description cannot exceed 500 characters'
  },
  columns: {
    required: false,
    type: 'array',
    message: 'Columns must be an array'
  },
  visibility: {
    required: false,
    type: 'string',
    enum: ['public', 'team', 'private'],
    message: 'Valid visibility is required'
  }
};

const addColumnSchema = {
  name: {
    required: true,
    type: 'string',
    minLength: 1,
    maxLength: 50,
    message: 'Column name is required (1-50 characters)'
  },
  description: {
    required: false,
    type: 'string',
    maxLength: 200,
    message: 'Description cannot exceed 200 characters'
  },
  color: {
    required: false,
    type: 'string',
    pattern: '^#[0-9A-F]{6}$',
    message: 'Color must be a valid hex color code'
  },
  position: {
    required: true,
    type: 'number',
    min: 0,
    message: 'Position must be a non-negative number'
  },
  wipLimit: {
    required: false,
    type: 'number',
    min: 1,
    message: 'WIP limit must be at least 1'
  }
};

// ==================== BOARD CRUD OPERATIONS ====================

// @route   GET /api/boards
// @desc    Get boards for admin
// @access  Private (Admin)
router.get('/', authenticateAdmin, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      teamId,
      isArchived = false,
      sortBy = 'updatedAt',
      sortOrder = 'desc'
    } = req.query;
    
    const query = { isArchived };
    
    // Add filters
    if (type) query.boardType = type;
    if (teamId) query['permissions.teams'] = teamId;
    
    // Add user access filter based on role and permissions
    if (req.user.role !== 'super_admin') {
      query.$or = [
        { createdBy: req.user._id },
        { 'permissions.users.userId': req.user._id },
        { 'permissions.teams': { $in: req.user.teams || [] } },
        { visibility: 'public' }
      ];
    }
    
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const boards = await Board.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('sprintId', 'name type status')
      .populate('permissions.users.userId', 'profile.firstName profile.lastName');
    
    const total = await Board.countDocuments(query);
    
    // Get task counts for each board
    const boardsWithTaskCounts = await Promise.all(
      boards.map(async (board) => {
        const taskCount = await Task.countDocuments({ boardId: board._id });
        const todoCount = await Task.countDocuments({ 
          boardId: board._id, 
          status: { $in: ['todo', 'backlog'] } 
        });
        const inProgressCount = await Task.countDocuments({ 
          boardId: board._id, 
          status: 'in_progress' 
        });
        const completedCount = await Task.countDocuments({ 
          boardId: board._id, 
          status: 'completed' 
        });
        
        return {
          id: board._id,
          name: board.name,
          description: board.description,
          boardType: board.boardType,
          visibility: board.visibility,
          columns: board.columns,
          sprint: board.sprintId,
          createdBy: board.createdBy,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
          settings: board.settings,
          taskCounts: {
            total: taskCount,
            todo: todoCount,
            inProgress: inProgressCount,
            completed: completedCount
          },
          permissions: board.permissions
        };
      })
    );
    
    res.json({
      success: true,
      data: {
        boards: boardsWithTaskCounts,
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

// @route   GET /api/boards/:id
// @desc    Get board details with tasks
// @access  Private (Admin)
router.get('/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const board = await Board.findById(req.params.id)
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('sprintId', 'name type status progress assignedTeam')
      .populate('permissions.users.userId', 'profile.firstName profile.lastName profile.department');
    
    if (!board) {
      return next(new AppError('Board not found', 404, 'BOARD_NOT_FOUND'));
    }
    
    // Check access permissions
    const hasAccess = board.visibility === 'public' ||
                     board.createdBy._id.toString() === req.user._id.toString() ||
                     board.permissions.users.some(u => u.userId._id.toString() === req.user._id.toString()) ||
                     req.user.role === 'super_admin';
    
    if (!hasAccess) {
      return next(new AppError('You do not have access to this board', 403, 'BOARD_ACCESS_DENIED'));
    }
    
    // Get tasks for this board
    const tasks = await Task.find({ boardId: board._id })
      .populate('assigneeId', 'profile.firstName profile.lastName profile.avatar')
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('comments.authorId', 'profile.firstName profile.lastName')
      .sort({ position: 1, createdAt: -1 });
    
    // Group tasks by column
    const tasksByColumn = {};
    board.columns.forEach(column => {
      tasksByColumn[column._id] = tasks.filter(task => 
        task.columnId && task.columnId.toString() === column._id.toString()
      );
    });
    
    // Get activity feed for the board
    const recentActivity = await Task.aggregate([
      { $match: { boardId: board._id } },
      { $unwind: '$activityLog' },
      { $sort: { 'activityLog.timestamp': -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from: 'admins',
          localField: 'activityLog.userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $project: {
          action: '$activityLog.action',
          description: '$activityLog.description',
          timestamp: '$activityLog.timestamp',
          user: { $arrayElemAt: ['$user', 0] },
          taskTitle: '$title'
        }
      }
    ]);
    
    res.json({
      success: true,
      data: {
        board: {
          id: board._id,
          name: board.name,
          description: board.description,
          boardType: board.boardType,
          visibility: board.visibility,
          columns: board.columns,
          sprint: board.sprintId,
          createdBy: board.createdBy,
          createdAt: board.createdAt,
          updatedAt: board.updatedAt,
          settings: board.settings,
          permissions: board.permissions,
          tasksByColumn,
          recentActivity: recentActivity.map(activity => ({
            action: activity.action,
            description: activity.description,
            timestamp: activity.timestamp,
            user: activity.user ? {
              id: activity.user._id,
              name: `${activity.user.profile.firstName} ${activity.user.profile.lastName}`
            } : null,
            taskTitle: activity.taskTitle
          }))
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/boards
// @desc    Create new board
// @access  Private (Admin)
router.post('/', authenticateAdmin, validateInput(createBoardSchema), async (req, res, next) => {
  try {
    const {
      name,
      description,
      boardType,
      sprintId,
      columns,
      visibility = 'team',
      settings = {}
    } = req.body;
    
    // Validate sprint if provided
    if (sprintId) {
      const sprint = await Sprint.findById(sprintId);
      if (!sprint) {
        return next(new AppError('Sprint not found', 404, 'SPRINT_NOT_FOUND'));
      }
    }
    
    // Validate and process columns
    const processedColumns = columns.map((column, index) => ({
      name: column.name,
      description: column.description || '',
      color: column.color || '#e3f2fd',
      position: column.position || index,
      columnType: column.columnType || 'custom',
      wipLimit: column.wipLimit || null
    }));
    
    // Create board
    const board = new Board({
      name,
      description,
      boardType,
      sprintId: sprintId || null,
      visibility,
      columns: processedColumns,
      createdBy: req.user._id,
      settings: {
        allowMemberAdd: settings.allowMemberAdd || true,
        allowTaskCreation: settings.allowTaskCreation || true,
        enableTimeTracking: settings.enableTimeTracking || false,
        enableDueDates: settings.enableDueDates || true,
        ...settings
      },
      permissions: {
        users: [{
          userId: req.user._id,
          role: 'admin',
          addedAt: new Date()
        }]
      }
    });
    
    await board.save();
    
    logger.logInfo(`Board created by admin ${req.user._id}`, {
      boardId: board._id,
      boardName: name,
      boardType,
      sprintId: sprintId || null
    });
    
    res.status(201).json({
      success: true,
      message: 'Board created successfully',
      data: {
        board: {
          id: board._id,
          name: board.name,
          description: board.description,
          boardType: board.boardType,
          visibility: board.visibility,
          columns: board.columns,
          sprintId: board.sprintId,
          createdAt: board.createdAt,
          settings: board.settings
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/boards/:id
// @desc    Update board
// @access  Private (Admin)
router.put('/:id', authenticateAdmin, validateInput(updateBoardSchema), async (req, res, next) => {
  try {
    const board = await Board.findById(req.params.id);
    
    if (!board) {
      return next(new AppError('Board not found', 404, 'BOARD_NOT_FOUND'));
    }
    
    // Check permissions
    const hasEditAccess = board.createdBy.toString() === req.user._id.toString() ||
                         board.permissions.users.some(u => 
                           u.userId.toString() === req.user._id.toString() && 
                           ['admin', 'editor'].includes(u.role)
                         ) ||
                         req.user.role === 'super_admin';
    
    if (!hasEditAccess) {
      return next(new AppError('You do not have permission to edit this board', 403, 'BOARD_EDIT_DENIED'));
    }
    
    const { name, description, columns, visibility, settings } = req.body;
    
    // Update fields
    if (name) board.name = name;
    if (description !== undefined) board.description = description;
    if (visibility) board.visibility = visibility;
    if (settings) board.settings = { ...board.settings, ...settings };
    
    // Update columns if provided
    if (columns) {
      // Get current tasks and their column assignments
      const tasks = await Task.find({ boardId: board._id });
      const oldColumnMap = new Map();
      board.columns.forEach(col => oldColumnMap.set(col._id.toString(), col));
      
      // Process new columns
      board.columns = columns.map((column, index) => ({
        _id: column._id || undefined,
        name: column.name,
        description: column.description || '',
        color: column.color || '#e3f2fd',
        position: column.position !== undefined ? column.position : index,
        columnType: column.columnType || 'custom',
        wipLimit: column.wipLimit || null
      }));
      
      // Handle tasks that might be in deleted columns
      const newColumnIds = board.columns.map(col => col._id?.toString()).filter(Boolean);
      const tasksInDeletedColumns = tasks.filter(task => 
        task.columnId && !newColumnIds.includes(task.columnId.toString())
      );
      
      // Move orphaned tasks to first column
      if (tasksInDeletedColumns.length > 0 && board.columns.length > 0) {
        const firstColumn = board.columns[0];
        await Task.updateMany(
          { _id: { $in: tasksInDeletedColumns.map(t => t._id) } },
          { columnId: firstColumn._id }
        );
      }
    }
    
    await board.save();
    
    logger.logInfo(`Board updated by admin ${req.user._id}`, {
      boardId: board._id,
      boardName: board.name
    });
    
    res.json({
      success: true,
      message: 'Board updated successfully',
      data: {
        board: {
          id: board._id,
          name: board.name,
          description: board.description,
          boardType: board.boardType,
          visibility: board.visibility,
          columns: board.columns,
          updatedAt: board.updatedAt,
          settings: board.settings
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/boards/:id
// @desc    Delete board (archive)
// @access  Private (Admin)
router.delete('/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const board = await Board.findById(req.params.id);
    
    if (!board) {
      return next(new AppError('Board not found', 404, 'BOARD_NOT_FOUND'));
    }
    
    // Check permissions (only creator or super admin can delete)
    const canDelete = board.createdBy.toString() === req.user._id.toString() ||
                     req.user.role === 'super_admin';
    
    if (!canDelete) {
      return next(new AppError('You do not have permission to delete this board', 403, 'BOARD_DELETE_DENIED'));
    }
    
    // Archive the board instead of deleting
    board.isArchived = true;
    board.archivedAt = new Date();
    board.archivedBy = req.user._id;
    
    await board.save();
    
    // Also archive associated tasks
    await Task.updateMany(
      { boardId: board._id },
      { 
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: req.user._id
      }
    );
    
    logger.logInfo(`Board archived by admin ${req.user._id}`, {
      boardId: board._id,
      boardName: board.name
    });
    
    res.json({
      success: true,
      message: 'Board archived successfully'
    });
    
  } catch (error) {
    next(error);
  }
});

// ==================== COLUMN MANAGEMENT ====================

// @route   POST /api/boards/:id/columns
// @desc    Add column to board
// @access  Private (Admin)
router.post('/:id/columns', authenticateAdmin, validateInput(addColumnSchema), async (req, res, next) => {
  try {
    const board = await Board.findById(req.params.id);
    
    if (!board) {
      return next(new AppError('Board not found', 404, 'BOARD_NOT_FOUND'));
    }
    
    // Check edit permissions
    const hasEditAccess = board.createdBy.toString() === req.user._id.toString() ||
                         board.permissions.users.some(u => 
                           u.userId.toString() === req.user._id.toString() && 
                           ['admin', 'editor'].includes(u.role)
                         ) ||
                         req.user.role === 'super_admin';
    
    if (!hasEditAccess) {
      return next(new AppError('You do not have permission to edit this board', 403, 'BOARD_EDIT_DENIED'));
    }
    
    const { name, description, color = '#e3f2fd', position, wipLimit } = req.body;
    
    // Adjust positions of existing columns if necessary
    if (position < board.columns.length) {
      board.columns.forEach(column => {
        if (column.position >= position) {
          column.position++;
        }
      });
    }
    
    // Add new column
    const newColumn = {
      name,
      description: description || '',
      color,
      position,
      columnType: 'custom',
      wipLimit: wipLimit || null
    };
    
    board.columns.push(newColumn);
    
    // Sort columns by position
    board.columns.sort((a, b) => a.position - b.position);
    
    await board.save();
    
    logger.logInfo(`Column added to board ${board._id}`, {
      boardId: board._id,
      columnName: name,
      adminId: req.user._id
    });
    
    res.status(201).json({
      success: true,
      message: 'Column added successfully',
      data: {
        column: newColumn,
        board: {
          id: board._id,
          columns: board.columns
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/boards/:id/columns/:columnId
// @desc    Update column
// @access  Private (Admin)
router.put('/:id/columns/:columnId', authenticateAdmin, async (req, res, next) => {
  try {
    const board = await Board.findById(req.params.id);
    
    if (!board) {
      return next(new AppError('Board not found', 404, 'BOARD_NOT_FOUND'));
    }
    
    const column = board.columns.id(req.params.columnId);
    if (!column) {
      return next(new AppError('Column not found', 404, 'COLUMN_NOT_FOUND'));
    }
    
    // Check edit permissions
    const hasEditAccess = board.createdBy.toString() === req.user._id.toString() ||
                         board.permissions.users.some(u => 
                           u.userId.toString() === req.user._id.toString() && 
                           ['admin', 'editor'].includes(u.role)
                         ) ||
                         req.user.role === 'super_admin';
    
    if (!hasEditAccess) {
      return next(new AppError('You do not have permission to edit this board', 403, 'BOARD_EDIT_DENIED'));
    }
    
    const { name, description, color, wipLimit } = req.body;
    
    // Update column properties
    if (name) column.name = name;
    if (description !== undefined) column.description = description;
    if (color) column.color = color;
    if (wipLimit !== undefined) column.wipLimit = wipLimit;
    
    await board.save();
    
    res.json({
      success: true,
      message: 'Column updated successfully',
      data: {
        column: column,
        board: {
          id: board._id,
          columns: board.columns
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   DELETE /api/boards/:id/columns/:columnId
// @desc    Delete column
// @access  Private (Admin)
router.delete('/:id/columns/:columnId', authenticateAdmin, async (req, res, next) => {
  try {
    const board = await Board.findById(req.params.id);
    
    if (!board) {
      return next(new AppError('Board not found', 404, 'BOARD_NOT_FOUND'));
    }
    
    const column = board.columns.id(req.params.columnId);
    if (!column) {
      return next(new AppError('Column not found', 404, 'COLUMN_NOT_FOUND'));
    }
    
    // Check edit permissions
    const hasEditAccess = board.createdBy.toString() === req.user._id.toString() ||
                         board.permissions.users.some(u => 
                           u.userId.toString() === req.user._id.toString() && 
                           ['admin', 'editor'].includes(u.role)
                         ) ||
                         req.user.role === 'super_admin';
    
    if (!hasEditAccess) {
      return next(new AppError('You do not have permission to edit this board', 403, 'BOARD_EDIT_DENIED'));
    }
    
    // Check if column has tasks
    const tasksInColumn = await Task.countDocuments({ 
      boardId: board._id, 
      columnId: req.params.columnId 
    });
    
    if (tasksInColumn > 0) {
      return next(new AppError('Cannot delete column that contains tasks. Please move tasks first.', 400, 'COLUMN_HAS_TASKS'));
    }
    
    // Remove column
    board.columns.pull(req.params.columnId);
    
    await board.save();
    
    logger.logInfo(`Column deleted from board ${board._id}`, {
      boardId: board._id,
      columnId: req.params.columnId,
      adminId: req.user._id
    });
    
    res.json({
      success: true,
      message: 'Column deleted successfully',
      data: {
        board: {
          id: board._id,
          columns: board.columns
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// ==================== BOARD ANALYTICS ====================

// @route   GET /api/boards/:id/analytics
// @desc    Get board analytics
// @access  Private (Admin)
router.get('/:id/analytics', authenticateAdmin, async (req, res, next) => {
  try {
    const board = await Board.findById(req.params.id);
    
    if (!board) {
      return next(new AppError('Board not found', 404, 'BOARD_NOT_FOUND'));
    }
    
    // Check access permissions
    const hasAccess = board.visibility === 'public' ||
                     board.createdBy.toString() === req.user._id.toString() ||
                     board.permissions.users.some(u => u.userId.toString() === req.user._id.toString()) ||
                     req.user.role === 'super_admin';
    
    if (!hasAccess) {
      return next(new AppError('You do not have access to this board', 403, 'BOARD_ACCESS_DENIED'));
    }
    
    const { dateRange = '30d' } = req.query;
    
    let startDate;
    const endDate = new Date();
    
    switch (dateRange) {
      case '7d':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
    
    // Get task analytics
    const [
      tasksByStatus,
      tasksByPriority,
      tasksByAssignee,
      taskCompletionTrend,
      averageCompletionTime,
      overdueTasksCount
    ] = await Promise.all([
      // Tasks by status
      Task.aggregate([
        { $match: { boardId: board._id } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      // Tasks by priority
      Task.aggregate([
        { $match: { boardId: board._id } },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]),
      
      // Tasks by assignee
      Task.aggregate([
        { $match: { boardId: board._id, assigneeId: { $exists: true } } },
        { 
          $group: { 
            _id: '$assigneeId', 
            totalTasks: { $sum: 1 },
            completedTasks: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            }
          }
        },
        {
          $lookup: {
            from: 'admins',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        }
      ]),
      
      // Task completion trend
      Task.aggregate([
        {
          $match: {
            boardId: board._id,
            completedAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Average completion time
      Task.aggregate([
        {
          $match: {
            boardId: board._id,
            completedAt: { $exists: true },
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: null,
            avgCompletionTime: {
              $avg: { $subtract: ['$completedAt', '$createdAt'] }
            }
          }
        }
      ]),
      
      // Overdue tasks count
      Task.countDocuments({
        boardId: board._id,
        dueDate: { $lt: new Date() },
        status: { $nin: ['completed', 'cancelled'] }
      })
    ]);
    
    res.json({
      success: true,
      data: {
        summary: {
          dateRange: { start: startDate, end: endDate },
          overdueTasksCount
        },
        tasksByStatus: tasksByStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        tasksByPriority: tasksByPriority.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        tasksByAssignee: tasksByAssignee.map(item => ({
          userId: item._id,
          userName: item.user[0] ? `${item.user[0].profile.firstName} ${item.user[0].profile.lastName}` : 'Unknown',
          totalTasks: item.totalTasks,
          completedTasks: item.completedTasks,
          completionRate: item.totalTasks > 0 ? Math.round((item.completedTasks / item.totalTasks) * 100) : 0
        })),
        taskCompletionTrend: taskCompletionTrend.map(item => ({
          date: item._id,
          count: item.count
        })),
        averageCompletionTime: averageCompletionTime[0] ? 
          Math.round(averageCompletionTime[0].avgCompletionTime / (1000 * 60 * 60 * 24)) : 0 // Convert to days
      }
    });
    
  } catch (error) {
    next(error);
  }
});

module.exports = router;
