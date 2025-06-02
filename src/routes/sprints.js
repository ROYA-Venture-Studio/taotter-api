const express = require('express');
const Sprint = require('../models/Sprint');
const Questionnaire = require('../models/Questionnaire');
const Startup = require('../models/Startup');
const { AppError } = require('../middleware/errorHandler');
const { authenticateStartup, authenticateAdmin } = require('../middleware/auth');
const { validateInput } = require('../utils/validation');
const logger = require('../utils/logger');
const { sendEmail } = require('../utils/communications');

const router = express.Router();

// Validation schemas
const createSprintSchema = {
  questionnaireId: {
    required: true,
    type: 'string',
    message: 'Questionnaire ID is required'
  },
  name: {
    required: true,
    type: 'string',
    minLength: 3,
    maxLength: 100,
    message: 'Sprint name is required (3-100 characters)'
  },
  description: {
    required: true,
    type: 'string',
    minLength: 10,
    maxLength: 2000,
    message: 'Sprint description is required (10-2000 characters)'
  },
  type: {
    required: true,
    type: 'string',
    enum: ['mvp', 'validation', 'branding', 'marketing', 'fundraising', 'custom'],
    message: 'Valid sprint type is required'
  },
  estimatedDuration: {
    required: true,
    type: 'number',
    min: 1,
    max: 365,
    message: 'Estimated duration must be between 1 and 365 days'
  },
  packageOptions: {
    required: true,
    type: 'array',
    minItems: 1,
    message: 'At least one package option is required'
  },
  requiredDocuments: {
    required: false,
    type: 'array',
    message: 'Required documents must be an array'
  }
};

const selectPackageSchema = {
  packageId: {
    required: true,
    type: 'string',
    message: 'Package ID is required'
  }
};

const updateSprintStatusSchema = {
  status: {
    required: true,
    type: 'string',
    enum: ['draft', 'available', 'in_progress', 'on_hold', 'completed', 'cancelled'],
    message: 'Valid status is required'
  },
  statusNote: {
    required: false,
    type: 'string',
    maxLength: 500,
    message: 'Status note cannot exceed 500 characters'
  }
};

// ==================== STARTUP ROUTES ====================

