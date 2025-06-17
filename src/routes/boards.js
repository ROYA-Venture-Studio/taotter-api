const express = require('express');
const Board = require('../models/Board');
const Task = require('../models/Task');
const Sprint = require('../models/Sprint');
const { AppError } = require('../middleware/errorHandler');
const { authenticateAdmin } = require('../middleware/auth');
const { validate } = require('../utils/validation');
const logger = require('../utils/logger');

const router = express.Router();

// ... (other routes unchanged) ...

// @route   GET /api/boards/by-sprint/:sprintId
// @desc    Get board by sprint ID (create if doesn't exist)
// @access  Private (Admin)
router.get('/by-sprint/:sprintId', authenticateAdmin, async (req, res, next) => {
  try {
    const sprintId = req.params.sprintId;
    
    // Verify sprint exists
    const sprint = await Sprint.findById(sprintId);
    if (!sprint) {
      return next(new AppError('Sprint not found', 404, 'SPRINT_NOT_FOUND'));
    }
    
    // Find existing board for this sprint (fix: use sprintId field)
    let board = await Board.findOne({ sprintId: sprintId })
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('sprintId', 'name type status progress assignedTeam')
      .populate('members.userId', 'profile.firstName profile.lastName profile.department');
    
    // If no board exists, create one
    if (!board) {
      board = new Board({
        name: `${sprint.name} Board`,
        description: `Kanban board for ${sprint.name}`,
        boardType: 'startup-project',
        sprintId: sprint._id, // fix: set sprintId
        relatedStartupId: sprint.startupId || undefined,
        relatedQuestionnaireId: sprint.questionnaireId || undefined,
        ownerId: req.user._id,
        ownerModel: 'Admin',
        createdBy: req.user._id,
        columns: [
          { name: 'To Do', position: 0, color: '#f3f4f6' },
          { name: 'In Progress', position: 1, color: '#dbeafe' },
          { name: 'Review', position: 2, color: '#fef3c7' },
          { name: 'Done', position: 3, color: '#d1fae5', isCompleted: true }
        ],
        visibility: 'admin-only',
        members: [
          {
            userId: req.user._id,
            userModel: 'Admin',
            role: 'owner',
            permissions: {
              canCreateTasks: true,
              canEditTasks: true,
              canDeleteTasks: true,
              canManageColumns: true,
              canInviteMembers: true,
              canViewAnalytics: true
            },
            addedBy: req.user._id
          }
        ],
        settings: {
          allowComments: true,
          allowAttachments: true,
          requireTaskAssignment: false,
          notifyOnTaskCreation: true,
          notifyOnTaskCompletion: true,
          defaultTaskPriority: 'medium'
        }
      });

      await board.save();

      // logger.logInfo(`Board auto-created for sprint ${sprintId}`, {
      //   boardId: board._id,
      //   sprintId: sprintId,
      //   adminId: req.user._id
      // });
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
          tasksByColumn
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/boards/startup/by-sprint/:sprintId
 * @desc    Get board for a sprint (readonly, startup access)
 * @access  Private (Startup)
 */
const { authenticateStartup } = require('../middleware/auth');
router.get('/startup/by-sprint/:sprintId', authenticateStartup, async (req, res, next) => {
  try {
    const sprintId = req.params.sprintId;
    // Populate questionnaireId to check startup ownership
    const sprint = await Sprint.findById(sprintId).populate('questionnaireId');
    if (!sprint) {
      return next(new AppError('Sprint not found', 404, 'SPRINT_NOT_FOUND'));
    }
    // Only allow if the questionnaire belongs to the authenticated startup
    if (
      !sprint.questionnaireId ||
      !sprint.questionnaireId.startupId ||
      sprint.questionnaireId.startupId.toString() !== req.user._id.toString()
    ) {
      return next(new AppError('Access denied. You can only view your own sprints.', 403, 'STARTUP_SPRINT_FORBIDDEN'));
    }
    // Find existing board for this sprint
    const board = await Board.findOne({ sprintId: sprintId })
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('sprintId', 'name type status progress assignedTeam')
      .populate('members.userId', 'profile.firstName profile.lastName profile.department');
    if (!board) {
      return next(new AppError('Board not found for this sprint', 404, 'BOARD_NOT_FOUND'));
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
          permissions: { readOnly: true },
          tasksByColumn
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// ... (rest of the file unchanged) ...

module.exports = router;
