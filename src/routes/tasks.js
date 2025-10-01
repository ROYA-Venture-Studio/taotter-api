const express = require('express');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const Board = require('../models/Board');
const { AppError } = require('../middleware/errorHandler');
const { authenticateAdmin } = require('../middleware/auth');
const { validate } = require('../utils/validation');
const logger = require('../utils/logger');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { uploadFile } = require('../utils/azureStorage');

const router = express.Router();

const Joi = require('joi');

// ==================== TASK CRUD OPERATIONS ====================

// @route   POST /api/tasks
// @desc    Create new task (Admin)
// @access  Private (Admin)
router.post('/', authenticateAdmin, upload.array('attachments'), async (req, res, next) => {
  try {
    const { boardId, title, description, columnId, dueDate, taskType, priority, assigneeId, watchers } = req.body;

    if (!boardId || !title || !columnId) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    // Get position for new task (end of column)
    const tasksInColumn = await Task.find({ boardId, columnId }).sort({ position: -1 }).limit(1);
    const position = tasksInColumn.length > 0 ? tasksInColumn[0].position + 1 : 0;

    // Handle file uploads
    let attachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadResult = await uploadFile(
          file,
          req.user._id.toString(),
          '', // sprintId not available here, can be added if needed
          'task'
        );
        if (uploadResult.success) {
          attachments.push({
            filename: uploadResult.fileName,
            originalName: file.originalname,
            url: uploadResult.fileUrl,
            size: file.size,
            mimeType: file.mimetype,
            uploadedBy: req.user._id,
            uploadedByModel: 'Admin'
          });
        }
      }
    }

    const mongoose = require('mongoose');
    const task = new Task({
      boardId,
      title,
      description,
      columnId,
      position,
      dueDate: dueDate ? new Date(dueDate) : null,
      taskType: taskType || 'feature',
      priority: priority || 'medium',
      assigneeId: assigneeId ? new mongoose.Types.ObjectId(assigneeId) : undefined,
      createdBy: req.user._id,
      createdByModel: 'Admin',
      status: req.body.status || 'todo',
      attachments
    });

    await task.save();

    // Update sprint task counts and progress
    try {
      const board = await Board.findById(boardId);
      if (board && board.sprintId) {
        const Sprint = require('../models/Sprint');
        const TaskModel = require('../models/Task');
        const sprint = await Sprint.findById(board.sprintId);
        if (sprint) {
          const allTasks = await TaskModel.find({ boardId });
          const totalTasks = allTasks.length;
          const doneTasks = allTasks.filter(t => t.status === "done").length;
          sprint.totalTasks = totalTasks;
          sprint.doneTasks = doneTasks;
          sprint.progress = sprint.progress || {};
          sprint.progress.percentage = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 100;
          await sprint.save();
        }
      }
    } catch (progressErr) {
      logger.logError("Failed to update sprint task counts after task creation", progressErr);
    }

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
    const oldStatus = task.status;

    // Optimized: Use bulkWrite for batch updates
    const bulkOps = [];
    if (columnId === oldColumnId) {
      if (position > oldPosition) {
        bulkOps.push({
          updateMany: {
            filter: {
              boardId: task.boardId,
              columnId: columnId,
              position: { $gt: oldPosition, $lte: position }
            },
            update: { $inc: { position: -1 } }
          }
        });
      } else if (position < oldPosition) {
        bulkOps.push({
          updateMany: {
            filter: {
              boardId: task.boardId,
              columnId: columnId,
              position: { $gte: position, $lt: oldPosition }
            },
            update: { $inc: { position: 1 } }
          }
        });
      }
    } else {
      bulkOps.push(
        {
          updateMany: {
            filter: {
              boardId: task.boardId,
              columnId: oldColumnId,
              position: { $gt: oldPosition }
            },
            update: { $inc: { position: -1 } }
          }
        },
        {
          updateMany: {
            filter: {
              boardId: task.boardId,
              columnId: columnId,
              position: { $gte: position }
            },
            update: { $inc: { position: 1 } }
          }
        }
      );
    }
    if (bulkOps.length > 0) {
      await Task.bulkWrite(bulkOps);
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

    // Save and send email if moved to review
    const newStatus = task.status;
    await task.save();

    // Update sprint task counts and progress after task move
    try {
      const allTasks = await Task.find({ boardId: task.boardId });
      const totalTasks = allTasks.length;
      const doneTasks = allTasks.filter(t => t.status === "done").length;
      if (board.sprintId) {
        const Sprint = require('../models/Sprint');
        const sprint = await Sprint.findById(board.sprintId);
        if (sprint) {
          sprint.totalTasks = totalTasks;
          sprint.doneTasks = doneTasks;
          sprint.progress = sprint.progress || {};
          sprint.progress.percentage = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 100;
          await sprint.save();
        }
      }
    } catch (progressErr) {
      logger.logError("Failed to update sprint task counts after task move", progressErr);
    }

    // Only send email if status changed to "review" (async, non-blocking)
    if (oldStatus !== "review" && newStatus === "review") {
      setImmediate(async () => {
        try {
          // Find related sprint, questionnaire, and startup
          const sprintId = board.sprintId;
          if (sprintId) {
            const Sprint = require('../models/Sprint');
            const Questionnaire = require('../models/Questionnaire');
            const Startup = require('../models/Startup');
            const sprint = await Sprint.findById(sprintId);
            if (sprint && sprint.questionnaireId) {
              const questionnaire = await Questionnaire.findById(sprint.questionnaireId);
              if (questionnaire && questionnaire.startupId) {
                const startup = await Startup.findById(questionnaire.startupId);
                if (startup && startup.email) {
                  const { sendEmail } = require('../utils/communications');
                  await sendEmail({
                    to: startup.email,
                    template: "tasksForReview",
                    data: {
                      name: startup.profile?.founderFirstName || "Founder",
                      boardName: board.name || "Board",
                      dashboardUrl: process.env.CLIENT_DASHBOARD_URL || "http://20.57.132.51:3000//startup/dashboard"
                    }
                  });
                }
              }
            }
          }
        } catch (emailErr) {
          logger.logError("Failed to send review notification email to startup", emailErr);
        }
      });
    }

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
router.post('/startup', upload.array('attachments'), async (req, res, next) => {
  try {
    const { authenticateStartup } = require('../middleware/auth');
    await authenticateStartup(req, res, () => {});

    const { boardId, title, description, columnId, dueDate, taskType, priority } = req.body;

    if (!boardId || !title || !columnId) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    // Ensure the board belongs to the startup
    const board = await Board.findById(boardId);

    // Debug logging
    // (Authorization logic for relatedStartupId removed)

    // Get position for new task (end of column)
    const tasksInColumn = await Task.find({ boardId, columnId }).sort({ position: -1 }).limit(1);
    const position = tasksInColumn.length > 0 ? tasksInColumn[0].position + 1 : 0;

    // Handle file uploads
    let attachments = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadResult = await uploadFile(
          file,
          req.user._id.toString(),
          '', // sprintId not available here, can be added if needed
          'task'
        );
        if (uploadResult.success) {
          attachments.push({
            filename: uploadResult.fileName,
            originalName: file.originalname,
            url: uploadResult.fileUrl,
            size: file.size,
            mimeType: file.mimetype,
            uploadedBy: req.user._id,
            uploadedByModel: 'Startup'
          });
        }
      }
    }

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
      attachments
    });

    await task.save();

    // Update sprint task counts and progress
    try {
      const board = await Board.findById(boardId);
      if (board && board.sprintId) {
        const Sprint = require('../models/Sprint');
        const TaskModel = require('../models/Task');
        const sprint = await Sprint.findById(board.sprintId);
        if (sprint) {
          const allTasks = await TaskModel.find({ boardId });
          const totalTasks = allTasks.length;
          const doneTasks = allTasks.filter(t => t.status === "done").length;
          sprint.totalTasks = totalTasks;
          sprint.doneTasks = doneTasks;
          sprint.progress = sprint.progress || {};
          sprint.progress.percentage = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 100;
          await sprint.save();
        }
      }
    } catch (progressErr) {
      logger.logError("Failed to update sprint task counts after task creation", progressErr);
    }

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

    // Debug logging
    // (Authorization logic for relatedStartupId removed)

    const oldColumnId = task.columnId.toString();
    const oldPosition = task.position;
    const oldStatus = task.status;

    // Optimized: Use bulkWrite for batch updates
    const bulkOps = [];
    if (columnId === oldColumnId) {
      if (position > oldPosition) {
        bulkOps.push({
          updateMany: {
            filter: {
              boardId: task.boardId,
              columnId: columnId,
              position: { $gt: oldPosition, $lte: position }
            },
            update: { $inc: { position: -1 } }
          }
        });
      } else if (position < oldPosition) {
        bulkOps.push({
          updateMany: {
            filter: {
              boardId: task.boardId,
              columnId: columnId,
              position: { $gte: position, $lt: oldPosition }
            },
            update: { $inc: { position: 1 } }
          }
        });
      }
    } else {
      bulkOps.push(
        {
          updateMany: {
            filter: {
              boardId: task.boardId,
              columnId: oldColumnId,
              position: { $gt: oldPosition }
            },
            update: { $inc: { position: -1 } }
          }
        },
        {
          updateMany: {
            filter: {
              boardId: task.boardId,
              columnId: columnId,
              position: { $gte: position }
            },
            update: { $inc: { position: 1 } }
          }
        }
      );
    }
    if (bulkOps.length > 0) {
      await Task.bulkWrite(bulkOps);
    }

    // Actually move the task
    task.columnId = columnId;
    task.position = position;

    // Update status based on target column name
    const targetColumn = board.columns.id(columnId);
    if (targetColumn && targetColumn.name) {
      const name = targetColumn.name.toLowerCase().replace(/\s/g, "");
      if (name.includes("progress")) task.status = "in_progress";
      else if (name.includes("review")) task.status = "review";
      else if (name.includes("done") || name.includes("complete")) task.status = "done";
      else task.status = "todo";
    }

    // Save and send email if moved to review
    const newStatus = task.status;
    await task.save();

    // Update sprint task counts and progress after task move
    try {
      const allTasks = await Task.find({ boardId: task.boardId });
      const totalTasks = allTasks.length;
      const doneTasks = allTasks.filter(t => t.status === "done").length;
      if (board.sprintId) {
        const Sprint = require('../models/Sprint');
        const sprint = await Sprint.findById(board.sprintId);
        if (sprint) {
          sprint.totalTasks = totalTasks;
          sprint.doneTasks = doneTasks;
          sprint.progress = sprint.progress || {};
          sprint.progress.percentage = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 100;
          await sprint.save();
        }
      }
    } catch (progressErr) {
      logger.logError("Failed to update sprint task counts after task move", progressErr);
    }

    // Only send email if status changed to "review" (async, non-blocking)
    if (oldStatus !== "review" && newStatus === "review") {
      setImmediate(async () => {
        try {
          // Find related sprint, questionnaire, and startup
          const sprintId = board.sprintId;
          if (sprintId) {
            const Sprint = require('../models/Sprint');
            const Questionnaire = require('../models/Questionnaire');
            const Startup = require('../models/Startup');
            const sprint = await Sprint.findById(sprintId);
            if (sprint && sprint.questionnaireId) {
              const questionnaire = await Questionnaire.findById(sprint.questionnaireId);
              if (questionnaire && questionnaire.startupId) {
                const startup = await Startup.findById(questionnaire.startupId);
                if (startup && startup.email) {
                  const { sendEmail } = require('../utils/communications');
                  await sendEmail({
                    to: startup.email,
                    template: "tasksForReview",
                    data: {
                      name: startup.profile?.founderFirstName || "Founder",
                      boardName: board.name || "Board"
                    }
                  });
                }
              }
            }
          }
        } catch (emailErr) {
          logger.logError("Failed to send review notification email to startup", emailErr);
        }
      });
    }

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

/**
 * @route   PUT /api/tasks/:id
 * @desc    Edit a task (Admin)
 * @access  Private (Admin)
 */
router.put('/:id', authenticateAdmin, upload.array('attachments'), async (req, res, next) => {
  try {
    const allowedFields = [
      'title', 'description', 'taskType', 'status', 'priority',
      'assigneeId', 'dueDate', 'columnId', 'position'
    ];
    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    // Remove attachments if requested
    let attachmentIdsToRemove = [];
    if (req.body.attachmentIdsToRemove) {
      try {
        attachmentIdsToRemove = JSON.parse(req.body.attachmentIdsToRemove);
      } catch {
        attachmentIdsToRemove = Array.isArray(req.body.attachmentIdsToRemove)
          ? req.body.attachmentIdsToRemove
          : [req.body.attachmentIdsToRemove];
      }
    }
    if (attachmentIdsToRemove.length > 0) {
      const { deleteFile } = require('../utils/azureStorage');
      for (const id of attachmentIdsToRemove) {
        const att = task.attachments.id(id) || task.attachments.find(a => a._id.toString() === id);
        if (att) {
          await deleteFile(att.url);
          task.attachments.pull(att._id);
        }
      }
    }

    // Add new attachments if any
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadResult = await uploadFile(
          file,
          req.user._id.toString(),
          '', // sprintId not available here, can be added if needed
          'task'
        );
        if (uploadResult.success) {
          task.attachments.push({
            filename: uploadResult.fileName,
            originalName: file.originalname,
            url: uploadResult.fileUrl,
            size: file.size,
            mimeType: file.mimetype,
            uploadedBy: req.user._id,
            uploadedByModel: 'Admin'
          });
        }
      }
    }

    // Update other fields
    Object.assign(task, updates);

    await task.save();

    res.json({ success: true, data: { task } });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   DELETE /api/tasks/:id
 * @desc    Delete a task (Admin)
 * @access  Private (Admin)
 */
router.delete('/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    // Update sprint task counts and progress
    try {
      const board = await Board.findById(task.boardId);
      if (board && board.sprintId) {
        const Sprint = require('../models/Sprint');
        const TaskModel = require('../models/Task');
        const sprint = await Sprint.findById(board.sprintId);
        if (sprint) {
          const allTasks = await TaskModel.find({ boardId: task.boardId });
          const totalTasks = allTasks.length;
          const doneTasks = allTasks.filter(t => t.status === "done").length;
          sprint.totalTasks = totalTasks;
          sprint.doneTasks = doneTasks;
          sprint.progress = sprint.progress || {};
          sprint.progress.percentage = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 100;
          await sprint.save();
        }
      }
    } catch (progressErr) {
      logger.logError("Failed to update sprint task counts after task deletion", progressErr);
    }

    res.json({ success: true, message: 'Task deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PUT /api/tasks/startup/:id
 * @desc    Edit a task (Startup)
 * @access  Private (Startup)
 */
router.put('/startup/:id', upload.array('attachments'), async (req, res, next) => {
  try {
    const { authenticateStartup } = require('../middleware/auth');
    await authenticateStartup(req, res, () => {});

    const allowedFields = [
      'title', 'description', 'taskType', 'status', 'priority',
      'dueDate', 'columnId', 'position'
    ];
    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    // Remove attachments if requested
    let attachmentIdsToRemove = [];
    if (req.body.attachmentIdsToRemove) {
      try {
        attachmentIdsToRemove = JSON.parse(req.body.attachmentIdsToRemove);
      } catch {
        attachmentIdsToRemove = Array.isArray(req.body.attachmentIdsToRemove)
          ? req.body.attachmentIdsToRemove
          : [req.body.attachmentIdsToRemove];
      }
    }
    if (attachmentIdsToRemove.length > 0) {
      const { deleteFile } = require('../utils/azureStorage');
      for (const id of attachmentIdsToRemove) {
        const att = task.attachments.id(id) || task.attachments.find(a => a._id.toString() === id);
        if (att) {
          await deleteFile(att.url);
          task.attachments.pull(att._id);
        }
      }
    }

    // Add new attachments if any
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploadResult = await uploadFile(
          file,
          req.user._id.toString(),
          '', // sprintId not available here, can be added if needed
          'task'
        );
        if (uploadResult.success) {
          task.attachments.push({
            filename: uploadResult.fileName,
            originalName: file.originalname,
            url: uploadResult.fileUrl,
            size: file.size,
            mimeType: file.mimetype,
            uploadedBy: req.user._id,
            uploadedByModel: 'Startup'
          });
        }
      }
    }

    // Update other fields
    Object.assign(task, updates);

    await task.save();

    res.json({ success: true, data: { task } });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   DELETE /api/tasks/startup/:id
 * @desc    Delete a task (Startup)
 * @access  Private (Startup)
 */
router.delete('/startup/:id', async (req, res, next) => {
  try {
    const { authenticateStartup } = require('../middleware/auth');
    await authenticateStartup(req, res, () => {});

    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found.' });
    }

    // Update sprint task counts and progress
    try {
      const board = await Board.findById(task.boardId);
      if (board && board.sprintId) {
        const Sprint = require('../models/Sprint');
        const TaskModel = require('../models/Task');
        const sprint = await Sprint.findById(board.sprintId);
        if (sprint) {
          const allTasks = await TaskModel.find({ boardId: task.boardId });
          const totalTasks = allTasks.length;
          const doneTasks = allTasks.filter(t => t.status === "done").length;
          sprint.totalTasks = totalTasks;
          sprint.doneTasks = doneTasks;
          sprint.progress = sprint.progress || {};
          sprint.progress.percentage = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 100;
          await sprint.save();
        }
      }
    } catch (progressErr) {
      logger.logError("Failed to update sprint task counts after task deletion", progressErr);
    }

    res.json({ success: true, message: 'Task deleted successfully.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
