const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const Board = require('../models/Board');
const { AppError } = require('../middleware/errorHandler');
const { authenticateAdmin } = require('../middleware/auth');
const { validate } = require('../utils/validation');
const logger = require('../utils/logger');

const router = express.Router();

const Joi = require('joi');

// ==================== TASK CRUD OPERATIONS ====================

// @route   POST /api/tasks
// @desc    Create new task (Admin)
// @access  Private (Admin)
router.post('/', authenticateAdmin, async (req, res, next) => {
  try {
    const { boardId, title, description, columnId, dueDate, taskType, priority, assigneeId, watchers } = req.body;

    if (!boardId || !title || !columnId) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    // Get position for new task (end of column)
    const tasksInColumn = await Task.find({ boardId, columnId }).sort({ position: -1 }).limit(1);
    const position = tasksInColumn.length > 0 ? tasksInColumn[0].position + 1 : 0;

    const task = new Task({
      boardId,
      title,
      description,
      columnId,
      position,
      dueDate: dueDate ? new Date(dueDate) : null,
      taskType: taskType || 'feature',
      priority: priority || 'medium',
      assigneeId: assigneeId,
      watchers: watchers || [],
      createdBy: req.user._id,
      createdByModel: 'Admin',
      status: req.body.status || 'todo',
      history: [{
        action: 'created',
        performedBy: req.user._id,
        performedByModel: 'Admin',
        changes: { created: true },
        timestamp: new Date()
      }]
    });

    await task.save();

    res.status(201).json({ success: true, data: { task } });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/tasks/:id/move
// @desc    Move task to different column/position (Admin)
// @access  Private (Admin)
router.post('/:id/move', authenticateAdmin, async (req, res, next) => {
  try {
    const { columnId, position } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    const oldColumnId = task.columnId.toString();
    const oldPosition = task.position;

    // Update positions of other tasks
    if (columnId === oldColumnId) {
      // Moving within same column
      if (position > oldPosition) {
        await Task.updateMany(
          {
            boardId: task.boardId,
            columnId: columnId,
            position: { $gt: oldPosition, $lte: position }
          },
          { $inc: { position: -1 } }
        );
      } else if (position < oldPosition) {
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
      await Task.updateMany(
        {
          boardId: task.boardId,
          columnId: oldColumnId,
          position: { $gt: oldPosition }
        },
        { $inc: { position: -1 } }
      );

      await Task.updateMany(
        {
          boardId: task.boardId,
          columnId: columnId,
          position: { $gte: position }
        },
        { $inc: { position: 1 } }
      );
    }

    // Actually move the task
    task.columnId = columnId;
    task.position = position;

    // Update status based on target column name
    const board = await Board.findById(task.boardId);
    const targetColumn = board.columns.id(columnId);
    if (targetColumn && targetColumn.name) {
      const name = targetColumn.name.toLowerCase().replace(/\s/g, "");
      if (name.includes("progress")) task.status = "in_progress";
      else if (name.includes("review")) task.status = "review";
      else if (name.includes("done") || name.includes("complete")) task.status = "done";
      else task.status = "todo";
    }

    // Add history entry (using the correct field name from the model)
    // Initialize history array if it doesn't exist (for older tasks)
    if (!task.history) {
      task.history = [];
    }
    
    task.history.push({
      action: 'moved',
      performedBy: req.user._id,
      performedByModel: 'Admin',
      changes: {
        from: oldColumnId,
        to: columnId,
        position: position,
        status: task.status
      },
      timestamp: new Date()
    });

    await task.save();

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

// @route   POST /api/tasks/startup
// @desc    Create new task (Startup)
// @access  Private (Startup)
router.post('/startup', async (req, res, next) => {
  try {
    const { authenticateStartup } = require('../middleware/auth');
    await authenticateStartup(req, res, () => {});

    const { boardId, title, description, columnId, dueDate, taskType, priority } = req.body;

    if (!boardId || !title || !columnId) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    // Ensure the board belongs to the startup
    const board = await Board.findById(boardId);

    // If relatedStartupId is missing, try to set it from the sprint's questionnaire
    if (!board.relatedStartupId && board.sprintId) {
      const Sprint = require('../models/Sprint');
      const sprint = await Sprint.findById(board.sprintId);
      if (sprint && sprint.questionnaireId) {
        // Try to get the startupId from the questionnaire
        const Questionnaire = require('../models/Questionnaire');
        const questionnaire = await Questionnaire.findById(sprint.questionnaireId);
        if (questionnaire && questionnaire.startupId) {
          board.relatedStartupId = questionnaire.startupId;
          await board.save();
          console.log("AUTO-POPULATED board.relatedStartupId from questionnaire:", board.relatedStartupId);
        } else {
          console.log("QUESTIONNAIRE NOT FOUND OR NO STARTUPID", sprint.questionnaireId, questionnaire);
        }
      } else {
        console.log("SPRINT NOT FOUND OR NO QUESTIONNAIREID", board.sprintId, sprint);
      }
    }

    // Debug logging
    console.log("STARTUP CREATE DEBUG: boardId", boardId, "board.relatedStartupId", board && board.relatedStartupId, "req.user._id", req.user && req.user._id, "board", board);

    if (!board || String(board.relatedStartupId) !== String(req.user._id)) {
      console.log("AUTH FAIL: board.relatedStartupId", board && board.relatedStartupId, "req.user._id", req.user && req.user._id, "board", board, "user", req.user);
      return res.status(403).json({ success: false, message: 'Not authorized for this board.' });
    }

    // Get position for new task (end of column)
    const tasksInColumn = await Task.find({ boardId, columnId }).sort({ position: -1 }).limit(1);
    const position = tasksInColumn.length > 0 ? tasksInColumn[0].position + 1 : 0;

    const task = new Task({
      boardId,
      title,
      description,
      columnId,
      position,
      dueDate: dueDate ? new Date(dueDate) : null,
      taskType: taskType || 'feature',
      priority: priority || 'medium',
      createdBy: req.user._id,
      createdByModel: 'Startup',
      status: 'todo',
      history: [{
        action: 'created',
        performedBy: req.user._id,
        performedByModel: 'Startup',
        changes: { created: true },
        timestamp: new Date()
      }]
    });

    await task.save();

    res.status(201).json({ success: true, data: { task } });
  } catch (err) {
    next(err);
  }
});

// @route   POST /api/tasks/startup/:id/move
// @desc    Move task to different column/position (Startup)
// @access  Private (Startup)
router.post('/startup/:id/move', async (req, res, next) => {
  try {
    const { authenticateStartup } = require('../middleware/auth');
    await authenticateStartup(req, res, () => {});

    const { columnId, position } = req.body;
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    // Ensure the board belongs to the startup
    const board = await Board.findById(task.boardId);

    // If relatedStartupId is missing, try to set it from the sprint's questionnaire
    if (!board.relatedStartupId && board.sprintId) {
      const Sprint = require('../models/Sprint');
      const sprint = await Sprint.findById(board.sprintId);
      if (sprint && sprint.questionnaireId) {
        // Try to get the startupId from the questionnaire
        const Questionnaire = require('../models/Questionnaire');
        const questionnaire = await Questionnaire.findById(sprint.questionnaireId);
        if (questionnaire && questionnaire.startupId) {
          board.relatedStartupId = questionnaire.startupId;
          await board.save();
          console.log("AUTO-POPULATED board.relatedStartupId from questionnaire:", board.relatedStartupId);
        } else {
          console.log("QUESTIONNAIRE NOT FOUND OR NO STARTUPID", sprint.questionnaireId, questionnaire);
        }
      } else {
        console.log("SPRINT NOT FOUND OR NO QUESTIONNAIREID", board.sprintId, sprint);
      }
    }

    // Debug logging
    console.log("STARTUP MOVE DEBUG: boardId", task.boardId, "board.relatedStartupId", board && board.relatedStartupId, "req.user._id", req.user && req.user._id, "board", board);

    if (!board || String(board.relatedStartupId) !== String(req.user._id)) {
      console.log("AUTH FAIL: board.relatedStartupId", board && board.relatedStartupId, "req.user._id", req.user && req.user._id, "board", board, "user", req.user);
      return res.status(403).json({ success: false, message: 'Not authorized for this board.' });
    }

    const oldColumnId = task.columnId.toString();
    const oldPosition = task.position;

    // Update positions of other tasks
    if (columnId === oldColumnId) {
      // Moving within same column
      if (position > oldPosition) {
        await Task.updateMany(
          {
            boardId: task.boardId,
            columnId: columnId,
            position: { $gt: oldPosition, $lte: position }
          },
          { $inc: { position: -1 } }
        );
      } else if (position < oldPosition) {
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
      await Task.updateMany(
        {
          boardId: task.boardId,
          columnId: oldColumnId,
          position: { $gt: oldPosition }
        },
        { $inc: { position: -1 } }
      );

      await Task.updateMany(
        {
          boardId: task.boardId,
          columnId: columnId,
          position: { $gte: position }
        },
        { $inc: { position: 1 } }
      );
    }

    // Actually move the task
    task.columnId = columnId;
    task.position = position;
    
    // Add history entry (using the correct field name from the model)
    // Initialize history array if it doesn't exist (for older tasks)
    if (!task.history) {
      task.history = [];
    }
    
    task.history.push({
      action: 'moved',
      performedBy: req.user._id,
      performedByModel: 'Startup',
      changes: {
        from: oldColumnId,
        to: columnId,
        position: position
      },
      timestamp: new Date()
    });

    await task.save();

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

module.exports = router;
