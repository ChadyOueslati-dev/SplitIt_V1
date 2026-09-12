const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const auth = require('../controllers/authController');
const groups = require('../controllers/groupController');
const expenses = require('../controllers/expenseController');
const settlements = require('../controllers/settlementController');
const activity = require('../controllers/activityController');
const notifications = require('../controllers/notificationController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Sends a real email per call, so it gets a tighter cap than the general API limiter.
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many reset requests. Try again later.' }
});

function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    return res.status(400).json({ error: result.array()[0].msg, details: result.array() });
  }
  return next();
}

/* ---------- Auth ---------- */
router.post(
  '/auth/register',
  body('name').trim().isLength({ min: 2 }).withMessage('Name needs at least 2 characters'),
  body('email').isEmail().withMessage('Enter a valid email address'),
  body('password').isLength({ min: 8 }).withMessage('Password needs at least 8 characters'),
  validate,
  auth.register
);
router.post(
  '/auth/login',
  body('email').isEmail().withMessage('Enter a valid email address'),
  body('password').notEmpty().withMessage('Enter your password'),
  validate,
  auth.login
);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', requireAuth, auth.me);
router.post(
  '/auth/forgot-password',
  forgotPasswordLimiter,
  body('email').isEmail().withMessage('Enter a valid email address'),
  validate,
  auth.forgotPassword
);
router.post(
  '/auth/reset-password',
  body('email').isEmail().withMessage('Enter a valid email address'),
  body('code').trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage('Enter the 6-digit code'),
  body('password').isLength({ min: 8 }).withMessage('Password needs at least 8 characters'),
  validate,
  auth.resetPassword
);
router.patch(
  '/auth/me',
  requireAuth,
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name needs at least 2 characters'),
  body('defaultCurrency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Use a 3-letter currency code'),
  validate,
  auth.updateProfile
);
router.post(
  '/auth/change-password',
  requireAuth,
  body('currentPassword').notEmpty().withMessage('Enter your current password'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password needs at least 8 characters'),
  validate,
  auth.changePassword
);
router.post(
  '/auth/upgrade',
  requireAuth,
  body('email').isEmail().withMessage('Enter a valid email address'),
  body('password').isLength({ min: 8 }).withMessage('Password needs at least 8 characters'),
  validate,
  auth.upgradeGuest
);
router.delete('/auth/me', requireAuth, auth.deleteAccount);
router.put(
  '/auth/avatar',
  requireAuth,
  body('image').isString().withMessage('Choose an image'),
  validate,
  auth.updateAvatar
);
router.delete('/auth/avatar', requireAuth, auth.removeAvatar);
router.get('/users', requireAuth, auth.listUsers);

/* ---------- Groups ---------- */
router.get('/groups', requireAuth, groups.listGroups);
router.post(
  '/groups',
  requireAuth,
  body('name').trim().isLength({ min: 2 }).withMessage('Give the group a name'),
  validate,
  groups.createGroup
);
router.get('/groups/:id', requireAuth, groups.getGroup);
router.patch('/groups/:id', requireAuth, groups.updateGroup);
router.put(
  '/groups/:id/photo',
  requireAuth,
  body('image').isString().withMessage('Choose an image'),
  validate,
  groups.updateGroupPhoto
);
router.delete('/groups/:id/photo', requireAuth, groups.removeGroupPhoto);
router.post(
  '/groups/:id/members',
  requireAuth,
  body('email').isEmail().withMessage('Enter a valid email address'),
  validate,
  groups.addMember
);
router.get('/groups/:id/balances', requireAuth, groups.getBalances);

/* ---------- Join by group code ---------- */
router.post(
  '/join-requests',
  body('code').trim().isLength({ min: 4 }).withMessage('Enter a group code'),
  validate,
  groups.requestToJoin
);
router.get('/join-requests/mine', requireAuth, groups.myJoinRequests);
router.get('/groups/:id/join-requests', requireAuth, groups.listJoinRequests);
router.post(
  '/groups/:id/join-requests/:requestId/decide',
  requireAuth,
  body('decision').isIn(['approve', 'decline']).withMessage('decision must be approve or decline'),
  validate,
  groups.decideJoinRequest
);
router.post('/groups/:id/join-code/regenerate', requireAuth, groups.regenerateJoinCode);

/* ---------- Expenses ---------- */
router.get('/groups/:groupId/expenses', requireAuth, expenses.listExpenses);
router.post(
  '/groups/:groupId/expenses',
  requireAuth,
  body('description').trim().isLength({ min: 2 }).withMessage('Describe the expense'),
  body('amount').notEmpty().withMessage('Enter an amount'),
  validate,
  expenses.createExpense
);
router.get('/groups/:groupId/expenses/breakdown', requireAuth, expenses.categoryBreakdown);
router.get('/groups/:groupId/expenses/export', requireAuth, expenses.exportExpenses);
router.get('/expenses/:id', requireAuth, expenses.getExpense);
router.patch('/expenses/:id', requireAuth, expenses.updateExpense);
router.delete('/expenses/:id', requireAuth, expenses.deleteExpense);

/* ---------- Settlements ---------- */
router.get('/settlements', requireAuth, settlements.listSettlements);
router.post(
  '/settlements',
  requireAuth,
  body('groupId').notEmpty().withMessage('Choose a group'),
  body('to').notEmpty().withMessage('Choose who you are paying'),
  body('amount').notEmpty().withMessage('Enter an amount'),
  validate,
  settlements.createSettlement
);
router.get('/groups/:groupId/settlement-suggestions', requireAuth, settlements.suggestions);

/* ---------- Activity ---------- */
router.get('/activity', requireAuth, activity.listActivity);
router.get('/dashboard', requireAuth, activity.dashboard);

/* ---------- Notifications ---------- */
router.get('/notifications', requireAuth, notifications.listNotifications);
router.post('/notifications/seen', requireAuth, notifications.markNotificationsSeen);

module.exports = router;
