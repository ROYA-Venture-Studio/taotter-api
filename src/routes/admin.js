const express = require('express');
const Admin = require('../models/Admin');
const { authenticateAdmin } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

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

module.exports = router;
