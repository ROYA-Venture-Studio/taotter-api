const express = require('express');
const multer = require('multer');
const Sprint = require('../models/Sprint');
const Questionnaire = require('../models/Questionnaire');
const Startup = require('../models/Startup');
const { AppError } = require('../middleware/errorHandler');
const { authenticateStartup, authenticateAdmin } = require('../middleware/auth');
const { validate } = require('../utils/validation');
const logger = require('../utils/logger');
const { sendEmail } = require('../utils/communications');
const azureStorage = require('../utils/azureStorage');
    const Task = require('../models/Task');
const Board = require('../models/Board')
// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow PDF, DOC, DOCX files
    const allowedMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only PDF and Word documents are allowed', 400, 'INVALID_FILE_TYPE'), false);
    }
  }
});

const router = express.Router();

// ... (validation schemas and other endpoints) ...

// @route   GET /api/sprints/my-sprints
// @desc    Get startup's sprints (selected/active)
// @access  Private (Startup)
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
      questionnaireId: questionnaireIds,
      $or: [
        { selectedPackage: { $exists: true } },
        { createdBy: req.user._id }
      ]
    };

    if (status) {
      query.status = status;
    }

    const sprints = await Sprint.find(query)
      .sort({ updatedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'profile.firstName profile.lastName');

    const total = await Sprint.countDocuments(query);

    res.json({
      success: true,
      data: {
        sprints: sprints.map(sprint => ({
          id: sprint._id,
          questionnaireId: sprint.questionnaireId ? sprint.questionnaireId.toString() : undefined,
          name: sprint.name,
          description: sprint.description,
          type: sprint.type,
          status: sprint.status,
          progress: sprint.progress,
          selectedPackage: sprint.selectedPackage,
          milestones: sprint.milestones,
          createdAt: sprint.createdAt,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          documentsSubmitted: sprint.documentsSubmitted,
          meetingScheduled: sprint.meetingScheduled,
          selectedPackagePaymentStatus: sprint.selectedPackagePaymentStatus || "unpaid",
          selectedPackagePaymentVerifiedAt: sprint.selectedPackagePaymentVerifiedAt || null,
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

// ... (rest of the code remains unchanged) ...

/**
 * @route   POST /api/sprints/startup/create-temp
 * @desc    Create a temporary sprint for a startup after questionnaire submission
 * @access  Private (Startup)
 */
router.post('/startup/create-temp', authenticateStartup, async (req, res, next) => {
  try {
    const { questionnaireId, name, description, type, estimatedDuration } = req.body;
    // Validate questionnaire exists and belongs to startup
    const questionnaire = await Questionnaire.findById(questionnaireId);
    console.log('questionnaire:', questionnaire);
    console.log('questionnaire.startupId:', questionnaire ? questionnaire.startupId : null);
    console.log('req.user._id:', req.user ? req.user._id : null);
    if (!questionnaire || !questionnaire.startupId || questionnaire.startupId.toString() !== req.user._id.toString()) {
      return next(new AppError('Invalid questionnaire for this startup', 403, 'INVALID_QUESTIONNAIRE'));
    }
    // Check if a sprint already exists for this questionnaire
    const existingSprint = await Sprint.findOne({ questionnaireId });
    if (existingSprint) {
      return res.status(200).json({
        success: true,
        message: 'Sprint already exists for this questionnaire',
        data: { sprint: existingSprint }
      });
    }
    // Map type to allowed enum values
    const allowedTypes = ['mvp', 'validation', 'branding', 'marketing', 'fundraising', 'custom'];
    const sprintType = allowedTypes.includes(type) ? type : 'custom';
    // Create temp sprint
    const sprint = new Sprint({
      questionnaireId,
      name,
      description,
      type: sprintType,
      status: 'draft',
      estimatedDuration,
      createdBy: req.user._id,
      progress: { percentage: 0, currentPhase: 'planning' },
      statusHistory: [{
        status: 'draft',
        changedAt: new Date(),
        changedBy: req.user._id,
        userType: 'startup',
        note: 'Temporary sprint created after questionnaire submission'
      }]
    });
    await sprint.save();
    res.status(201).json({
      success: true,
      message: 'Temporary sprint created',
      data: { sprint }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/sprints/questionnaire/:questionnaireId/proposals
 * @desc    Get admin proposals for a questionnaire (available sprints)
 * @access  Private (Startup)
 */
const mongoose = require('mongoose');
router.get('/questionnaire/:questionnaireId/proposals', authenticateStartup, async (req, res, next) => {
  try {
    const questionnaireIdRaw = String(req.params.questionnaireId || '').trim();
    if (!mongoose.Types.ObjectId.isValid(questionnaireIdRaw)) {
      return res.status(400).json({ success: false, message: 'Invalid questionnaireId' });
    }
    const questionnaireId = questionnaireIdRaw;
    // Optionally verify questionnaire belongs to req.user._id
    const questionnaire = await Questionnaire.findById(questionnaireId);
    if (!questionnaire || questionnaire.startupId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    // Find admin-created sprints for this questionnaire with status 'available'
    const proposals = await Sprint.find({ questionnaireId, status: 'available' }).select('_id name packageOptions');
    res.json({ success: true, data: { proposals } });
  } catch (error) {
    next(error);
  }
});

router.get('/by-questionnaire/:questionnaireId', authenticateStartup, async (req, res, next) => {
  try {
    const { questionnaireId } = req.params;
    const sprints = await Sprint.find({ questionnaireId });
    res.json({ success: true, data: { sprints } });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/sprints/:id
 * @desc    Delete a sprint (Startup can only delete their own draft sprint)
 * @access  Private (Startup)
 */
router.delete('/:id', authenticateStartup, async (req, res, next) => {
  try {
    const sprint = await Sprint.findById(req.params.id);
    if (!sprint) {
      return res.status(404).json({ success: false, message: 'Sprint not found' });
    }
    // Only allow deleting draft sprints created by the startup
    if (
      sprint.status !== 'draft' ||
      !sprint.createdBy ||
      sprint.createdBy.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'You can only delete your own draft sprints.' });
    }
    await sprint.deleteOne();
    res.json({ success: true, message: 'Sprint deleted.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
router.get('/', authenticateStartup, async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status = 'available' } = req.query;
    
    // Check if startup has approved or proposal_created questionnaire
    const questionnaire = await Questionnaire.findOne({
      startupId: req.user._id,
      status: { $in: ['approved', 'proposal_created'] }
    });
    console.log(questionnaire)
    if (!questionnaire) {
      return next(new AppError('No approved or sprint-created questionnaire found. Please submit and get approval for a questionnaire first.', 403, 'NO_APPROVED_QUESTIONNAIRE'));
    }
    
    const query = {
      questionnaireId: questionnaire._id
        };
    console.log(query)
    const sprints = await Sprint.find(query)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'profile.firstName profile.lastName');
    console.log(sprints)
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
          selectedPackagePaymentStatus: sprint.selectedPackagePaymentStatus || "unpaid",
          selectedPackagePaymentVerifiedAt: sprint.selectedPackagePaymentVerifiedAt || null,
          deliverables: sprint.deliverables,
          estimatedDuration: sprint.estimatedDuration,
          packageOptions: sprint.packageOptions.map(pkg => ({
            id: pkg._id,
            name: pkg.name,
            description: pkg.description,
            price: pkg.price,
            currency: pkg.currency,
            duration: pkg.duration,
            features: pkg.features,
            teamSize: pkg.teamSize,
            isRecommended: pkg.isRecommended,
            paymentLink: pkg.paymentLink || "",
            pricingModel: pkg.pricingModel || (
              pkg.hourlyRate && pkg.QTY ? "hourly" :
              pkg.amount ? "fixed" : undefined
            )
          })),
          createdBy: sprint.createdBy,
          createdAt: sprint.createdAt,
          updatedAt: sprint.updatedAt,
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
      .populate('createdBy', 'profile.firstName profile.lastName');
    
    const total = await Sprint.countDocuments(query);
    
    res.json({
      success: true,
      data: {
        sprints: sprints.map(sprint => ({
          id: sprint._id,
          questionnaireId: sprint.questionnaireId ? sprint.questionnaireId.toString() : undefined,
          name: sprint.name,
          description: sprint.description,
          type: sprint.type,
          status: sprint.status,
          progress: sprint.progress,
          selectedPackage: sprint.selectedPackage,
          deliverables: sprint.deliverables,
          milestones: sprint.milestones,
          createdAt: sprint.createdAt,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          documentsSubmitted: sprint.documentsSubmitted,
          meetingScheduled: sprint.meetingScheduled,
          // ADD THESE FIELDS FOR PAYMENT STATUS
          selectedPackagePaymentStatus: sprint.selectedPackagePaymentStatus || "unpaid",
          selectedPackagePaymentVerifiedAt: sprint.selectedPackagePaymentVerifiedAt || null,
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
      .populate('createdBy', 'profile.firstName profile.lastName');
    
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
          packageOptions: sprint.packageOptions.map(pkg => ({
            ...pkg.toObject(),
            pricingModel: pkg.pricingModel || (
              pkg.hourlyRate && pkg.QTY ? "hourly" :
              pkg.amount ? "fixed" : undefined
            )
          })),
          deliverables: sprint.deliverables,
          selectedPackage: sprint.selectedPackage
            ? {
                ...sprint.selectedPackage.toObject(),
                pricingModel: sprint.selectedPackage.pricingModel || (
                  sprint.selectedPackage.hourlyRate && sprint.selectedPackage.QTY ? "hourly" :
                  sprint.selectedPackage.amount ? "fixed" : undefined
                )
              }
            : null,
          requiredDocuments: sprint.requiredDocuments,
          progress: sprint.progress,
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
router.post('/:id/select-package', authenticateStartup, validate(require('joi').object({ packageId: require('joi').string().required() })), async (req, res, next) => {
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
    
    // Find the selected package
    const selectedPackage = sprint.packageOptions.find(pkg => pkg._id.toString() === packageId);
    if (!selectedPackage) {
      return next(new AppError('Package not found', 404, 'PACKAGE_NOT_FOUND'));
    }
    
    // Update sprint with selected package
    sprint.selectedPackage = selectedPackage;
    sprint.status = 'package_selected';
    
    // Add to status history
    sprint.statusHistory.push({
      status: 'package_selected',
      changedAt: new Date(),
      changedBy: req.user._id,
      userType: 'startup',
      note: `Selected package: ${selectedPackage.name}`
    });
    
    await sprint.save();

    // Set all other sprints for this questionnaire to inactive
    await Sprint.updateMany(
      {
        questionnaireId: sprint.questionnaireId,
        _id: { $ne: sprint._id }
      },
      { $set: { status: 'inactive' } }
    );
    
    // Update startup onboarding
    await Startup.findByIdAndUpdate(req.user._id, {
      'onboarding.currentStep': 'payment_pending',
      'onboarding.packageSelected': true,
      'onboarding.lastUpdated': new Date()
    });
    
    // Send confirmation email asynchronously (don't wait for it)
    setImmediate(async () => {
      try {
        const fullName = `${req.user.profile.founderFirstName || ''} ${req.user.profile.founderLastName || ''}`.trim() || req.user.email;
        
        await sendEmail({
          to: req.user.email,
          subject: `You Selected: ${selectedPackage.name}`,
          template: 'package-selected',
          data: {
            fullName: fullName,
            packageName: selectedPackage.name,
            sprintName: sprint.name,
            packagePrice: selectedPackage.price || selectedPackage.amount,
            packageCurrency: selectedPackage.currency || 'QAR',
            estimatedDuration: selectedPackage.duration || selectedPackage.engagementHours,
            dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/startup/dashboard`
          }
        });
      } catch (emailError) {
        logger.logError('Package selection confirmation email failed', emailError);
      }
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
router.post('/:id/upload-documents', authenticateStartup, upload.single('brandGuidelines'), async (req, res, next) => {
  try {
    const { contactLists, appDemo } = req.body;
    const file = req.file;
    
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
    
    const uploadedDocuments = [];
    
    // Upload file to Azure if provided
    if (file) {
      try {
        const uploadResult = await azureStorage.uploadFile(
          file,
          req.user._id,
          req.params.id,
          'brandGuidelines'
        );
        if (uploadResult.success) {
          const documentData = {
            fileName: uploadResult.fileName,
            originalName: file.originalname,
            fileUrl: uploadResult.fileUrl,
            fileType: file.mimetype,
            documentType: 'brandGuidelines',
            uploadedAt: new Date()
          };
          
          // Store uploaded file in sprint.sprintDocuments.uploadedFiles
          if (!sprint.sprintDocuments) sprint.sprintDocuments = {};
          if (!sprint.sprintDocuments.uploadedFiles) sprint.sprintDocuments.uploadedFiles = [];
          sprint.sprintDocuments.uploadedFiles.push(documentData);
          uploadedDocuments.push(documentData);
        }
      } catch (uploadError) {
        logger.logError('File upload error', uploadError);
        return next(new AppError('Failed to upload file', 500, 'FILE_UPLOAD_ERROR'));
      }
    }

    // sprintDocuments removed from Sprint model. Text fields not stored.
    const documentSubmission = {
      sprintId: req.params.id,
      contactLists: contactLists || '',
      appDemo: appDemo || '',
      documentsUploaded: uploadedDocuments,
      submittedAt: new Date()
    };
    
    // Mark documents as submitted
    sprint.documentsSubmitted = true;
    if (!sprint.sprintDocuments) sprint.sprintDocuments = {};
    sprint.sprintDocuments.contactLists = contactLists || '';
    sprint.sprintDocuments.appDemo = appDemo || '';
    sprint.sprintDocuments.submittedAt = new Date();
    sprint.status = 'documents_submitted';
    
    // Add to status history
    sprint.statusHistory.push({
      status: 'documents_submitted',
      changedAt: new Date(),
      changedBy: req.user._id,
      userType: 'startup',
      note: `Documents submitted${file ? ' with file upload' : ''}`
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
          submittedAt: sprint.sprintDocuments?.submittedAt || null
        },
        uploadedDocuments,
        submission: documentSubmission
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
    
    // Update sprint with meeting information
    sprint.meetingScheduled = {
      isScheduled: true,
      meetingUrl: meetingUrl,
      scheduledAt: new Date(scheduledAt),
      meetingType: meetingType,
      scheduledBy: req.user._id
    };
    
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

/**
 * @route   PUT /api/sprints/admin/:sprintId/payment-status
 * @desc    Update payment status for the selected package (Admin)
 * @access  Private (Admin)
 */
router.put('/admin/:sprintId/payment-status', authenticateAdmin, async (req, res, next) => {
  try {
    const { paymentStatus } = req.body;
    if (!['paid', 'unpaid'].includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid payment status' });
    }
    const sprint = await Sprint.findById(req.params.sprintId);
    if (!sprint) {
      return res.status(404).json({ success: false, message: 'Sprint not found' });
    }
    sprint.selectedPackagePaymentStatus = paymentStatus;
    if (paymentStatus === 'paid') {
      sprint.selectedPackagePaymentVerifiedAt = new Date();
      sprint.selectedPackagePaymentVerifiedBy = req.user._id;
    } else {
      sprint.selectedPackagePaymentVerifiedAt = undefined;
      sprint.selectedPackagePaymentVerifiedBy = undefined;
    }
    await sprint.save();

    // Fetch questionnaire and startup info for email and onboarding update
    let questionnaire = null;
    let startup = null;
    try {
      questionnaire = await Questionnaire.findById(sprint.questionnaireId).populate('startupId');
      startup = questionnaire && questionnaire.startupId ? questionnaire.startupId : null;
    } catch (e) {
      logger.logError('Failed to fetch questionnaire/startup for payment status update', e);
    }

    // Update startup onboarding step if paid
    if (paymentStatus === 'paid' && startup) {
      try {
        // Set status to verified if currently pending
        const update = {
          'onboarding.currentStep': 'active_sprint',
          'onboarding.lastUpdated': new Date()
        };
        if (startup.status === 'pending') {
          update.status = 'verified';
        }
        await Startup.findByIdAndUpdate(startup._id, update);
      } catch (e) {
        logger.logError('Failed to update startup onboarding to active_sprint after payment', e, { startupId: startup._id });
      }
    }

    // Send payment confirmation email if paid
    if (paymentStatus === 'paid' && startup) {
      try {
        await sendEmail({
          to: startup.email,
          template: 'paymentConfirmed',
          data: {
            name: `${startup.profile.founderFirstName} ${startup.profile.founderLastName}`,
            sprintName: sprint.name,
            dashboardUrl: process.env.FRONTEND_URL + '/dashboard'
          }
        });
      } catch (emailError) {
        logger.logError('Payment confirmation email failed', emailError, { sprintId: sprint._id });
      }
    }

    res.json({
      success: true,
      message: 'Selected package payment status updated',
      data: {
        sprintId: sprint._id,
        selectedPackagePaymentStatus: sprint.selectedPackagePaymentStatus
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
router.post('/admin/create', authenticateAdmin, validate(require('joi').object({
  questionnaireId: require('joi').string().required(),
  name: require('joi').string().min(3).max(100).required(),
  description: require('joi').string().min(10).max(2000).required(),
  type: require('joi').string().valid('mvp', 'validation', 'branding', 'marketing', 'fundraising', 'custom').required(),
  estimatedDuration: require('joi').number().min(1).max(365).required(),
  packageOptions: require('joi').array().min(1).required(),
  requiredDocuments: require('joi').array().optional()
})), async (req, res, next) => {
  try {
    const {
      questionnaireId,
      name,
      description,
      type,
      estimatedDuration,
      packageOptions,
      requiredDocuments = [],
      deliverables = []
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
      if (!pkg.paymentLink || typeof pkg.paymentLink !== 'string' || pkg.paymentLink.trim() === "") {
        return next(new AppError('Each package must have a valid payment link', 400, 'MISSING_PAYMENT_LINK'));
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
        isRecommended: pkg.isRecommended || false,
        paymentLink: pkg.paymentLink || ""
      })),
      requiredDocuments,
      deliverables,
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
    questionnaire.status = 'proposal_created';
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
      sortOrder = 'desc',
      search
    } = req.query;

    const query = {};
    // Exclude inactive sprints unless status filter is 'inactive'
    if (status && status !== "all") {
      query.status = status;
    } else {
      // When status is 'all', exclude inactive
      query.status = { $ne: "inactive" };
    }
    if (type) query.type = type;

    // Search by sprint name or startup name
    if (search && search.trim() !== "") {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Populate startup name for search filter
    const sprints = await Sprint.find(query)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('questionnaireId', 'basicInfo.startupName basicInfo.taskType')
      .populate('createdBy', 'profile.firstName profile.lastName');

    // If searching by startup name, filter in-memory (MongoDB can't search populated fields)
    let filteredSprints = sprints;
    if (search && search.trim() !== "") {
      filteredSprints = sprints.filter(sprint =>
        (sprint.questionnaireId?.basicInfo?.startupName || "")
          .toLowerCase()
          .includes(search.toLowerCase()) ||
        (sprint.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (sprint.description || "").toLowerCase().includes(search.toLowerCase())
      );
    }

    const total = await Sprint.countDocuments(query);

    // Get status summary
    const statusSummary = await Sprint.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        sprints: filteredSprints.map(sprint => ({
          id: sprint._id,
          name: sprint.name,
          description: sprint.description,
          type: sprint.type,
          status: sprint.status,
          questionnaire: sprint.questionnaireId,
          selectedPackage: sprint.selectedPackage,
          progress: sprint.progress,
          createdBy: sprint.createdBy,
          createdAt: sprint.createdAt,
          startDate: sprint.startDate,
          endDate: sprint.endDate,
          deliverables: sprint.deliverables,
          estimatedDuration: sprint.estimatedDuration,
          packageOptions: sprint.packageOptions ? sprint.packageOptions.map(pkg => ({
            id: pkg._id,
            name: pkg.name,
            description: pkg.description,
            price: pkg.price,
            currency: pkg.currency,
            duration: pkg.duration,
            features: pkg.features,
            teamSize: pkg.teamSize,
            isRecommended: pkg.isRecommended,
            paymentLink: pkg.paymentLink || "",
            pricingModel: pkg.pricingModel || (
              pkg.hourlyRate && pkg.QTY ? "hourly" :
              pkg.amount ? "fixed" : undefined
            ),
            hourlyRate: pkg.hourlyRate,
            QTY: pkg.QTY,
            amount: pkg.amount,
            discount: pkg.discount
          })) : []
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
router.put('/admin/:id/status', authenticateAdmin, validate(require('joi').object({
  status: require('joi').string().valid('draft', 'available', 'in_progress', 'on_hold', 'completed', 'cancelled').required(),
  statusNote: require('joi').string().max(500).optional()
})), async (req, res, next) => {
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
    } else if (status === 'completed' && !sprint.endDate) {
      sprint.endDate = new Date();
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

    // If sprint is now in_progress, set startup onboarding.currentStep to 'active_sprint'
    if (status === 'in_progress' && sprint.questionnaireId && sprint.questionnaireId.startupId) {
      await Startup.findByIdAndUpdate(
        sprint.questionnaireId.startupId,
        {
          'onboarding.currentStep': 'active_sprint',
          'onboarding.lastUpdated': new Date()
        }
      );
    }
    
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
            progress: sprint.progress
          }
      }
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/sprints/startup/:id/finish
 * @desc    Mark sprint as completed (Startup)
 * @access  Private (Startup)
 */
router.put('/startup/:id/finish', authenticateStartup, async (req, res, next) => {
  try {
    const sprint = await Sprint.findById(req.params.id).populate('questionnaireId');
    if (!sprint) {
      return next(new AppError('Sprint not found', 404, 'SPRINT_NOT_FOUND'));
    }
    // Check access
    if (
      !sprint.questionnaireId ||
      !sprint.questionnaireId.startupId ||
      sprint.questionnaireId.startupId.toString() !== req.user._id.toString()
    ) {
      return next(new AppError('You do not have access to this sprint', 403, 'SPRINT_ACCESS_DENIED'));
    }
    if (sprint.status === 'completed') {
      return res.json({ success: true, message: 'Sprint already completed' });
    }
console.log(sprint.id)
    // Check all tasks for this sprint are completed
const boards = await Board.find({ sprintId: sprint.id });
const boardIds = boards.map(b => b._id);
const tasks = await Task.find({ boardId: { $in: boardIds } });

    const allTasksDone = tasks.length > 0 && tasks.every(task => task.status === 'done');
    const isSprintComplete = sprint.progress && sprint.progress.percentage === 100;
    // console.log(isSprintComplete)
    if (!allTasksDone || !isSprintComplete) {
      return res.status(400).json({
        success: false,
        message: 'Cannot complete sprint: All tasks must be completed and sprint progress must be 100%.',
        data: {
          allTasksDone,
          isSprintComplete,
          totalTasks: tasks.length,
          doneTasks: tasks.filter(t => t.status === 'done').length,
          progress: sprint.progress ? sprint.progress.percentage : 0
        }
      });
    }

    sprint.status = 'completed';
    sprint.endDate = new Date();
    sprint.progress.percentage = 100;
    sprint.statusHistory.push({
      status: 'completed',
      changedAt: new Date(),
      changedBy: req.user._id,
      userType: 'startup',
      note: 'Sprint marked as completed by startup'
    });
    await sprint.save();
    res.json({
      success: true,
      message: 'Sprint marked as completed',
      data: {
        sprint: {
          id: sprint._id,
          status: sprint.status,
          endDate: sprint.endDate,
          progress: sprint.progress
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
