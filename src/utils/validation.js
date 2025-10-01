const Joi = require('joi');

// Custom validators
const objectId = Joi.string().pattern(/^[0-9a-fA-F]{24}$/, 'MongoDB ObjectId');
const phoneNumber = Joi.string().pattern(/^\+?[1-9]\d{1,14}$/, 'phone number');
const password = Joi.string().min(8).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/, 'password requirements');

// User validation schemas
const userSchemas = {
  register: Joi.object({
    email: Joi.string().email().required(),
    phone: phoneNumber.optional(),
    password: password.required().messages({
      'string.pattern.name': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    }),
    firstName: Joi.string().trim().min(1).max(50).required(),
    lastName: Joi.string().trim().min(1).max(50).required(),
    company: Joi.string().trim().max(100).optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  updateProfile: Joi.object({
    profile: Joi.object({
      firstName: Joi.string().trim().min(1).max(50).optional(),
      lastName: Joi.string().trim().min(1).max(50).optional(),
      company: Joi.string().trim().max(100).optional(),
      timezone: Joi.string().optional(),
      preferences: Joi.object({
        notifications: Joi.object({
          email: Joi.boolean().optional(),
          sms: Joi.boolean().optional(),
          push: Joi.boolean().optional()
        }).optional(),
        theme: Joi.string().valid('light', 'dark').optional()
      }).optional()
    }).required()
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: password.required().messages({
      'string.pattern.name': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    })
  }),

  verifyPhone: Joi.object({
    verificationCode: Joi.string().length(6).pattern(/^\d+$/).required()
  }),

  forgotPassword: Joi.object({
    email: Joi.string().email().required()
  }),

  resetPassword: Joi.object({
    resetToken: Joi.string().required(),
    newPassword: password.required().messages({
      'string.pattern.name': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    })
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required()
  }),

  googleAuth: Joi.object({
    googleToken: Joi.string().required()
  })
};

// Sprint validation schemas
const sprintSchemas = {
  uploadDocuments: Joi.object({
    brandGuidelines: Joi.any().optional(), // File upload - handled by multer
    contactLists: Joi.string().trim().allow('').optional(),
    appDemo: Joi.string().trim().allow('').optional(),
    additionalFiles: Joi.array().optional(),
    notes: Joi.string().trim().max(1000).optional()
  }),

  scheduleMeeting: Joi.object({
    meetingUrl: Joi.string().uri().optional(),
    scheduledAt: Joi.date().iso().required(),
    meetingType: Joi.string().valid('kickoff', 'review', 'demo', 'feedback', 'completion').optional(),
    notes: Joi.string().trim().max(500).optional()
  }),

  selectPackage: Joi.object({
    packageId: Joi.string().required()
  }),

  // Add deliverables validation for sprint creation/update
  createOrUpdate: Joi.object({
    deliverables: Joi.array().items(Joi.string().trim().min(1)).optional()
  })
};

// Questionnaire validation schemas
const questionnaireSchemas = {
  create: Joi.object({
    basicInfo: Joi.object({
      startupName: Joi.string().trim().min(1).max(100).required(),
      taskType: Joi.string().trim().min(1).max(100).required(),
      taskDescription: Joi.string().trim().min(1).max(2000).required(),
      startupStage: Joi.string().valid(
        'pre-seed',
        'seed-a',
        'seed-b'
      ).required(),
      keyGoals: Joi.string().trim().min(1).max(1000).required(),
      timeCommitment: Joi.string().valid('full-time', 'part-time').required()
    }).optional(),

    requirements: Joi.object({
      milestones: Joi.array().items(
        Joi.string().trim()
      ).optional(),
      // customMilestone: Joi.string().trim().max(500).optional(),
      timeline: Joi.string().valid(
        '1-2 weeks',
        '3-4 weeks',
        '1-2 months',
        '3-6 months',
        '6+ months'
      ).optional(),
      budgetRange: Joi.string().trim().optional(),
      // additionalRequirements: Joi.string().trim().max(1000).optional()
    }).optional(),

    serviceSelection: Joi.object({
      selectedService: Joi.string().trim().allow('').optional(),
      // customRequest: Joi.string().trim().max(1000).optional(),
      isCustom: Joi.boolean().optional(),
      urgency: Joi.string().valid('low', 'medium', 'high', 'urgent').optional()
    }).optional()
  }),

  // New schema for existing startups (startupName is optional)
  createForStartup: Joi.object({
    basicInfo: Joi.object({
      startupName: Joi.string().trim().min(1).max(100).optional(),
      taskType: Joi.string().trim().min(1).max(100).required(),
      taskDescription: Joi.string().trim().min(1).max(2000).required(),
      startupStage: Joi.string().valid(
        'pre-seed',
        'seed-a',
        'seed-b'
      ).required(),
      keyGoals: Joi.string().trim().min(1).max(1000).required(),
      timeCommitment: Joi.string().valid('full-time', 'part-time').required()
    }).optional(),

    requirements: Joi.object({
      milestones: Joi.array().items(
        Joi.string().trim()
      ).optional(),
      timeline: Joi.string().valid(
        '1-2 weeks',
        '3-4 weeks',
        '1-2 months',
        '3-6 months',
        '6+ months'
      ).optional(),
      budgetRange: Joi.string().trim().optional()
    }).optional(),

    serviceSelection: Joi.object({
      selectedService: Joi.string().trim().allow('').optional(),
      isCustom: Joi.boolean().optional(),
      urgency: Joi.string().valid('low', 'medium', 'high', 'urgent').optional()
    }).optional()
  }),

  update: Joi.object({
    basicInfo: Joi.object({
      startupName: Joi.string().trim().min(1).max(100).optional(),
      taskType: Joi.string().trim().min(1).max(100).optional(),
      taskDescription: Joi.string().trim().min(1).max(2000).optional(),
      startupStage: Joi.string().valid(
        'pre-seed',
        'seed-a',
        'seed-b'
      ).optional(),
      keyGoals: Joi.string().trim().min(1).max(1000).optional(),
      timeCommitment: Joi.string().valid('full-time', 'part-time').optional()
    }).optional(),

    requirements: Joi.object({
      milestones: Joi.array().items(
        Joi.string().valid(
          'Build MVP',
          'Validate Idea',
          'Market Research',
          'User Testing',
          'Branding & Design',
          'Technical Architecture',
          'Business Plan',
          'Funding Strategy',
          'Go-to-Market Strategy',
          'Team Building'
        )
      ).optional(),
      // customMilestone: Joi.string().trim().max(500).optional(),
      timeline: Joi.string().valid(
        '1-2 weeks',
        '3-4 weeks',
        '1-2 months',
        '3-6 months',
        '6+ months'
      ).optional(),
      budgetRange: Joi.string().valid(
        'Under $5,000',
        '$5,000 - $10,000',
        '$10,000 - $25,000',
        '$25,000 - $50,000',
        '$50,000 - $100,000',
        'Over $100,000'
      ).optional(),
      additionalRequirements: Joi.string().trim().max(1000).optional()
    }).optional(),

    serviceSelection: Joi.object({
      selectedService: Joi.string().trim().optional(),
      // customRequest: Joi.string().trim().max(1000).optional(),
      isCustom: Joi.boolean().optional(),
      urgency: Joi.string().valid('low', 'medium', 'high', 'urgent').optional()
    }).optional()
  }),

  review: Joi.object({
    status: Joi.string().valid('approved', 'rejected').required(),
    adminNotes: Joi.string().trim().max(2000).optional(),
    rejectionReason: Joi.when('status', {
      is: 'rejected',
      then: Joi.string().trim().min(1).max(500).required(),
      otherwise: Joi.forbidden()
    })
  })
};

// Task validation schemas
const taskSchemas = {
  create: Joi.object({
    title: Joi.string().trim().min(1).max(200).required(),
    description: Joi.string().trim().max(5000).optional(),
    taskType: Joi.string().valid(
      'development',
      'design',
      'research',
      'testing',
      'bug',
      'feature',
      'documentation',
      'meeting'
    ).required(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    assigneeId: objectId.optional(),
    sprintId: objectId.optional(),
    boardId: objectId.required(),
    columnId: objectId.required(),
    dueDate: Joi.date().iso().optional(),
    estimatedHours: Joi.number().min(0).max(1000).optional(),
    tags: Joi.array().items(
      Joi.object({
        name: Joi.string().trim().required(),
        color: Joi.string().optional(),
        category: Joi.string().valid('priority', 'type', 'department', 'custom').optional()
      })
    ).optional(),
    progress: Joi.object({
      checklistItems: Joi.array().items(
        Joi.object({
          text: Joi.string().trim().max(200).required(),
          isCompleted: Joi.boolean().optional()
        })
      ).optional()
    }).optional(),
    deliverables: Joi.array().items(Joi.string().trim()).optional()
  }),

  update: Joi.object({
    title: Joi.string().trim().min(1).max(200).optional(),
    description: Joi.string().trim().max(5000).optional(),
    taskType: Joi.string().valid(
      'development',
      'design',
      'research',
      'testing',
      'bug',
      'feature',
      'documentation',
      'meeting'
    ).optional(),
    priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
    status: Joi.string().valid('todo', 'in_progress', 'review', 'done').optional(),
    assigneeId: objectId.optional(),
    dueDate: Joi.date().iso().optional(),
    estimatedHours: Joi.number().min(0).max(1000).optional(),
    progress: Joi.object({
      percentage: Joi.number().min(0).max(100).optional(),
      checklistItems: Joi.array().items(
        Joi.object({
          _id: objectId.optional(),
          text: Joi.string().trim().max(200).required(),
          isCompleted: Joi.boolean().optional()
        })
      ).optional()
    }).optional()
  }),

  move: Joi.object({
    columnId: objectId.required(),
    position: Joi.number().min(0).required(),
    boardId: objectId.optional()
  }),

  timeEntry: Joi.object({
    hours: Joi.number().min(0.1).max(24).required(),
    description: Joi.string().trim().max(500).optional(),
    date: Joi.date().iso().optional()
  }),

  bulkUpdate: Joi.object({
    taskIds: Joi.array().items(objectId).min(1).required(),
    updates: Joi.object({
      assigneeId: objectId.optional(),
      priority: Joi.string().valid('low', 'medium', 'high', 'critical').optional(),
      status: Joi.string().valid('todo', 'in_progress', 'review', 'done').optional(),
      tags: Joi.array().items(
        Joi.object({
          name: Joi.string().trim().required(),
          color: Joi.string().optional()
        })
      ).optional()
    }).required()
  })
};

// Board validation schemas
const boardSchemas = {
  create: Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
    description: Joi.string().trim().max(500).optional(),
    boardType: Joi.string().valid('sprint', 'team', 'project', 'personal').optional(),
    sprintId: objectId.optional(),
    teamId: objectId.optional(),
    visibility: Joi.string().valid('private', 'team', 'public').optional(),
    columns: Joi.array().items(
      Joi.object({
        name: Joi.string().trim().min(1).max(50).required(),
        description: Joi.string().trim().max(200).optional(),
        color: Joi.string().optional(),
        position: Joi.number().min(0).required(),
        wipLimit: Joi.number().min(0).max(100).optional(),
        columnType: Joi.string().valid('todo', 'in_progress', 'review', 'done', 'custom').optional()
      })
    ).optional(),
    settings: Joi.object({
      allowMemberAdd: Joi.boolean().optional(),
      allowTaskCreation: Joi.boolean().optional(),
      enableTimeTracking: Joi.boolean().optional(),
      enableDueDates: Joi.boolean().optional()
    }).optional()
  }),

  update: Joi.object({
    name: Joi.string().trim().min(1).max(100).optional(),
    description: Joi.string().trim().max(500).optional(),
    visibility: Joi.string().valid('private', 'team', 'public').optional(),
    settings: Joi.object({
      allowMemberAdd: Joi.boolean().optional(),
      allowTaskCreation: Joi.boolean().optional(),
      enableTimeTracking: Joi.boolean().optional(),
      enableDueDates: Joi.boolean().optional()
    }).optional()
  }),

  addMember: Joi.object({
    userId: objectId.required(),
    role: Joi.string().valid('viewer', 'member', 'admin').optional()
  }),

  updateMemberRole: Joi.object({
    role: Joi.string().valid('viewer', 'member', 'admin').required()
  }),

  addColumn: Joi.object({
    name: Joi.string().trim().min(1).max(50).required(),
    description: Joi.string().trim().max(200).optional(),
    color: Joi.string().optional(),
    wipLimit: Joi.number().min(0).max(100).optional(),
    columnType: Joi.string().valid('todo', 'in_progress', 'review', 'done', 'custom').optional()
  }),

  updateColumn: Joi.object({
    name: Joi.string().trim().min(1).max(50).optional(),
    description: Joi.string().trim().max(200).optional(),
    color: Joi.string().optional(),
    wipLimit: Joi.number().min(0).max(100).optional()
  }),

  reorderColumns: Joi.object({
    columnOrder: Joi.array().items(objectId).min(1).required()
  })
};

// Message validation schemas
const messageSchemas = {
  send: Joi.object({
    content: Joi.string().trim().min(1).max(5000).required(),
    messageType: Joi.string().valid('text', 'file', 'system').optional(),
    mentions: Joi.array().items(objectId).optional()
  }),

  markAsRead: Joi.object({
    messageIds: Joi.array().items(objectId).min(1).required()
  })
};

// Common query validation schemas
const querySchemas = {
  pagination: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').optional()
  }),

  filters: Joi.object({
    status: Joi.string().optional(),
    priority: Joi.string().optional(),
    assigneeId: objectId.optional(),
    boardId: objectId.optional(),
    sprintId: objectId.optional(),
    search: Joi.string().trim().optional(),
    tags: Joi.string().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  })
};

// Validation middleware factory
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(422).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: errors
        },
        timestamp: new Date().toISOString()
      });
    }

    req[property] = value;
    next();
  };
};

module.exports = {
  userSchemas,
  sprintSchemas,
  questionnaireSchemas,
  taskSchemas,
  boardSchemas,
  messageSchemas,
  querySchemas,
  validate,
  objectId,
  phoneNumber,
  password
};
