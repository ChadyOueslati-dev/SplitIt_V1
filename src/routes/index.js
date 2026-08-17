const express = require('express');
const { body, validationResult } = require('express-validator');

const auth = require('../controllers/authController');
const groups = require('../controllers/groupController');
const expenses = require('../controllers/expenseController');
const settlements = require('../controllers/settlementController');
const activity = require('../controllers/activityController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

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
router.post(
  '/groups/:id/members',
  requireAuth,
  body('email').isEmail().withMessage('Enter a valid email address'),
  validate,
  groups.addMember
);
router.get('/groups/:id/balances', requireAuth, groups.getBalances);

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

module.exports = router;
