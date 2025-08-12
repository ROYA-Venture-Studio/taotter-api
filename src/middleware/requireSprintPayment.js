const Sprint = require('../models/Sprint');

/**
 * Middleware to restrict admin board access unless sprint payment is confirmed.
 * Expects req.params.sprintId to be set.
 */
module.exports = async function requireSprintPayment(req, res, next) {
  try {
    const sprintId = req.params.sprintId;
    if (!sprintId) {
      return res.status(400).json({ code: 'SPRINT_ID_REQUIRED', message: 'Sprint ID is required.' });
    }
    const sprint = await Sprint.findById(sprintId);
    if (!sprint) {
      return res.status(404).json({ code: 'SPRINT_NOT_FOUND', message: 'Sprint not found.' });
    }
    if (sprint.selectedPackagePaymentStatus !== 'paid') {
      return res.status(403).json({
        code: 'PAYMENT_REQUIRED',
        message: 'Board cannot be accessed until payment is confirmed.'
      });
    }
    next();
  } catch (err) {
    next(err);
  }
};
