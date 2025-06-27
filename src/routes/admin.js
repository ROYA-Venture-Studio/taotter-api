const express = require('express');
const Admin = require('../models/Admin');
const Startup = require('../models/Startup');
const Questionnaire = require('../models/Questionnaire');
const Sprint = require('../models/Sprint');
const Board = require('../models/Board');
const Task = require('../models/Task');
const { authenticateAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

// GET /api/admin/dashboard - Get admin dashboard data
router.get('/dashboard', authenticateAdmin, async (req, res, next) => {
  try {
    // Get basic stats for dashboard
    const totalStartups = await Startup.countDocuments();
    const totalQuestionnaires = await Questionnaire.countDocuments();
    const totalSprints = await Sprint.countDocuments();
    const activeAdmins = await Admin.countDocuments({ status: 'active' });

    // Get recent activity
    const recentQuestionnaires = await Questionnaire.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('startupId', 'profile.companyName')
      .select('basicInfo status createdAt');

    const recentSprints = await Sprint.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('questionnaireId', 'basicInfo startupId')
      .select('name status createdAt');

    res.json({
      success: true,
      data: {
        stats: {
          totalStartups,
          totalQuestionnaires,
          totalSprints,
          activeAdmins
        },
        recentActivity: {
          questionnaires: recentQuestionnaires,
          sprints: recentSprints
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/users - List all admin users (for assignment dropdown)
router.get('/users', authenticateAdmin, async (req, res, next) => {
  try {
    const admins = await Admin.find({}, 'email profile role status createdAt updatedAt');
    res.json({
      success: true,
      data: {
        users: admins.map(admin => ({
          _id: admin._id,
          email: admin.email,
          profile: admin.profile,
          role: admin.role,
          status: admin.status,
          createdAt: admin.createdAt,
          updatedAt: admin.updatedAt
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/admin/startups - List all startups with sprint counts
router.get('/startups', authenticateAdmin, async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      sprintCountFilter = '', 
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;

    const query = {};
    
    // Search by startup name
    if (search) {
      query['profile.companyName'] = { $regex: search, $options: 'i' };
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get startups with basic info
    const startups = await Startup.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('email profile status createdAt updatedAt');

    const total = await Startup.countDocuments(query);

    // Get sprint counts for each startup
    const startupsWithSprintCounts = await Promise.all(
      startups.map(async (startup) => {
        // Get questionnaires for this startup
        const questionnaires = await Questionnaire.find({ startupId: startup._id }).select('_id');
        const questionnaireIds = questionnaires.map(q => q._id);

        // Count sprints for these questionnaires
        const sprintCount = await Sprint.countDocuments({
          questionnaireId: { $in: questionnaireIds }
        });

        return {
          _id: startup._id,
          companyName: startup.profile?.companyName || 'Unknown Company',
          founderName: `${startup.profile?.founderFirstName || ''} ${startup.profile?.founderLastName || ''}`.trim() || 'Unknown Founder',
          email: startup.email,
          status: startup.status || 'active',
          sprintCount,
          dateJoined: startup.createdAt,
          lastUpdated: startup.updatedAt
        };
      })
    );

    // Apply sprint count filter
    let filteredStartups = startupsWithSprintCounts;
    if (sprintCountFilter) {
      switch (sprintCountFilter) {
        case '0':
          filteredStartups = startupsWithSprintCounts.filter(s => s.sprintCount === 0);
          break;
        case '1-3':
          filteredStartups = startupsWithSprintCounts.filter(s => s.sprintCount >= 1 && s.sprintCount <= 3);
          break;
        case '4-10':
          filteredStartups = startupsWithSprintCounts.filter(s => s.sprintCount >= 4 && s.sprintCount <= 10);
          break;
        case '10+':
          filteredStartups = startupsWithSprintCounts.filter(s => s.sprintCount > 10);
          break;
      }
    }

    res.json({
      success: true,
      data: {
        startups: filteredStartups,
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

// GET /api/admin/startups/:id/sprints - Get all sprints for a specific startup
router.get('/startups/:id/sprints', authenticateAdmin, async (req, res, next) => {
  try {
    const { id: startupId } = req.params;
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // Verify startup exists
    const startup = await Startup.findById(startupId).select('profile email');
    if (!startup) {
      return next(new AppError('Startup not found', 404, 'STARTUP_NOT_FOUND'));
    }

    // Get questionnaires for this startup
    const questionnaires = await Questionnaire.find({ startupId }).select('_id basicInfo');
    const questionnaireIds = questionnaires.map(q => q._id);

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get sprints for these questionnaires
    const sprints = await Sprint.find({
      questionnaireId: { $in: questionnaireIds }
    })
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('questionnaireId', 'basicInfo')
      .populate('createdBy', 'profile.firstName profile.lastName')
      .select('name type status selectedPackage createdAt');

    const total = await Sprint.countDocuments({
      questionnaireId: { $in: questionnaireIds }
    });

    // Calculate real progress for each sprint based on board tasks
    const sprintsWithProgress = await Promise.all(
      sprints.map(async (sprint) => {
        // Find the board for this sprint
        const board = await Board.findOne({ sprintId: sprint._id }).select('_id columns');
        
        let progress = 0;
        if (board && board.columns) {
          // Get all tasks for this board
          const totalTasks = await Task.countDocuments({ 
            boardId: board._id, 
            isArchived: false 
          });
          
          if (totalTasks > 0) {
            // Find completed columns (assuming columns with names like "Done", "Completed", "Complete")
            const completedColumns = board.columns.filter(col => 
              /^(done|completed?|finished?)$/i.test(col.name.trim()) || 
              col.isCompleted === true
            );
            
            if (completedColumns.length > 0) {
              const completedColumnIds = completedColumns.map(col => col._id);
              
              // Count tasks in completed columns
              const completedTasks = await Task.countDocuments({
                boardId: board._id,
                columnId: { $in: completedColumnIds },
                isArchived: false
              });
              
              progress = Math.round((completedTasks / totalTasks) * 100);
            }
          }
        }

        return {
          _id: sprint._id,
          name: sprint.name,
          type: sprint.type,
          status: sprint.status,
          progress: progress,
          hasSelectedPackage: !!sprint.selectedPackage,
          packageName: sprint.selectedPackage?.name || null,
          createdAt: sprint.createdAt,
          createdBy: sprint.createdBy,
          questionnaire: sprint.questionnaireId?.basicInfo || null,
          boardId: board?._id || null
        };
      })
    );

    res.json({
      success: true,
      data: {
        startup: {
          _id: startup._id,
          companyName: startup.profile?.companyName || 'Unknown Company',
          founderName: `${startup.profile?.founderFirstName || ''} ${startup.profile?.founderLastName || ''}`.trim(),
          email: startup.email
        },
        sprints: sprintsWithProgress,
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

module.exports = router;
