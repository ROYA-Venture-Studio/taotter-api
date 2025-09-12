const express = require('express');
const Questionnaire = require('../models/Questionnaire');
const Startup = require('../models/Startup');
const { AppError } = require('../middleware/errorHandler');
const { authenticateStartup, authenticateAdmin } = require('../middleware/auth');
const { validate, questionnaireSchemas } = require('../utils/validation');
const logger = require('../utils/logger');
const { sendEmail } = require('../utils/communications');

const router = express.Router();

// @route   POST /api/questionnaires
// @desc    Submit questionnaire (Startup)
// @access  Private (Startup)
const { v4: uuidv4 } = require('uuid');

router.post('/',
  validate(questionnaireSchemas.create), async (req, res, next) => {
  try {
    const { basicInfo, requirements, serviceSelection } = req.body;

    // Generate a temporaryId for anonymous submission
    const temporaryId = uuidv4();

    // Create questionnaire with temporaryId (and startupId if provided)
    const questionnaire = new Questionnaire({
      temporaryId,
      basicInfo,
      requirements,
      serviceSelection,
      status: 'submitted',
      submittedAt: new Date(),
      metadata: {
        submissionIP: req.ip,
        userAgent: req.headers['user-agent']
      },
      startupId: req.body.startupId || undefined
    });

    await questionnaire.save();

    // Optionally: log info for admin notification
    // logger.logInfo(`New anonymous questionnaire submitted`, {
    //   questionnaireId: questionnaire._id,
    //   startupName: basicInfo.startupName,
    //   taskType: basicInfo.taskType,
    //   temporaryId
    // });

    res.status(201).json({
      success: true,
      message: 'Questionnaire submitted successfully. Please sign up to continue.',
      data: {
        questionnaire: {
          id: questionnaire._id,
          status: questionnaire.status,
          submittedAt: questionnaire.submittedAt,
          trackingId: questionnaire._id.toString().slice(-8).toUpperCase(),
          temporaryId
        }
      }
    });

  } catch (error) {
    logger.logError('Questionnaire submission failed', error);
    next(error);
  }
});

