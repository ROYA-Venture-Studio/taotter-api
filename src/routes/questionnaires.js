const express = require('express');
const Questionnaire = require('../models/Questionnaire');
const Startup = require('../models/Startup');
const { AppError } = require('../middleware/errorHandler');
const { authenticateStartup, authenticateAdmin } = require('../middleware/auth');
const { validateInput } = require('../utils/validation');
const logger = require('../utils/logger');
const { sendEmail } = require('../utils/communications');

const router = express.Router();

// Validation schemas
const submitQuestionnaireSchema = {
  basicInfo: {
    required: true,
    type: 'object',
    properties: {
      startupName: {
        required: true,
        type: 'string',
        minLength: 2,
        maxLength: 100,
        message: 'Startup name is required (2-100 characters)'
      },
      taskType: {
        required: true,
        type: 'string',
        enum: ['mvp-development', 'validation', 'branding', 'marketing', 'fundraising', 'other'],
        message: 'Valid task type is required'
      },
      taskDescription: {
        required: true,
        type: 'string',
        minLength: 10,
        maxLength: 2000,
        message: 'Task description is required (10-2000 characters)'
      },
      startupStage: {
        required: true,
        type: 'string',
        enum: ['idea', 'prototype', 'mvp', 'early-stage', 'growth', 'scaling'],
        message: 'Valid startup stage is required'
      },
      keyGoals: {
        required: true,
        type: 'string',
        minLength: 10,
        maxLength: 1000,
        message: 'Key goals are required (10-1000 characters)'
      },
      timeCommitment: {
        required: true,
        type: 'string',
        enum: ['full-time', 'part-time'],
        message: 'Time commitment is required'
      }
    }
  },
  requirements: {
    required: true,
    type: 'object',
    properties: {
      milestones: {
        required: true,
        type: 'array',
        minItems: 1,
        message: 'At least one milestone is required'
      },
      timeline: {
        required: true,
        type: 'string',
        enum: ['1-2 weeks', '3-4 weeks', '1-2 months', '3-6 months', '6+ months'],
        message: 'Valid timeline is required'
      },
      budgetRange: {
        required: true,
        type: 'string',
        enum: ['< $5,000', '$5,000 - $10,000', '$10,000 - $25,000', '$25,000 - $50,000', '$50,000+'],
        message: 'Valid budget range is required'
      }
    }
  },
  serviceSelection: {
    required: true,
    type: 'object',
    properties: {
      isCustom: {
        required: true,
        type: 'boolean',
        message: 'Service selection type is required'
      }
    }
  }
};

const reviewQuestionnaireSchema = {
  status: {
    required: true,
    type: 'string',
    enum: ['approved', 'rejected', 'needs_clarification'],
    message: 'Valid status is required'
  },
  adminNotes: {
    required: false,
    type: 'string',
    maxLength: 2000,
    message: 'Admin notes cannot exceed 2000 characters'
  },
  rejectionReason: {
    required: false,
    type: 'string',
    maxLength: 1000,
    message: 'Rejection reason cannot exceed 1000 characters'
  }
};

// @route   POST /api/questionnaires
// @desc    Submit questionnaire (Startup)
// @access  Private (Startup)
router.post('/', authenticateStartup, validateInput(submitQuestionnaireSchema), async (req, res, next) => {
  try {
    const { basicInfo, requirements, serviceSelection } = req.body;
    
    // Check if startup already has a pending or approved questionnaire
    const existingQuestionnaire = await Questionnaire.findOne({
      startupId: req.user._id,
      status: { $in: ['submitted', 'under_review', 'approved', 'needs_clarification'] }
    });
    
    if (existingQuestionnaire) {
      return next(new AppError('You already have an active questionnaire. Please wait for review or contact support.', 400, 'QUESTIONNAIRE_EXISTS'));
    }
    
    // Create questionnaire
    const questionnaire = new Questionnaire({
      startupId: req.user._id,
      basicInfo,
      requirements,
      serviceSelection,
      status: 'submitted',
      submittedAt: new Date(),
      metadata: {
        submissionIP: req.ip,
        userAgent: req.headers['user-agent']
      }
    });
    
    await questionnaire.save();
    
    // Update startup onboarding progress
    await Startup.findByIdAndUpdate(req.user._id, {
      'onboarding.questionnaireCompleted': true,
      'onboarding.currentStep': 'pending_review',
      'onboarding.lastUpdated': new Date()
    });
    
    // Send confirmation email to startup
    try {
      await sendEmail({
        to: req.user.email,
        subject: 'Questionnaire Submitted Successfully',
        template: 'questionnaire-submitted',
        data: {
          startupName: req.user.profile.founderFirstName,
          projectName: basicInfo.startupName,
          submissionDate: new Date().toLocaleDateString(),
          trackingId: questionnaire._id.toString().slice(-8).toUpperCase()
        }
      });
    } catch (emailError) {
      logger.logError('Questionnaire confirmation email failed', emailError);
      // Don't fail the request if email fails
    }
    
    // Send notification to admins (you could implement admin notification system here)
    logger.logInfo(`New questionnaire submitted by startup ${req.user._id}`, {
      questionnaireId: questionnaire._id,
      startupName: basicInfo.startupName,
      taskType: basicInfo.taskType
    });
    
    res.status(201).json({
      success: true,
      message: 'Questionnaire submitted successfully. We will review it and get back to you soon.',
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
      .skip((page - 1) * limit)
      .populate('reviewedBy', 'profile.firstName profile.lastName email');
    
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
          reviewedAt: q.reviewedAt,
          reviewedBy: q.reviewedBy,
          adminNotes: q.adminNotes,
          rejectionReason: q.rejectionReason,
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
    }).populate('reviewedBy', 'profile.firstName profile.lastName email');
    
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
          reviewedAt: questionnaire.reviewedAt,
          reviewedBy: questionnaire.reviewedBy,
          adminNotes: questionnaire.adminNotes,
          rejectionReason: questionnaire.rejectionReason,
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
router.put('/:id', authenticateStartup, validateInput(submitQuestionnaireSchema), async (req, res, next) => {
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
router.post('/:id/review', authenticateAdmin, validateInput(reviewQuestionnaireSchema), async (req, res, next) => {
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
          adminNotes: questionnaire.adminNotes,
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

module.exports = router;