// @route   GET /api/sprints
// @desc    Get available sprints for startup
// @access  Private (Startup)
router.get('/', authenticateStartup, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status = 'available' } = req.query;
    
    // Check if startup has approved questionnaire
    const approvedQuestionnaire = await Questionnaire.findOne({
      startupId: req.user._id,
      status: 'approved'
    });
    
    if (!approvedQuestionnaire) {
      return next(new AppError('No approved questionnaire found. Please submit and get approval for a questionnaire first.', 403, 'NO_APPROVED_QUESTIONNAIRE'));
    }
    
    const query = {
      questionnaireId: approvedQuestionnaire._id,
      status: status === 'available' ? { $in: ['available', 'draft'] } : status
    };
    
    const sprints = await Sprint.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('assignedTeam.members.userId', 'profile.firstName profile.lastName profile.role');
    
    const total = await Sprint.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        sprints: sprints.map(sprint => ({
          id: sprint._id,
          name: sprint.name,
          description: sprint.description,
          type: sprint.type,
          status: sprint.status,
          estimatedDuration: sprint.estimatedDuration,
          packageOptions: sprint.packageOptions.map(pkg => ({
            id: pkg._id,
            name: pkg.name,
            description: pkg.description,
            price: pkg.price,
            currency: pkg.currency,
            engagementHours: pkg.engagementHours,
            duration: pkg.duration,
            features: pkg.features,
            teamSize: pkg.teamSize,
            communicationLevel: pkg.communicationLevel,
            isRecommended: pkg.isRecommended
          })),
          createdBy: sprint.createdBy,
          createdAt: sprint.createdAt,
          updatedAt: sprint.updatedAt,
          timeline: sprint.timeline,
          selectedPackage: sprint.selectedPackage
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

// @route   GET /api/sprints/my-sprints
// @desc    Get startup's sprints (selected/active)
// @access  Private (Startup)
router.get('/my-sprints', authenticateStartup, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    
    // Find questionnaires for this startup
    const questionnaires = await Questionnaire.find({
      startupId: req.user._id
    }).select('_id');
    
    const questionnaireIds = questionnaires.map(q => q._id);
    
    const query = {
      questionnaireId: { $in: questionnaireIds },
      selectedPackage: { $exists: true }
    };
    
    if (status) {
      query.status = status;
    }
    
    const sprints = await Sprint.find(query)
      .sort({ updatedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('assignedTeam.members.userId', 'profile.firstName profile.lastName profile.role profile.department');
    
    const total = await Sprint.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        sprints: sprints.map(sprint => ({
          id: sprint._id,
          name: sprint.name,
          description: sprint.description,
          type: sprint.type,
          status: sprint.status,
          progress: sprint.progress,
          selectedPackage: sprint.selectedPackage,
          assignedTeam: sprint.assignedTeam,
          timeline: sprint.timeline,
          milestones: sprint.milestones,
          createdAt: sprint.createdAt,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          documentsSubmitted: sprint.documentsSubmitted,
          meetingScheduled: sprint.meetingScheduled
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

// @route   GET /api/sprints/:id
// @desc    Get sprint details
// @access  Private (Startup)
router.get('/:id', authenticateStartup, async (req, res, next) => {
  try {
    const sprint = await Sprint.findById(req.params.id)
      .populate('questionnaireId')
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('assignedTeam.members.userId', 'profile.firstName profile.lastName profile.role profile.department');
    
    if (!sprint) {
      return next(new AppError('Sprint not found', 404, 'SPRINT_NOT_FOUND'));
    }
    
    // Check if startup has access to this sprint
    const questionnaire = await Questionnaire.findOne({
      _id: sprint.questionnaireId._id,
      startupId: req.user._id
    });
    
    if (!questionnaire) {
      return next(new AppError('You do not have access to this sprint', 403, 'SPRINT_ACCESS_DENIED'));
    }
    
    res.json({
      success: true,
      data: {
        sprint: {
          id: sprint._id,
          name: sprint.name,
          description: sprint.description,
          type: sprint.type,
          status: sprint.status,
          estimatedDuration: sprint.estimatedDuration,
          packageOptions: sprint.packageOptions,
          selectedPackage: sprint.selectedPackage,
          requiredDocuments: sprint.requiredDocuments,
          progress: sprint.progress,
          assignedTeam: sprint.assignedTeam,
          timeline: sprint.timeline,
          milestones: sprint.milestones,
          createdBy: sprint.createdBy,
          createdAt: sprint.createdAt,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          documentsSubmitted: sprint.documentsSubmitted,
          meetingScheduled: sprint.meetingScheduled,
          statusHistory: sprint.statusHistory
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/sprints/:id/select-package
// @desc    Select package for sprint
// @access  Private (Startup)
router.post('/:id/select-package', authenticateStartup, validateInput(selectPackageSchema), async (req, res, next) => {
  try {
    const { packageId } = req.body;
    
    const sprint = await Sprint.findById(req.params.id)
      .populate('questionnaireId');
    
    if (!sprint) {
      return next(new AppError('Sprint not found', 404, 'SPRINT_NOT_FOUND'));
    }
    
    // Check if startup has access to this sprint
    const questionnaire = await Questionnaire.findOne({
      _id: sprint.questionnaireId._id,
      startupId: req.user._id
    });
    
    if (!questionnaire) {
      return next(new AppError('You do not have access to this sprint', 403, 'SPRINT_ACCESS_DENIED'));
    }
    
    if (sprint.selectedPackage) {
      return next(new AppError('Package already selected for this sprint', 400, 'PACKAGE_ALREADY_SELECTED'));
    }
    
    // Find the selected package
    const selectedPackage = sprint.packageOptions.find(pkg => pkg._id.toString() === packageId);
    if (!selectedPackage) {
      return next(new AppError('Package not found', 404, 'PACKAGE_NOT_FOUND'));
    }
    
    // Update sprint with selected package
    sprint.selectedPackage = selectedPackage;
    sprint.status = 'package_selected';
    sprint.timeline.packageSelectedAt = new Date();
    
    // Add to status history
    sprint.statusHistory.push({
      status: 'package_selected',
      changedAt: new Date(),
      changedBy: req.user._id,
      userType: 'startup',
      note: `Selected package: ${selectedPackage.name}`
    });
    
    await sprint.save();
    
    // Update startup onboarding
    await Startup.findByIdAndUpdate(req.user._id, {
      'onboarding.currentStep': 'document_upload',
      'onboarding.packageSelected': true,
      'onboarding.lastUpdated': new Date()
    });
    
    // Send confirmation email
    try {
      await sendEmail({
        to: req.user.email,
        subject: `Package Selected - ${sprint.name}`,
        template: 'package-selected',
        data: {
          startupName: req.user.profile.founderFirstName,
          sprintName: sprint.name,
          packageName: selectedPackage.name,
          packagePrice: selectedPackage.price,
          packageCurrency: selectedPackage.currency,
          estimatedDuration: selectedPackage.duration
        }
      });
    } catch (emailError) {
      logger.logError('Package selection confirmation email failed', emailError);
    }
    
    logger.logInfo(`Package selected for sprint ${sprint._id}`, {
      sprintId: sprint._id,
      startupId: req.user._id,
      packageId: packageId,
      packageName: selectedPackage.name
    });
    
    res.json({
      success: true,
      message: 'Package selected successfully',
      data: {
        sprint: {
          id: sprint._id,
          selectedPackage: sprint.selectedPackage,
          status: sprint.status,
          timeline: sprint.timeline
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/sprints/:id/upload-documents
// @desc    Upload required documents for sprint
// @access  Private (Startup)
router.post('/:id/upload-documents', authenticateStartup, async (req, res, next) => {
  try {
    // This will be implemented when we create the document management system
    // For now, just mark documents as submitted
    const sprint = await Sprint.findById(req.params.id)
      .populate('questionnaireId');
    
    if (!sprint) {
      return next(new AppError('Sprint not found', 404, 'SPRINT_NOT_FOUND'));
    }
    
    // Check access
    const questionnaire = await Questionnaire.findOne({
      _id: sprint.questionnaireId._id,
      startupId: req.user._id
    });
    
    if (!questionnaire) {
      return next(new AppError('You do not have access to this sprint', 403, 'SPRINT_ACCESS_DENIED'));
    }
    
    if (!sprint.selectedPackage) {
      return next(new AppError('Please select a package first', 400, 'NO_PACKAGE_SELECTED'));
    }
    
    // Mark documents as submitted
    sprint.documentsSubmitted = true;
    sprint.timeline.documentsSubmittedAt = new Date();
    sprint.status = 'documents_submitted';
    
    // Add to status history
    sprint.statusHistory.push({
      status: 'documents_submitted',
      changedAt: new Date(),
      changedBy: req.user._id,
      userType: 'startup',
      note: 'Required documents submitted'
    });
    
    await sprint.save();
    
    // Update startup onboarding
    await Startup.findByIdAndUpdate(req.user._id, {
      'onboarding.currentStep': 'meeting_scheduling',
      'onboarding.documentsSubmitted': true,
      'onboarding.lastUpdated': new Date()
    });
    
    res.json({
      success: true,
      message: 'Documents uploaded successfully',
      data: {
        sprint: {
          id: sprint._id,
          status: sprint.status,
          documentsSubmitted: sprint.documentsSubmitted,
          timeline: sprint.timeline
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   POST /api/sprints/:id/schedule-meeting
// @desc    Schedule meeting for sprint
// @access  Private (Startup)
router.post('/:id/schedule-meeting', authenticateStartup, async (req, res, next) => {
  try {
    const { meetingUrl, scheduledAt, meetingType = 'kickoff' } = req.body;
    
    const sprint = await Sprint.findById(req.params.id)
      .populate('questionnaireId');
    
    if (!sprint) {
      return next(new AppError('Sprint not found', 404, 'SPRINT_NOT_FOUND'));
    }
    
    // Check access
    const questionnaire = await Questionnaire.findOne({
      _id: sprint.questionnaireId._id,
      startupId: req.user._id
    });
    
    if (!questionnaire) {
      return next(new AppError('You do not have access to this sprint', 403, 'SPRINT_ACCESS_DENIED'));
    }
    
    if (!sprint.documentsSubmitted) {
      return next(new AppError('Please submit required documents first', 400, 'DOCUMENTS_NOT_SUBMITTED'));
    }
    
    // Update sprint with meeting information
    sprint.meetingScheduled = {
      isScheduled: true,
      meetingUrl: meetingUrl,
      scheduledAt: new Date(scheduledAt),
      meetingType: meetingType,
      scheduledBy: req.user._id
    };
    
    sprint.timeline.meetingScheduledAt = new Date();
    sprint.status = 'meeting_scheduled';
    
    // Add to status history
    sprint.statusHistory.push({
      status: 'meeting_scheduled',
      changedAt: new Date(),
      changedBy: req.user._id,
      userType: 'startup',
      note: `${meetingType} meeting scheduled for ${new Date(scheduledAt).toLocaleDateString()}`
    });
    
    await sprint.save();
    
    // Update startup onboarding
    await Startup.findByIdAndUpdate(req.user._id, {
      'onboarding.currentStep': 'meeting_scheduled',
      'onboarding.meetingScheduled': true,
      'onboarding.lastUpdated': new Date()
    });
    
    res.json({
      success: true,
      message: 'Meeting scheduled successfully',
      data: {
        sprint: {
          id: sprint._id,
          status: sprint.status,
          meetingScheduled: sprint.meetingScheduled,
          timeline: sprint.timeline
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// ==================== ADMIN ROUTES ====================

// @route   POST /api/sprints/admin/create
// @desc    Create custom sprint for questionnaire (Admin)
// @access  Private (Admin)
router.post('/admin/create', authenticateAdmin, validateInput(createSprintSchema), async (req, res, next) => {
  try {
    const {
      questionnaireId,
      name,
      description,
      type,
      estimatedDuration,
      packageOptions,
      requiredDocuments = []
    } = req.body;
    
    // Validate questionnaire exists and is approved
    const questionnaire = await Questionnaire.findById(questionnaireId)
      .populate('startupId', 'email profile.founderFirstName profile.founderLastName profile.companyName');
    
    if (!questionnaire) {
      return next(new AppError('Questionnaire not found', 404, 'QUESTIONNAIRE_NOT_FOUND'));
    }
    
    if (questionnaire.status !== 'approved') {
      return next(new AppError('Questionnaire must be approved before creating sprint', 400, 'QUESTIONNAIRE_NOT_APPROVED'));
    }
    
    // Check if sprint already exists for this questionnaire
    const existingSprint = await Sprint.findOne({ questionnaireId });
    if (existingSprint) {
      return next(new AppError('Sprint already exists for this questionnaire', 400, 'SPRINT_ALREADY_EXISTS'));
    }
    
    // Validate package options
    for (let pkg of packageOptions) {
      if (!pkg.name || !pkg.description || !pkg.price || !pkg.currency) {
        return next(new AppError('Each package must have name, description, price, and currency', 400, 'INVALID_PACKAGE_OPTIONS'));
      }
    }
    
    // Create sprint
    const sprint = new Sprint({
      questionnaireId,
      name,
      description,
      type,
      status: 'available',
      estimatedDuration,
      packageOptions: packageOptions.map((pkg, index) => ({
        ...pkg,
        _id: undefined, // Let MongoDB generate new IDs
        isRecommended: pkg.isRecommended || false
      })),
      requiredDocuments,
      createdBy: req.user._id,
      timeline: {
        createdAt: new Date()
      },
      statusHistory: [{
        status: 'available',
        changedAt: new Date(),
        changedBy: req.user._id,
        userType: 'admin',
        note: 'Sprint created and made available'
      }]
    });
    
    await sprint.save();
    
    // Update questionnaire status
    questionnaire.status = 'sprint_created';
    await questionnaire.save();
    
    // Update startup onboarding
    await Startup.findByIdAndUpdate(questionnaire.startupId._id, {
      'onboarding.currentStep': 'sprint_selection',
      'onboarding.sprintCreated': true,
      'onboarding.lastUpdated': new Date()
    });
    
    // Send notification email to startup
    try {
      await sendEmail({
        to: questionnaire.startupId.email,
        subject: `Custom Sprint Ready - ${name}`,
        template: 'sprint-available',
        data: {
          startupName: questionnaire.startupId.profile.founderFirstName,
          sprintName: name,
          sprintDescription: description,
          packageCount: packageOptions.length,
          createdBy: req.user.profile.firstName + ' ' + req.user.profile.lastName
        }
      });
    } catch (emailError) {
      logger.logError('Sprint creation notification email failed', emailError);
    }
    
    logger.logInfo(`Sprint created for questionnaire ${questionnaireId}`, {
      sprintId: sprint._id,
      questionnaireId,
      startupId: questionnaire.startupId._id,
      adminId: req.user._id,
      sprintName: name
    });
    
    res.status(201).json({
      success: true,
      message: 'Sprint created successfully',
      data: {
        sprint: {
          id: sprint._id,
          name: sprint.name,
          description: sprint.description,
          type: sprint.type,
          status: sprint.status,
          estimatedDuration: sprint.estimatedDuration,
          packageOptions: sprint.packageOptions,
          requiredDocuments: sprint.requiredDocuments,
          createdAt: sprint.createdAt
        }
      }
    });
    
  } catch (error) {
    logger.logError('Sprint creation failed', error);
    next(error);
  }
});

// @route   GET /api/sprints/admin/all
// @desc    Get all sprints (Admin)
// @access  Private (Admin)
router.get('/admin/all', authenticateAdmin, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      type,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;
    
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const sprints = await Sprint.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('questionnaireId', 'basicInfo.startupName basicInfo.taskType')
      .populate('createdBy', 'profile.firstName profile.lastName')
      .populate('assignedTeam.members.userId', 'profile.firstName profile.lastName');
    
    const total = await Sprint.countDocuments(query);
    
    // Get status summary
    const statusSummary = await Sprint.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    res.json({
      success: true,
      data: {
        sprints: sprints.map(sprint => ({
          id: sprint._id,
          name: sprint.name,
          description: sprint.description,
          type: sprint.type,
          status: sprint.status,
          questionnaire: sprint.questionnaireId,
          selectedPackage: sprint.selectedPackage,
          progress: sprint.progress,
          assignedTeam: sprint.assignedTeam,
          createdBy: sprint.createdBy,
          createdAt: sprint.createdAt,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          timeline: sprint.timeline
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          limit: parseInt(limit)
        },
        summary: {
          statusCounts: statusSummary.reduce((acc, item) => {
            acc[item._id] = item.count;
            return acc;
          }, {}),
          totalSprints: total
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   PUT /api/sprints/admin/:id/status
// @desc    Update sprint status (Admin)
// @access  Private (Admin)
router.put('/admin/:id/status', authenticateAdmin, validateInput(updateSprintStatusSchema), async (req, res, next) => {
  try {
    const { status, statusNote } = req.body;
    
    const sprint = await Sprint.findById(req.params.id)
      .populate('questionnaireId');
    
    if (!sprint) {
      return next(new AppError('Sprint not found', 404, 'SPRINT_NOT_FOUND'));
    }
    
    const oldStatus = sprint.status;
    sprint.status = status;
    
    // Update timeline based on status
    if (status === 'in_progress' && !sprint.startDate) {
      sprint.startDate = new Date();
      sprint.timeline.startedAt = new Date();
    } else if (status === 'completed' && !sprint.endDate) {
      sprint.endDate = new Date();
      sprint.timeline.completedAt = new Date();
      sprint.progress.percentage = 100;
    }
    
    // Add to status history
    sprint.statusHistory.push({
      status: status,
      changedAt: new Date(),
      changedBy: req.user._id,
      userType: 'admin',
      note: statusNote || `Status changed from ${oldStatus} to ${status}`
    });
    
    await sprint.save();
    
    logger.logInfo(`Sprint status updated by admin ${req.user._id}`, {
      sprintId: sprint._id,
      oldStatus,
      newStatus: status,
      adminId: req.user._id
    });
    
    res.json({
      success: true,
      message: 'Sprint status updated successfully',
      data: {
        sprint: {
          id: sprint._id,
          status: sprint.status,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          timeline: sprint.timeline,
          progress: sprint.progress
        }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

module.exports = router;
