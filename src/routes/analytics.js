const express = require('express');
const mongoose = require('mongoose');
const Startup = require('../models/Startup');
const Admin = require('../models/Admin');
const Questionnaire = require('../models/Questionnaire');
const Sprint = require('../models/Sprint');
const Board = require('../models/Board');
const Task = require('../models/Task');
const { AppError } = require('../middleware/errorHandler');
const { authenticateAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Helper function to get date range
function getDateRange(period) {
  const endDate = new Date();
  let startDate;
  
  switch (period) {
    case '7d':
      startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  
  return { startDate, endDate };
}

// @route   GET /api/analytics/dashboard
// @desc    Get comprehensive dashboard analytics
// @access  Private (Admin)
router.get('/dashboard', authenticateAdmin, async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    const { startDate, endDate } = getDateRange(period);
    
    // Get all key metrics
    const [
      totalStartups,
      totalQuestionnaires,
      totalSprints,
      totalBoards,
      totalTasks,
      newStartupsThisPeriod,
      activeSprintsCount,
      completedSprintsCount,
      overdueTasks,
      questionnairesByStatus,
      sprintsByStatus,
      tasksByStatus,
      tasksByPriority,
      recentActivity,
      topPerformingStartups,
      teamUtilization
    ] = await Promise.all([
      // Total counts
      Startup.countDocuments(),
      Questionnaire.countDocuments(),
      Sprint.countDocuments(),
      Board.countDocuments(),
      Task.countDocuments({ isArchived: false }),
      
      // New startups in period
      Startup.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      }),
      
      // Sprint status counts
      Sprint.countDocuments({ status: { $in: ['in_progress', 'package_selected', 'documents_submitted'] } }),
      Sprint.countDocuments({ status: 'completed' }),
      
      // Overdue tasks
      Task.countDocuments({
        dueDate: { $lt: new Date() },
        status: { $nin: ['completed', 'cancelled'] },
        isArchived: false
      }),
      
      // Questionnaires by status
      Questionnaire.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      // Sprints by status
      Sprint.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      // Tasks by status
      Task.aggregate([
        { $match: { isArchived: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      
      // Tasks by priority
      Task.aggregate([
        { $match: { isArchived: false } },
        { $group: { _id: '$priority', count: { $sum: 1 } } }
      ]),
      
      // Recent activity (last 20 activities from tasks)
      Task.aggregate([
        { $match: { 'activityLog.timestamp': { $gte: startDate } } },
        { $unwind: '$activityLog' },
        { $match: { 'activityLog.timestamp': { $gte: startDate } } },
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
            taskTitle: '$title',
            user: { $arrayElemAt: ['$user', 0] }
          }
        }
      ]),
      
      // Top performing startups (by completed sprints)
      Sprint.aggregate([
        { $match: { status: 'completed' } },
        {
          $lookup: {
            from: 'questionnaires',
            localField: 'questionnaireId',
            foreignField: '_id',
            as: 'questionnaire'
          }
        },
        {
          $lookup: {
            from: 'startups',
            localField: 'questionnaire.startupId',
            foreignField: '_id',
            as: 'startup'
          }
        },
        {
          $group: {
            _id: '$startup._id',
            completedSprints: { $sum: 1 },
            startup: { $first: { $arrayElemAt: ['$startup', 0] } }
          }
        },
        { $sort: { completedSprints: -1 } },
        { $limit: 10 }
      ]),
      
      // Team utilization (tasks assigned to each admin)
      Task.aggregate([
        { 
          $match: { 
            assigneeId: { $exists: true },
            status: { $nin: ['completed', 'cancelled'] },
            isArchived: false
          }
        },
        {
          $group: {
            _id: '$assigneeId',
            activeTasks: { $sum: 1 },
            totalEstimatedHours: { $sum: '$estimatedHours' }
          }
        },
        {
          $lookup: {
            from: 'admins',
            localField: '_id',
            foreignField: '_id',
            as: 'admin'
          }
        },
        { $sort: { activeTasks: -1 } }
      ])
    ]);
    
    // Calculate growth rates
    const previousPeriodStart = new Date(startDate.getTime() - (endDate.getTime() - startDate.getTime()));
    const previousPeriodStartups = await Startup.countDocuments({
      createdAt: { $gte: previousPeriodStart, $lt: startDate }
    });
    
    const startupGrowthRate = previousPeriodStartups > 0 
      ? ((newStartupsThisPeriod - previousPeriodStartups) / previousPeriodStartups) * 100 
      : 100;
    
    // Format response data
    const dashboardData = {
      summary: {
        totalStartups,
        totalQuestionnaires,
        totalSprints,
        totalBoards,
        totalTasks,
        newStartupsThisPeriod,
        startupGrowthRate: Math.round(startupGrowthRate * 100) / 100,
        activeSprintsCount,
        completedSprintsCount,
        overdueTasks,
        period: {
          start: startDate,
          end: endDate,
          label: period
        }
      },
      
      statusDistributions: {
        questionnaires: questionnairesByStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        sprints: sprintsByStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        tasks: tasksByStatus.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        taskPriorities: tasksByPriority.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {})
      },
      
      recentActivity: recentActivity.map(activity => ({
        action: activity.action,
        description: activity.description,
        timestamp: activity.timestamp,
        taskTitle: activity.taskTitle,
        user: activity.user ? {
          id: activity.user._id,
          name: `${activity.user.profile.firstName} ${activity.user.profile.lastName}`
        } : null
      })),
      
      topPerformingStartups: topPerformingStartups.map(item => ({
        startupId: item._id,
        completedSprints: item.completedSprints,
        startupName: item.startup ? item.startup.profile.companyName : 'Unknown',
        founderName: item.startup ? `${item.startup.profile.founderFirstName} ${item.startup.profile.founderLastName}` : 'Unknown'
      })),
      
      teamUtilization: teamUtilization.map(item => ({
        adminId: item._id,
        activeTasks: item.activeTasks,
        totalEstimatedHours: item.totalEstimatedHours || 0,
        admin: item.admin[0] ? {
          name: `${item.admin[0].profile.firstName} ${item.admin[0].profile.lastName}`,
          department: item.admin[0].profile.department,
          role: item.admin[0].role
        } : null
      }))
    };
    
    res.json({
      success: true,
      data: dashboardData
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/analytics/startup-onboarding
// @desc    Get startup onboarding funnel analytics
// @access  Private (Admin)
router.get('/startup-onboarding', authenticateAdmin, async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    const { startDate, endDate } = getDateRange(period);
    
    const [
      totalSignups,
      questionnairesSubmitted,
      questionnairesApproved,
      sprintsCreated,
      packagesSelected,
      documentsSubmitted,
      meetingsScheduled,
      sprintsStarted,
      conversionByStep,
      averageTimeToComplete
    ] = await Promise.all([
      // Total signups in period
      Startup.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      }),
      
      // Questionnaires submitted
      Questionnaire.countDocuments({
        submittedAt: { $gte: startDate, $lte: endDate }
      }),
      
      // Questionnaires approved
      Questionnaire.countDocuments({
        reviewedAt: { $gte: startDate, $lte: endDate },
        status: 'approved'
      }),
      
      // Sprints created
      Sprint.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate }
      }),
      
      // Packages selected
      Sprint.countDocuments({
        'timeline.packageSelectedAt': { $gte: startDate, $lte: endDate }
      }),
      
      // Documents submitted
      Sprint.countDocuments({
        'timeline.documentsSubmittedAt': { $gte: startDate, $lte: endDate }
      }),
      
      // Meetings scheduled
      Sprint.countDocuments({
        'timeline.meetingScheduledAt': { $gte: startDate, $lte: endDate }
      }),
      
      // Sprints started
      Sprint.countDocuments({
        'timeline.startedAt': { $gte: startDate, $lte: endDate }
      }),
      
      // Conversion rates by onboarding step
      Startup.aggregate([
        {
          $group: {
            _id: '$onboarding.currentStep',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Average time to complete onboarding
      Sprint.aggregate([
        {
          $match: {
            'timeline.startedAt': { $exists: true },
            createdAt: { $gte: startDate }
          }
        },
        {
          $lookup: {
            from: 'questionnaires',
            localField: 'questionnaireId',
            foreignField: '_id',
            as: 'questionnaire'
          }
        },
        {
          $lookup: {
            from: 'startups',
            localField: 'questionnaire.startupId',
            foreignField: '_id',
            as: 'startup'
          }
        },
        {
          $group: {
            _id: null,
            avgOnboardingTime: {
              $avg: {
                $subtract: ['$timeline.startedAt', { $arrayElemAt: ['$startup.createdAt', 0] }]
              }
            }
          }
        }
      ])
    ]);
    
    // Calculate conversion rates
    const funnelData = {
      signups: totalSignups,
      questionnairesSubmitted,
      questionnairesApproved,
      sprintsCreated,
      packagesSelected,
      documentsSubmitted,
      meetingsScheduled,
      sprintsStarted
    };
    
    const conversionRates = {
      signupToQuestionnaire: totalSignups > 0 ? (questionnairesSubmitted / totalSignups) * 100 : 0,
      questionnaireToApproval: questionnairesSubmitted > 0 ? (questionnairesApproved / questionnairesSubmitted) * 100 : 0,
      approvalToSprint: questionnairesApproved > 0 ? (sprintsCreated / questionnairesApproved) * 100 : 0,
      sprintToPackage: sprintsCreated > 0 ? (packagesSelected / sprintsCreated) * 100 : 0,
      packageToDocuments: packagesSelected > 0 ? (documentsSubmitted / packagesSelected) * 100 : 0,
      documentsToMeeting: documentsSubmitted > 0 ? (meetingsScheduled / documentsSubmitted) * 100 : 0,
      meetingToStart: meetingsScheduled > 0 ? (sprintsStarted / meetingsScheduled) * 100 : 0,
      overallConversion: totalSignups > 0 ? (sprintsStarted / totalSignups) * 100 : 0
    };
    
    res.json({
      success: true,
      data: {
        period: { start: startDate, end: endDate, label: period },
        funnel: funnelData,
        conversionRates,
        stepDistribution: conversionByStep.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        averageOnboardingTime: averageTimeToComplete[0] ? 
          Math.round(averageTimeToComplete[0].avgOnboardingTime / (1000 * 60 * 60 * 24)) : 0 // Convert to days
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/analytics/project-performance
// @desc    Get project/sprint performance analytics
// @access  Private (Admin)
router.get('/project-performance', authenticateAdmin, async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    const { startDate, endDate } = getDateRange(period);
    
    const [
      completionRates,
      averageProjectDuration,
      onTimeDelivery,
      budgetUtilization,
      clientSatisfaction,
      teamProductivity,
      projectsByType,
      monthlyTrends
    ] = await Promise.all([
      // Sprint completion rates
      Sprint.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Average project duration
      Sprint.aggregate([
        {
          $match: {
            status: 'completed',
            startDate: { $exists: true },
            endDate: { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            avgDuration: {
              $avg: { $subtract: ['$endDate', '$startDate'] }
            },
            avgEstimatedDuration: { $avg: '$estimatedDuration' }
          }
        }
      ]),
      
      // On-time delivery rate
      Sprint.aggregate([
        {
          $match: {
            status: 'completed',
            endDate: { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            totalCompleted: { $sum: 1 },
            onTime: {
              $sum: {
                $cond: [
                  { $lte: ['$endDate', { $add: ['$startDate', { $multiply: ['$estimatedDuration', 24 * 60 * 60 * 1000] }] }] },
                  1,
                  0
                ]
              }
            }
          }
        }
      ]),
      
      // Budget utilization
      Sprint.aggregate([
        {
          $match: {
            'budget.allocated': { $exists: true },
            'budget.spent': { $exists: true }
          }
        },
        {
          $group: {
            _id: null,
            totalAllocated: { $sum: '$budget.allocated' },
            totalSpent: { $sum: '$budget.spent' },
            projects: { $sum: 1 }
          }
        }
      ]),
      
      // Client satisfaction (from feedback)
      Sprint.aggregate([
        { $unwind: '$clientFeedback' },
        {
          $group: {
            _id: '$clientFeedback.category',
            avgRating: { $avg: '$clientFeedback.rating' },
            count: { $sum: 1 }
          }
        }
      ]),
      
      // Team productivity (tasks completed per admin)
      Task.aggregate([
        {
          $match: {
            status: 'completed',
            completedAt: { $gte: startDate, $lte: endDate },
            assigneeId: { $exists: true }
          }
        },
        {
          $group: {
            _id: '$assigneeId',
            completedTasks: { $sum: 1 },
            totalHours: { $sum: '$timeTracking.totalHours' }
          }
        },
        {
          $lookup: {
            from: 'admins',
            localField: '_id',
            foreignField: '_id',
            as: 'admin'
          }
        }
      ]),
      
      // Projects by type
      Sprint.aggregate([
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            avgDuration: { $avg: '$estimatedDuration' },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            }
          }
        }
      ]),
      
      // Monthly completion trends
      Sprint.aggregate([
        {
          $match: {
            status: 'completed',
            endDate: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$endDate' },
              month: { $month: '$endDate' }
            },
            completed: { $sum: 1 }
          }
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } }
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        period: { start: startDate, end: endDate, label: period },
        
        completionRates: completionRates.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        
        averageDuration: {
          actualDays: averageProjectDuration[0] ? 
            Math.round(averageProjectDuration[0].avgDuration / (1000 * 60 * 60 * 24)) : 0,
          estimatedDays: averageProjectDuration[0] ? 
            Math.round(averageProjectDuration[0].avgEstimatedDuration) : 0
        },
        
        onTimeDeliveryRate: onTimeDelivery[0] ? 
          Math.round((onTimeDelivery[0].onTime / onTimeDelivery[0].totalCompleted) * 100) : 0,
        
        budgetUtilization: budgetUtilization[0] ? {
          totalAllocated: budgetUtilization[0].totalAllocated,
          totalSpent: budgetUtilization[0].totalSpent,
          utilizationRate: Math.round((budgetUtilization[0].totalSpent / budgetUtilization[0].totalAllocated) * 100),
          projects: budgetUtilization[0].projects
        } : null,
        
        clientSatisfaction: clientSatisfaction.reduce((acc, item) => {
          acc[item._id] = {
            avgRating: Math.round(item.avgRating * 10) / 10,
            count: item.count
          };
          return acc;
        }, {}),
        
        teamProductivity: teamProductivity.map(item => ({
          adminId: item._id,
          completedTasks: item.completedTasks,
          totalHours: item.totalHours || 0,
          admin: item.admin[0] ? {
            name: `${item.admin[0].profile.firstName} ${item.admin[0].profile.lastName}`,
            department: item.admin[0].profile.department
          } : null
        })),
        
        projectsByType: projectsByType.map(item => ({
          type: item._id,
          count: item.count,
          avgDuration: Math.round(item.avgDuration),
          completionRate: item.count > 0 ? Math.round((item.completed / item.count) * 100) : 0
        })),
        
        monthlyTrends: monthlyTrends.map(item => ({
          year: item._id.year,
          month: item._id.month,
          completed: item.completed
        }))
      }
    });
    
  } catch (error) {
    next(error);
  }
});

// @route   GET /api/analytics/admin-workload
// @desc    Get admin workload and performance analytics
// @access  Private (Admin)
router.get('/admin-workload', authenticateAdmin, async (req, res, next) => {
  try {
    const { period = '30d' } = req.query;
    const { startDate, endDate } = getDateRange(period);
    
    const [
      adminWorkloads,
      departmentUtilization,
      taskCompletionRates,
      responseTimeMetrics
    ] = await Promise.all([
      // Individual admin workloads
      Admin.aggregate([
        {
          $lookup: {
            from: 'tasks',
            let: { adminId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$assigneeId', '$$adminId'] },
                  isArchived: false
                }
              }
            ],
            as: 'activeTasks'
          }
        },
        {
          $lookup: {
            from: 'tasks',
            let: { adminId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$assigneeId', '$$adminId'] },
                  status: 'completed',
                  completedAt: { $gte: startDate, $lte: endDate }
                }
              }
            ],
            as: 'completedTasks'
          }
        },
        {
          $lookup: {
            from: 'sprints',
            let: { adminId: '$_id' },
            pipeline: [
              {
                $match: {
                  $expr: { $eq: ['$assignedTeam.teamLead', '$$adminId'] },
                  status: { $in: ['in_progress', 'package_selected', 'documents_submitted'] }
                }
              }
            ],
            as: 'leadingSprints'
          }
        },
        {
          $project: {
            profile: 1,
            role: 1,
            isActive: 1,
            activeTasksCount: { $size: '$activeTasks' },
            completedTasksCount: { $size: '$completedTasks' },
            leadingSprintsCount: { $size: '$leadingSprints' },
            totalEstimatedHours: {
              $sum: '$activeTasks.estimatedHours'
            },
            totalTimeLogged: {
              $sum: '$completedTasks.timeTracking.totalHours'
            }
          }
        }
      ]),
      
      // Department utilization
      Admin.aggregate([
        {
          $group: {
            _id: '$profile.department',
            adminCount: { $sum: 1 },
            activeAdmins: {
              $sum: { $cond: ['$isActive', 1, 0] }
            }
          }
        },
        {
          $lookup: {
            from: 'tasks',
            let: { dept: '$_id' },
            pipeline: [
              {
                $lookup: {
                  from: 'admins',
                  localField: 'assigneeId',
                  foreignField: '_id',
                  as: 'assignee'
                }
              },
              {
                $match: {
                  $expr: {
                    $eq: [{ $arrayElemAt: ['$assignee.profile.department', 0] }, '$$dept']
                  },
                  isArchived: false
                }
              }
            ],
            as: 'departmentTasks'
          }
        },
        {
          $project: {
            department: '$_id',
            adminCount: 1,
            activeAdmins: 1,
            activeTasks: { $size: '$departmentTasks' },
            utilization: {
              $cond: [
                { $gt: ['$adminCount', 0] },
                { $divide: [{ $size: '$departmentTasks' }, '$adminCount'] },
                0
              ]
            }
          }
        }
      ]),
      
      // Task completion rates by admin
      Task.aggregate([
        {
          $match: {
            assigneeId: { $exists: true },
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: '$assigneeId',
            totalAssigned: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            overdue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $lt: ['$dueDate', new Date()] },
                      { $nin: ['$status', ['completed', 'cancelled']] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        },
        {
          $lookup: {
            from: 'admins',
            localField: '_id',
            foreignField: '_id',
            as: 'admin'
          }
        }
      ]),
      
      // Response time metrics (time from task creation to first action)
      Task.aggregate([
        {
          $match: {
            assigneeId: { $exists: true },
            'activityLog.1': { $exists: true }, // At least 2 activities (created + first action)
            createdAt: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $project: {
            assigneeId: 1,
            createdAt: 1,
            firstAction: { $arrayElemAt: ['$activityLog', 1] },
            responseTime: {
              $subtract: [
                { $arrayElemAt: ['$activityLog.timestamp', 1] },
                '$createdAt'
              ]
            }
          }
        },
        {
          $group: {
            _id: '$assigneeId',
            avgResponseTime: { $avg: '$responseTime' },
            tasks: { $sum: 1 }
          }
        },
        {
          $lookup: {
            from: 'admins',
            localField: '_id',
            foreignField: '_id',
            as: 'admin'
          }
        }
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        period: { start: startDate, end: endDate, label: period },
        
        adminWorkloads: adminWorkloads.map(admin => ({
          adminId: admin._id,
          name: `${admin.profile.firstName} ${admin.profile.lastName}`,
          department: admin.profile.department,
          role: admin.role,
          isActive: admin.isActive,
          workload: {
            activeTasks: admin.activeTasksCount,
            completedTasks: admin.completedTasksCount,
            leadingSprints: admin.leadingSprintsCount,
            estimatedHours: admin.totalEstimatedHours || 0,
            timeLogged: admin.totalTimeLogged || 0
          }
        })),
        
        departmentUtilization: departmentUtilization.map(dept => ({
          department: dept.department,
          adminCount: dept.adminCount,
          activeAdmins: dept.activeAdmins,
          activeTasks: dept.activeTasks,
          tasksPerAdmin: Math.round(dept.utilization * 10) / 10
        })),
        
        taskCompletionRates: taskCompletionRates.map(item => ({
          adminId: item._id,
          admin: item.admin[0] ? {
            name: `${item.admin[0].profile.firstName} ${item.admin[0].profile.lastName}`,
            department: item.admin[0].profile.department
          } : null,
          totalAssigned: item.totalAssigned,
          completed: item.completed,
          overdue: item.overdue,
          completionRate: item.totalAssigned > 0 ? 
            Math.round((item.completed / item.totalAssigned) * 100) : 0,
          overdueRate: item.totalAssigned > 0 ? 
            Math.round((item.overdue / item.totalAssigned) * 100) : 0
        })),
        
        responseTimeMetrics: responseTimeMetrics.map(item => ({
          adminId: item._id,
          admin: item.admin[0] ? {
            name: `${item.admin[0].profile.firstName} ${item.admin[0].profile.lastName}`,
            department: item.admin[0].profile.department
          } : null,
          avgResponseTimeHours: Math.round((item.avgResponseTime / (1000 * 60 * 60)) * 10) / 10,
          tasksSampled: item.tasks
        }))
      }
    });
    
  } catch (error) {
    next(error);
  }
});

module.exports = router;