// @route   GET /api/questionnaires
// @desc    Get startup's questionnaires
// @access  Private (Startup)
router.get('/', authenticateStartup, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    const query = { startupId: req.user._id };
    if (status) {
      query.status = status;
    }
    
    const questionnaires = await Questionnaire.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Questionnaire.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        questionnaires: questionnaires.map(q => ({
          id: q._id,
          basicInfo: q.basicInfo,
          requirements: q.requirements,
          serviceSelection: q.serviceSelection,
          status: q.status,
          submittedAt: q.submittedAt,
          reviewedAt: q.review?.reviewedAt,
          reviewedBy: q.review?.reviewedBy,
          rejectionReason: q.review?.rejectionReason,
          trackingId: q._id.toString().slice(-8).toUpperCase()
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

// @route   GET /api/questionnaires/:id
// @desc    Get specific questionnaire
// @access  Private (Startup)
router.get('/:id', authenticateStartup, async (req, res, next) => {
  try {
    const questionnaire = await Questionnaire.findOne({
      _id: req.params.id,
      startupId: req.user._id
    });
    
    if (!questionnaire) {
      return next(new AppError('Questionnaire not found', 404, 'QUESTIONNAIRE_NOT_FOUND'));
    }
    
    res.json({
      success: true,
      data: {
        questionnaire: {
          id: questionnaire._id,
          basicInfo: questionnaire.basicInfo,
          requirements: questionnaire.requirements,
          serviceSelection: questionnaire.serviceSelection,
          status: questionnaire.status,
          submittedAt: questionnaire.submittedAt,
          reviewedAt: questionnaire.review?.reviewedAt,
          reviewedBy: questionnaire.review?.reviewedBy,
          adminNotes: questionnaire.review?.adminNotes,
          rejectionReason: questionnaire.review?.rejectionReason,
          trackingId: questionnaire._id.toString().slice(-8).toUpperCase()
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/questionnaires/:id
// @desc    Update questionnaire (only if status is draft or needs_clarification)
// @access  Private (Startup)
router.put('/:id', authenticateStartup, validate(questionnaireSchemas.create), async (req, res, next) => {
  try {
    const questionnaire = await Questionnaire.findOne({
      _id: req.params.id,
      startupId: req.user._id
    });
    
    if (!questionnaire) {
      return next(new AppError('Questionnaire not found', 404, 'QUESTIONNAIRE_NOT_FOUND'));
    }
    
    if (!['draft', 'needs_clarification'].includes(questionnaire.status)) {
      return next(new AppError('Cannot update questionnaire in current status', 400, 'QUESTIONNAIRE_NOT_EDITABLE'));
    }
    
    const { basicInfo, requirements, serviceSelection } = req.body;
    
    questionnaire.basicInfo = basicInfo;
    questionnaire.requirements = requirements;
    questionnaire.serviceSelection = serviceSelection;
    questionnaire.status = 'submitted';
    questionnaire.submittedAt = new Date();
    questionnaire.lastModified = new Date();
    
    await questionnaire.save();
    
    res.json({
      success: true,
      message: 'Questionnaire updated and resubmitted successfully',
      data: {
        questionnaire: {
          id: questionnaire._id,
          status: questionnaire.status,
          submittedAt: questionnaire.submittedAt,
          trackingId: questionnaire._id.toString().slice(-8).toUpperCase()
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/questionnaires/admin/all
 * @desc    Get all questionnaires for admin (with search, filter, pagination)
 * @access  Private (Admin)
 */
router.get('/admin/all', authenticateAdmin, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      taskType,
      search,
      sortBy = 'submittedAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }
    if (taskType) {
      query['basicInfo.taskType'] = taskType;
    }

    // Search by startup name, founder name, or company name
    if (search) {
      query.$or = [
        { 'basicInfo.startupName': { $regex: search, $options: 'i' } },
        { 'startupId.profile.founderFirstName': { $regex: search, $options: 'i' } },
        { 'startupId.profile.founderLastName': { $regex: search, $options: 'i' } },
        { 'startupId.profile.companyName': { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Populate sprint for each questionnaire (using sprintId if present, else by matching questionnaire._id to sprint.questionnaireId)
    const Sprint = require('../models/Sprint');
    const questionnaires = await Questionnaire.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('startupId', 'email profile.founderFirstName profile.founderLastName profile.companyName profile.phone')
      .populate('sprintId');

    const total = await Questionnaire.countDocuments(query);

    // Get summary statistics
    const statusCounts = await Questionnaire.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // For questionnaires without sprintId, find all sprints by questionnaireId and pick the highest-priority one
    const sprintMap = {};
    const missingSprintQs = [];
    questionnaires.forEach(q => {
      if (!q.sprintId) missingSprintQs.push(q._id);
    });
    if (missingSprintQs.length > 0) {
      // Fetch all sprints for these questionnaires
      const sprints = await Sprint.find({ questionnaireId: { $in: missingSprintQs } });
      // Group sprints by questionnaireId
      const grouped = {};
      sprints.forEach(s => {
        const qid = s.questionnaireId.toString();
        if (!grouped[qid]) grouped[qid] = [];
        grouped[qid].push(s);
      });
      // Define status priority
      const statusPriority = [
        'paid',
        'package_selected',
        'documents_submitted',
        'in_progress',
        'available',
        'draft',
        'on_hold',
        'completed',
        'cancelled',
        'inactive'
      ];
      // Pick the highest-priority sprint for each questionnaire
      Object.entries(grouped).forEach(([qid, sprintsArr]) => {
        sprintsArr.sort((a, b) => {
          const aIdx = statusPriority.indexOf(a.status);
          const bIdx = statusPriority.indexOf(b.status);
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx);
        });
        sprintMap[qid] = sprintsArr[0];
      });
    }

    res.json({
      success: true,
      data: {
        questionnaires: questionnaires.map(q => {
          // Prefer populated sprintId, else fallback to sprintMap
          const sprint = q.sprintId || sprintMap[q._id.toString()];
          return {
            id: q._id,
            startup: {
              id: q.startupId?._id,
              name: q.startupId
                ? q.startupId.profile.founderFirstName + ' ' + q.startupId.profile.founderLastName
                : '',
              email: q.startupId?.email,
              company: q.startupId?.profile?.companyName,
              phone: q.startupId?.profile?.phone
            },
            basicInfo: q.basicInfo,
            requirements: q.requirements,
            serviceSelection: q.serviceSelection,
            status: q.status,
            submittedAt: q.submittedAt,
            reviewedAt: q.reviewedAt,
            trackingId: q._id.toString().slice(-8).toUpperCase(),
            priorityScore: q.priorityScore,
            sprint: sprint
              ? {
                  id: sprint._id,
                  status: sprint.status,
                  selectedPackage: sprint.selectedPackage,
                  selectedPackagePaymentStatus: sprint.selectedPackagePaymentStatus
                }
              : null
          };
        }),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          limit: parseInt(limit)
        },
        summary: {
          statusCounts: statusCounts.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          total: total
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/questionnaires/admin/:id
 * @desc    Get questionnaire detail for admin by id
 * @access  Private (Admin)
 */
router.get('/admin/:id', authenticateAdmin, async (req, res, next) => {
  try {
    const questionnaire = await Questionnaire.findById(req.params.id)
      .populate('startupId', 'profile.founderFirstName profile.founderLastName profile.companyName email');
    if (!questionnaire) {
      return res.status(404).json({ success: false, message: 'Questionnaire not found' });
    }
    res.json({
      success: true,
      data: {
        questionnaire
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/questionnaires/:id/create-sprint
 * @desc    Admin creates sprints for a questionnaire and moves startup to sprint_selection
 * @access  Private (Admin)
 */
const Sprint = require('../models/Sprint');
router.post('/admin/:id/create-sprint', authenticateAdmin, async (req, res, next) => {
  try {
    const questionnaireId = req.params.id;
    const { sprints } = req.body; // Array of sprints, each with packageOptions (credit tiers)
    if (!Array.isArray(sprints) || sprints.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one sprint is required.' });
    }

    // Find questionnaire and startup
    const questionnaire = await Questionnaire.findById(questionnaireId).populate('startupId');
    if (!questionnaire) {
      return res.status(404).json({ success: false, message: 'Questionnaire not found.' });
    }
    if (!questionnaire.startupId) {
      return res.status(400).json({ success: false, message: 'Questionnaire is not linked to a startup.' });
    }

    // Create sprints
    const createdSprints = [];
    for (const sprintData of sprints) {
      // Validate required fields
      const requiredFields = ['name', 'description', 'type', 'estimatedDuration', 'packageOptions'];
      for (const field of requiredFields) {
        if (!sprintData[field]) {
          return res.status(400).json({ success: false, message: `Sprint field "${field}" is required.` });
        }
      }
      // if (!Array.isArray(sprintData.packageOptions) || sprintData.packageOptions.length !== 3) {
      //   return res.status(400).json({ success: false, message: 'All 3 credit tiers (packageOptions) are required.' });
      // }

      const sprint = new Sprint({
        questionnaireId: questionnaire._id,
        name: sprintData.name,
        description: sprintData.description,
        type: sprintData.type,
        status: 'available',
        estimatedDuration: sprintData.estimatedDuration,
        packageOptions: sprintData.packageOptions,
        deliverables: sprintData.deliverables || [],
        createdBy: req.user._id,
        priority: sprintData.priority || 'medium'
      });
      await sprint.save();
      createdSprints.push(sprint);
    }

    // Update questionnaire status and startup onboarding step
    questionnaire.status = 'proposal_created';
    await questionnaire.save();

    await Startup.findByIdAndUpdate(
      questionnaire.startupId._id,
      { 'onboarding.currentStep': 'sprint_selection' }
    );

    // Send sprint assignment email to startup
    try {
      await sendEmail({
        to: questionnaire.startupId.email,
        template: 'sprintAssigned',
        data: {
          name: `${questionnaire.startupId.profile.founderFirstName} ${questionnaire.startupId.profile.founderLastName}`,
          dashboardUrl: process.env.FRONTEND_URL + '/dashboard'
        }
      });
    } catch (emailError) {
      logger.logError('Sprint assignment email failed', emailError, { email: questionnaire.startupId.email });
    }

    res.json({
      success: true,
      message: 'Sprints created and startup moved to sprint selection.',
      data: { sprints: createdSprints }
    });
  } catch (error) {
    next(error);
  }
});

// ==================== ADMIN ROUTES ====================

// @route   GET /api/questionnaires/admin/pending
// @desc    Get pending questionnaires for review (Admin)
// @access  Private (Admin)
router.get('/admin/pending', authenticateAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, taskType, sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    } else {
      // Default to questionnaires that need review
      query.status = { $in: ['submitted', 'under_review', 'needs_clarification'] };
    }
    
    if (taskType) {
      query['basicInfo.taskType'] = taskType;
    }
    
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const questionnaires = await Questionnaire.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('startupId', 'email profile.founderFirstName profile.founderLastName profile.companyName profile.phone')
      .populate('reviewedBy', 'profile.firstName profile.lastName email');
    
    const total = await Questionnaire.countDocuments(query);
    
    // Get summary statistics
    const statusCounts = await Questionnaire.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    res.json({
      success: true,
      data: {
        questionnaires: questionnaires.map(q => ({
          id: q._id,
          startup: {
            id: q.startupId._id,
            name: q.startupId.profile.founderFirstName + ' ' + q.startupId.profile.founderLastName,
            email: q.startupId.email,
            company: q.startupId.profile.companyName,
            phone: q.startupId.profile.phone
          },
          basicInfo: q.basicInfo,
          requirements: q.requirements,
          serviceSelection: q.serviceSelection,
          status: q.status,
          submittedAt: q.submittedAt,
          reviewedAt: q.reviewedAt,
          reviewedBy: q.reviewedBy,
          trackingId: q._id.toString().slice(-8).toUpperCase(),
          priorityScore: q.priorityScore
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          limit: parseInt(limit)
        },
        summary: {
          statusCounts: statusCounts.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          totalPending: total
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/questionnaires/:id/review
// @desc    Review questionnaire (Admin)
// @access  Private (Admin)
router.post('/:id/review', authenticateAdmin, validate(questionnaireSchemas.review), async (req, res, next) => {
  try {
    const { status, adminNotes, rejectionReason } = req.body;
    
    const questionnaire = await Questionnaire.findById(req.params.id)
      .populate('startupId', 'email profile.founderFirstName profile.founderLastName profile.companyName');
    
    if (!questionnaire) {
      return next(new AppError('Questionnaire not found', 404, 'QUESTIONNAIRE_NOT_FOUND'));
    }
    
    if (!['submitted', 'under_review', 'needs_clarification'].includes(questionnaire.status)) {
      return next(new AppError('Questionnaire cannot be reviewed in current status', 400, 'QUESTIONNAIRE_NOT_REVIEWABLE'));
    }
    
    // Validate rejection reason if status is rejected
    if (status === 'rejected' && !rejectionReason) {
      return next(new AppError('Rejection reason is required when rejecting a questionnaire', 400, 'REJECTION_REASON_REQUIRED'));
    }
    
    // Update questionnaire
    questionnaire.status = status;
    questionnaire.reviewedBy = req.user._id;
    questionnaire.reviewedAt = new Date();
    questionnaire.adminNotes = adminNotes;
    
    if (status === 'rejected') {
      questionnaire.rejectionReason = rejectionReason;
    }
    
    // Calculate priority score if approved
    if (status === 'approved') {
      questionnaire.priorityScore = calculatePriorityScore(questionnaire);
    }
    
    await questionnaire.save();
    
    // Update startup status based on review result
    const startupUpdate = {
      'onboarding.lastUpdated': new Date()
    };
    
    if (status === 'approved') {
      startupUpdate['onboarding.currentStep'] = 'sprint_selection';
      startupUpdate['onboarding.questionnaireApproved'] = true;
    } else if (status === 'rejected') {
      startupUpdate['onboarding.currentStep'] = 'questionnaire';
      startupUpdate['onboarding.questionnaireApproved'] = false;
    }
    
    await Startup.findByIdAndUpdate(questionnaire.startupId._id, startupUpdate);
    
    // Send notification email to startup
    try {
      const emailTemplate = status === 'approved' ? 'questionnaire-approved' : 
                           status === 'rejected' ? 'questionnaire-rejected' : 
                           'questionnaire-clarification';
      
      await sendEmail({
        to: questionnaire.startupId.email,
        subject: `Questionnaire ${status.charAt(0).toUpperCase() + status.slice(1)} - ${questionnaire.basicInfo.startupName}`,
        template: emailTemplate,
        data: {
          startupName: questionnaire.startupId.profile.founderFirstName,
          projectName: questionnaire.basicInfo.startupName,
          adminNotes: adminNotes,
          rejectionReason: rejectionReason,
          trackingId: questionnaire._id.toString().slice(-8).toUpperCase(),
          reviewerName: req.user.profile.firstName + ' ' + req.user.profile.lastName
        }
      });
    } catch (emailError) {
      logger.logError('Questionnaire review notification email failed', emailError);
      // Don't fail the request if email fails
    }
    
    // Log the review action
    logger.logInfo(`Questionnaire ${status} by admin ${req.user._id}`, {
      questionnaireId: questionnaire._id,
      startupId: questionnaire.startupId._id,
      adminId: req.user._id,
      status: status
    });
    
    res.json({
      success: true,
      message: `Questionnaire ${status} successfully`,
      data: {
        questionnaire: {
          id: questionnaire._id,
          status: questionnaire.status,
          reviewedAt: questionnaire.reviewedAt,
          reviewedBy: {
            id: req.user._id,
            name: req.user.profile.firstName + ' ' + req.user.profile.lastName
          },
          priorityScore: questionnaire.priorityScore
        }
      }
    });
    
  } catch (error) {
    logger.logError('Questionnaire review failed', error);
    next(error);
  }
});

// @route   GET /api/questionnaires/admin/analytics
// @desc    Get questionnaire analytics (Admin)
// @access  Private (Admin)
/*
router.get('/admin/analytics', authenticateAdmin, async (req, res, next) => {
  try {
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
    
    // Get analytics data
    const [
      totalQuestionnaires,
      statusDistribution,
      taskTypeDistribution,
      submissionTrend,
      averageReviewTime
    ] = await Promise.all([
      // Total questionnaires in date range
      Questionnaire.countDocuments({
        submittedAt: { $gte: startDate, $lte: endDate }
      }),
      
      // Status distribution
      Questionnaire.aggregate([
        { $match: { submittedAt: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      // Task type distribution
      Questionnaire.aggregate([
        { $match: { submittedAt: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: '$basicInfo.taskType', count: { $sum: 1 } } }
      ]),
      
      // Submission trend by day
      Questionnaire.aggregate([
        { $match: { submittedAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Average review time
      Questionnaire.aggregate([
        {
          $match: {
            submittedAt: { $gte: startDate, $lte: endDate },
            reviewedAt: { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            avgReviewTime: {
              $avg: { $subtract: ['$reviewedAt', '$submittedAt'] }
            }
          }
        }
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalQuestionnaires,
          dateRange: {
            start: startDate,
            end: endDate
          }
        },
        statusDistribution: statusDistribution.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        taskTypeDistribution: taskTypeDistribution.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        submissionTrend: submissionTrend.map(item => ({
          date: item._id,
          count: item.count
        })),
        averageReviewTime: averageReviewTime[0] ? Math.round(averageReviewTime[0].avgReviewTime / (1000 * 60 * 60)) : 0 // Convert to hours
      }
    });
    
  } catch (error) {
    next(error);
  }
});
*/

// @route   POST /api/questionnaires/link
// @desc    Link anonymous questionnaire to startup after registration
// @access  Private (Startup)
router.post('/link', authenticateStartup, async (req, res, next) => {
  try {
    const { temporaryId } = req.body;
    if (!temporaryId) {
      return next(new AppError('Temporary ID is required', 400, 'TEMP_ID_REQUIRED'));
    }

    // Find the questionnaire by temporaryId
    const questionnaire = await Questionnaire.findOne({ temporaryId });
    if (!questionnaire) {
      return next(new AppError('Questionnaire not found for this temporary ID', 404, 'QUESTIONNAIRE_NOT_FOUND'));
    }

    // Link to the current startup and remove temporaryId
    questionnaire.startupId = req.user._id;
    questionnaire.temporaryId = undefined;
    await questionnaire.save();

    // Set onboarding.currentStep to 'pending_review' for the startup
    await Startup.findByIdAndUpdate(
      req.user._id,
      { 'onboarding.currentStep': 'pending_review' }
    );

    res.json({
      success: true,
      message: 'Questionnaire linked to your account successfully',
      data: {
        questionnaire: {
          id: questionnaire._id,
          status: questionnaire.status,
          submittedAt: questionnaire.submittedAt,
          trackingId: questionnaire._id.toString().slice(-8).toUpperCase()
        }
      }
    });
  } catch (error) {
    logger.logError('Questionnaire linking failed', error);
    next(error);
  }
});

// Helper function to calculate priority score
function calculatePriorityScore(questionnaire) {
  let score = 0;
  
  // Task type weights
  const taskTypeWeights = {
    'mvp-development': 10,
    'validation': 8,
    'fundraising': 9,
    'branding': 6,
    'marketing': 7,
    'other': 5
  };
  
  // Budget range weights
  const budgetWeights = {
    '< $5,000': 3,
    '$5,000 - $10,000': 5,
    '$10,000 - $25,000': 7,
    '$25,000 - $50,000': 9,
    '$50,000+': 10
  };
  
  // Timeline urgency weights
  const timelineWeights = {
    '1-2 weeks': 10,
    '3-4 weeks': 8,
    '1-2 months': 6,
    '3-6 months': 4,
    '6+ months': 2
  };
  
  score += taskTypeWeights[questionnaire.basicInfo.taskType] || 5;
  score += budgetWeights[questionnaire.requirements.budgetRange] || 5;
  score += timelineWeights[questionnaire.requirements.timeline] || 5;
  
  // Full-time commitment bonus
  if (questionnaire.basicInfo.timeCommitment === 'full-time') {
    score += 5;
  }
  
  return Math.min(score, 100); // Cap at 100
}

/**
 * @route   POST /api/questionnaires/:id/upload-file
 * @desc    Upload a file for a questionnaire (e.g. brand guidelines during sprint onboarding)
 * @access  Private (Startup)
 */
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // For now, store locally

router.post('/:id/upload-file', authenticateStartup, upload.single('file'), async (req, res, next) => {
  try {
    const questionnaire = await Questionnaire.findOne({
      _id: req.params.id,
      startupId: req.user._id
    });
    if (!questionnaire) {
      return res.status(404).json({ success: false, message: 'Questionnaire not found' });
    }

    // Simulate AWS S3 upload: generate a dummy URL for now
    const fileUrl = req.file
      ? `https://dummy-s3-bucket.s3.amazonaws.com/${req.file.filename}`
      : 'https://dummy-s3-bucket.s3.amazonaws.com/brand-guidelines.pdf';

    // Add to uploadedFiles array (create if not present)
    if (!Array.isArray(questionnaire.uploadedFiles)) {
      questionnaire.uploadedFiles = [];
    }
    questionnaire.uploadedFiles.push({
      url: fileUrl,
      originalName: req.file ? req.file.originalname : 'brand-guidelines.pdf',
      uploadedAt: new Date(),
      uploadedBy: req.user._id
    });

    await questionnaire.save();

    res.json({
      success: true,
      message: 'File uploaded and linked to questionnaire',
      data: {
        file: {
          url: fileUrl,
          originalName: req.file ? req.file.originalname : 'brand-guidelines.pdf'
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/questionnaires/:id/schedule-meeting
 * @desc    Mark questionnaire as meeting scheduled (Startup)
 * @access  Private (Startup)
 */
router.post('/:id/schedule-meeting', authenticateStartup, async (req, res, next) => {
  try {
    const questionnaire = await Questionnaire.findOne({
      _id: req.params.id,
      startupId: req.user._id
    });
    if (!questionnaire) {
      return res.status(404).json({ success: false, message: 'Questionnaire not found' });
    }
    // Only allow if not already scheduled or sprint created
    if (questionnaire.status === 'meeting_scheduled' || questionnaire.status === 'proposal_created') {
      return res.status(400).json({ success: false, message: 'Meeting already scheduled or proposal already created.' });
    }
    questionnaire.status = 'meeting_scheduled';
    await questionnaire.save();
    res.json({
      success: true,
      message: 'Meeting scheduled successfully.',
      data: {
        questionnaire: {
          id: questionnaire._id,
          status: questionnaire.status,
          submittedAt: questionnaire.submittedAt,
          trackingId: questionnaire._id.toString().slice(-8).toUpperCase()
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/questionnaires/admin/:id/with-sprint
 * @desc    Get questionnaire with associated sprint (Admin)
 * @access  Private (Admin)
 */
router.get('/admin/:id/with-sprint', authenticateAdmin, async (req, res, next) => {
  try {
    const questionnaire = await Questionnaire.findById(req.params.id)
      .populate('startupId', 'profile.founderFirstName profile.founderLastName profile.companyName email');
    if (!questionnaire) {
      return res.status(404).json({ success: false, message: 'Questionnaire not found' });
    }
    const Sprint = require('../models/Sprint');
    const sprint = await Sprint.findOne({ questionnaireId: questionnaire._id });
    res.json({
      success: true,
      data: {
        questionnaire,
        sprint
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
/**
 * @route   GET /api/questionnaires/admin/all
 * @desc    Get all questionnaires for admin (with search, filter, pagination)
 * @access  Private (Admin)
 */
router.get('/admin/all', authenticateAdmin, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      taskType,
      search,
      sortBy = 'submittedAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};

    if (status) {
      query.status = status;
    }
    if (taskType) {
      query['basicInfo.taskType'] = taskType;
    }

    // Search by startup name, founder name, or company name
    if (search) {
      query.$or = [
        { 'basicInfo.startupName': { $regex: search, $options: 'i' } },
        { 'startupId.profile.founderFirstName': { $regex: search, $options: 'i' } },
        { 'startupId.profile.founderLastName': { $regex: search, $options: 'i' } },
        { 'startupId.profile.companyName': { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const questionnaires = await Questionnaire.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('startupId', 'email profile.founderFirstName profile.founderLastName profile.companyName profile.phone');

    const total = await Questionnaire.countDocuments(query);

    // Get summary statistics
    const statusCounts = await Questionnaire.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        questionnaires: questionnaires.map(q => ({
          id: q._id,
          startup: {
            id: q.startupId?._id,
            name: q.startupId
              ? q.startupId.profile.founderFirstName + ' ' + q.startupId.profile.founderLastName
              : '',
            email: q.startupId?.email,
            company: q.startupId?.profile?.companyName,
            phone: q.startupId?.profile?.phone
          },
          basicInfo: q.basicInfo,
          requirements: q.requirements,
          serviceSelection: q.serviceSelection,
          status: q.status,
          submittedAt: q.submittedAt,
          reviewedAt: q.reviewedAt,
          // reviewedBy removed
          trackingId: q._id.toString().slice(-8).toUpperCase(),
          priorityScore: q.priorityScore
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          limit: parseInt(limit)
        },
        summary: {
          statusCounts: statusCounts.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          total: total
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/questionnaires/admin/pending
// @desc    Get pending questionnaires for review (Admin)
// @access  Private (Admin)
router.get('/admin/pending', authenticateAdmin, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, taskType, sortBy = 'submittedAt', sortOrder = 'desc' } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    } else {
      // Default to questionnaires that need review
      query.status = { $in: ['submitted', 'under_review', 'needs_clarification'] };
    }
    
    if (taskType) {
      query['basicInfo.taskType'] = taskType;
    }
    
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const questionnaires = await Questionnaire.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('startupId', 'email profile.founderFirstName profile.founderLastName profile.companyName profile.phone')
      .populate('reviewedBy', 'profile.firstName profile.lastName email');
    
    const total = await Questionnaire.countDocuments(query);
    
    // Get summary statistics
    const statusCounts = await Questionnaire.aggregate([
      { $match: query },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    res.json({
      success: true,
      data: {
        questionnaires: questionnaires.map(q => ({
          id: q._id,
          startup: {
            id: q.startupId._id,
            name: q.startupId.profile.founderFirstName + ' ' + q.startupId.profile.founderLastName,
            email: q.startupId.email,
            company: q.startupId.profile.companyName,
            phone: q.startupId.profile.phone
          },
          basicInfo: q.basicInfo,
          requirements: q.requirements,
          serviceSelection: q.serviceSelection,
          status: q.status,
          submittedAt: q.submittedAt,
          reviewedAt: q.reviewedAt,
          reviewedBy: q.reviewedBy,
          adminNotes: q.adminNotes,
          trackingId: q._id.toString().slice(-8).toUpperCase(),
          priorityScore: q.priorityScore
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          limit: parseInt(limit)
        },
        summary: {
          statusCounts: statusCounts.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          totalPending: total
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/questionnaires/:id/review
// @desc    Review questionnaire (Admin)
// @access  Private (Admin)
router.post('/:id/review', authenticateAdmin, validate(questionnaireSchemas.review), async (req, res, next) => {
  try {
    const { status, adminNotes, rejectionReason } = req.body;
    
    const questionnaire = await Questionnaire.findById(req.params.id)
      .populate('startupId', 'email profile.founderFirstName profile.founderLastName profile.companyName');
    
    if (!questionnaire) {
      return next(new AppError('Questionnaire not found', 404, 'QUESTIONNAIRE_NOT_FOUND'));
    }
    
    if (!['submitted', 'under_review', 'needs_clarification'].includes(questionnaire.status)) {
      return next(new AppError('Questionnaire cannot be reviewed in current status', 400, 'QUESTIONNAIRE_NOT_REVIEWABLE'));
    }
    
    // Validate rejection reason if status is rejected
    if (status === 'rejected' && !rejectionReason) {
      return next(new AppError('Rejection reason is required when rejecting a questionnaire', 400, 'REJECTION_REASON_REQUIRED'));
    }
    
    // Update questionnaire
    questionnaire.status = status;
    questionnaire.reviewedBy = req.user._id;
    questionnaire.reviewedAt = new Date();
    questionnaire.adminNotes = adminNotes;
    
    if (status === 'rejected') {
      questionnaire.rejectionReason = rejectionReason;
    }
    
    // Calculate priority score if approved
    if (status === 'approved') {
      questionnaire.priorityScore = calculatePriorityScore(questionnaire);
    }
    
    await questionnaire.save();
    
    // Update startup status based on review result
    const startupUpdate = {
      'onboarding.lastUpdated': new Date()
    };
    
    if (status === 'approved') {
      startupUpdate['onboarding.currentStep'] = 'sprint_selection';
      startupUpdate['onboarding.questionnaireApproved'] = true;
    } else if (status === 'rejected') {
      startupUpdate['onboarding.currentStep'] = 'questionnaire';
      startupUpdate['onboarding.questionnaireApproved'] = false;
    }
    
    await Startup.findByIdAndUpdate(questionnaire.startupId._id, startupUpdate);
    
    // Send notification email to startup
    try {
      const emailTemplate = status === 'approved' ? 'questionnaire-approved' : 
                           status === 'rejected' ? 'questionnaire-rejected' : 
                           'questionnaire-clarification';
      
      await sendEmail({
        to: questionnaire.startupId.email,
        subject: `Questionnaire ${status.charAt(0).toUpperCase() + status.slice(1)} - ${questionnaire.basicInfo.startupName}`,
        template: emailTemplate,
        data: {
          startupName: questionnaire.startupId.profile.founderFirstName,
          projectName: questionnaire.basicInfo.startupName,
          adminNotes: adminNotes,
          rejectionReason: rejectionReason,
          trackingId: questionnaire._id.toString().slice(-8).toUpperCase(),
          reviewerName: req.user.profile.firstName + ' ' + req.user.profile.lastName
        }
      });
    } catch (emailError) {
      logger.logError('Questionnaire review notification email failed', emailError);
      // Don't fail the request if email fails
    }
    
    // Log the review action
    logger.logInfo(`Questionnaire ${status} by admin ${req.user._id}`, {
      questionnaireId: questionnaire._id,
      startupId: questionnaire.startupId._id,
      adminId: req.user._id,
      status: status
    });
    
    res.json({
      success: true,
      message: `Questionnaire ${status} successfully`,
      data: {
        questionnaire: {
          id: questionnaire._id,
          status: questionnaire.status,
          reviewedAt: questionnaire.reviewedAt,
          reviewedBy: {
            id: req.user._id,
            name: req.user.profile.firstName + ' ' + req.user.profile.lastName
          },
          priorityScore: questionnaire.priorityScore
        }
      }
    });
    
  } catch (error) {
    logger.logError('Questionnaire review failed', error);
    next(error);
  }
});

// @route   GET /api/questionnaires/admin/analytics
// @desc    Get questionnaire analytics (Admin)
// @access  Private (Admin)
router.get('/admin/analytics', authenticateAdmin, async (req, res, next) => {
  try {
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
    
    // Get analytics data
    const [
      totalQuestionnaires,
      statusDistribution,
      taskTypeDistribution,
      submissionTrend,
      averageReviewTime
    ] = await Promise.all([
      // Total questionnaires in date range
      Questionnaire.countDocuments({
        submittedAt: { $gte: startDate, $lte: endDate }
      }),
      
      // Status distribution
      Questionnaire.aggregate([
        { $match: { submittedAt: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      // Task type distribution
      Questionnaire.aggregate([
        { $match: { submittedAt: { $gte: startDate, $lte: endDate } } },
        { $group: { _id: '$basicInfo.taskType', count: { $sum: 1 } } }
      ]),
      
      // Submission trend by day
      Questionnaire.aggregate([
        { $match: { submittedAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Average review time
      Questionnaire.aggregate([
        {
          $match: {
            submittedAt: { $gte: startDate, $lte: endDate },
            reviewedAt: { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            avgReviewTime: {
              $avg: { $subtract: ['$reviewedAt', '$submittedAt'] }
            }
          }
        }
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalQuestionnaires,
          dateRange: {
            start: startDate,
            end: endDate
          }
        },
        statusDistribution: statusDistribution.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        taskTypeDistribution: taskTypeDistribution.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        submissionTrend: submissionTrend.map(item => ({
          date: item._id,
          count: item.count
        })),
        averageReviewTime: averageReviewTime[0] ? Math.round(averageReviewTime[0].avgReviewTime / (1000 * 60 * 60)) : 0 // Convert to hours
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/questionnaires/link
// @desc    Link anonymous questionnaire to startup after registration
// @access  Private (Startup)
router.post('/link', authenticateStartup, async (req, res, next) => {
  try {
    const { temporaryId } = req.body;
    if (!temporaryId) {
      return next(new AppError('Temporary ID is required', 400, 'TEMP_ID_REQUIRED'));
    }

    // Find the questionnaire by temporaryId
    const questionnaire = await Questionnaire.findOne({ temporaryId });
    if (!questionnaire) {
      return next(new AppError('Questionnaire not found for this temporary ID', 404, 'QUESTIONNAIRE_NOT_FOUND'));
    }

    // Link to the current startup and remove temporaryId
    questionnaire.startupId = req.user._id;
    questionnaire.temporaryId = undefined;
    await questionnaire.save();

    // Set onboarding.currentStep to 'pending_review' for the startup
    await Startup.findByIdAndUpdate(
      req.user._id,
      { 'onboarding.currentStep': 'pending_review' }
    );

    res.json({
      success: true,
      message: 'Questionnaire linked to your account successfully',
      data: {
        questionnaire: {
          id: questionnaire._id,
          status: questionnaire.status,
          submittedAt: questionnaire.submittedAt,
          trackingId: questionnaire._id.toString().slice(-8).toUpperCase()
        }
      }
    });
  } catch (error) {
    logger.logError('Questionnaire linking failed', error);
    next(error);
  }
});

// Helper function to calculate priority score
function calculatePriorityScore(questionnaire) {
  let score = 0;
  
  // Task type weights
  const taskTypeWeights = {
    'mvp-development': 10,
    'validation': 8,
    'fundraising': 9,
    'branding': 6,
    'marketing': 7,
    'other': 5
  };
  
  // Budget range weights
  const budgetWeights = {
    '< $5,000': 3,
    '$5,000 - $10,000': 5,
    '$10,000 - $25,000': 7,
    '$25,000 - $50,000': 9,
    '$50,000+': 10
  };
  
  // Timeline urgency weights
  const timelineWeights = {
    '1-2 weeks': 10,
    '3-4 weeks': 8,
    '1-2 months': 6,
    '3-6 months': 4,
    '6+ months': 2
  };
  
  score += taskTypeWeights[questionnaire.basicInfo.taskType] || 5;
  score += budgetWeights[questionnaire.requirements.budgetRange] || 5;
  score += timelineWeights[questionnaire.requirements.timeline] || 5;
  
  // Full-time commitment bonus
  if (questionnaire.basicInfo.timeCommitment === 'full-time') {
    score += 5;
  }
  
  return Math.min(score, 100); // Cap at 100
}
