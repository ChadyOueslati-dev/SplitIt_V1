const Expense = require('../models/Expense');
const Activity = require('../models/Activity');
const { asyncHandler, httpError } = require('../middleware/error');
const { loadGroupForUser } = require('./groupController');
const { toCents, splitEqually, splitByWeight } = require('../services/money');

/** Even split across the chosen participants, or the whole group if none were chosen. */
function buildEqualShares({ amountCents, participants, memberIds }) {
  const ids = participants && participants.length ? participants : memberIds;
  const parts = splitEqually(amountCents, ids.length);
  return ids.map((user, i) => ({ user, amountCents: parts[i], weight: 1 }));
}

const listExpenses = asyncHandler(async (req, res) => {
  const group = await loadGroupForUser(req.params.groupId, req.user._id);
  const { q = '', category, paidBy, from, to, min, max, sort = '-spentAt', page = 1, limit = 20 } = req.query;

  const filter = { group: group._id };
  if (category) filter.category = category;
  if (paidBy) filter.paidBy = paidBy;
  if (q.trim()) {
    filter.$or = [{ description: new RegExp(q.trim(), 'i') }, { note: new RegExp(q.trim(), 'i') }];
  }
  if (from || to) {
    filter.spentAt = {};
    if (from) filter.spentAt.$gte = new Date(from);
    if (to) filter.spentAt.$lte = new Date(to);
  }
  if (min || max) {
    filter.amountCents = {};
    if (min) filter.amountCents.$gte = toCents(min);
    if (max) filter.amountCents.$lte = toCents(max);
  }

  const perPage = Math.min(Number(limit) || 20, 100);
  const skip = (Math.max(Number(page), 1) - 1) * perPage;

  const [expenses, total] = await Promise.all([
    Expense.find(filter)
      .populate('paidBy', 'name email')
      .populate('shares.user', 'name email')
      .sort(sort)
      .skip(skip)
      .limit(perPage),
    Expense.countDocuments(filter)
  ]);

  res.json({ expenses, total, page: Number(page), pages: Math.ceil(total / perPage) || 1 });
});

const createExpense = asyncHandler(async (req, res) => {
  const group = await loadGroupForUser(req.params.groupId, req.user._id);
  const {
    description,
    amount,
    category = 'other',
    paidBy,
    splitMethod = 'equal',
    participants = [],
    shares = [],
    spentAt,
    note = ''
  } = req.body;

  const amountCents = toCents(amount);
  if (amountCents < 1) throw httpError(400, 'Enter an amount greater than zero');

  const memberIds = group.members.map((m) => String(m.user._id));
  const payer = String(paidBy || req.user._id);
  if (!memberIds.includes(payer)) throw httpError(400, 'The payer must be a group member');

  for (const id of participants) {
    if (!memberIds.includes(String(id))) throw httpError(400, 'Every participant must be a member');
  }

  let finalShares;
  if (splitMethod === 'exact') {
    if (!shares.length) throw httpError(400, 'Add at least one share for an exact split');
    finalShares = shares.map((s) => ({ user: s.user, amountCents: toCents(s.amount), weight: 1 }));
  } else if (splitMethod === 'shares') {
    const ids = shares.length ? shares.map((s) => s.user) : participants;
    const weights = shares.length ? shares.map((s) => Number(s.weight) || 1) : ids.map(() => 1);
    const parts = splitByWeight(amountCents, weights);
    finalShares = ids.map((user, i) => ({ user, amountCents: parts[i], weight: weights[i] }));
  } else {
    finalShares = buildEqualShares({ amountCents, participants, memberIds });
  }

  const expense = await Expense.create({
    group: group._id,
    description,
    category,
    amountCents,
    currency: group.currency,
    paidBy: payer,
    splitMethod,
    shares: finalShares,
    spentAt: spentAt ? new Date(spentAt) : new Date(),
    note,
    createdBy: req.user._id
  });

  await expense.populate([{ path: 'paidBy', select: 'name' }, { path: 'shares.user', select: 'name' }]);

  await Activity.record({
    group: group._id,
    actor: req.user._id,
    action: 'expense.created',
    summary: `${req.user.name} added "${expense.description}" for ${(amountCents / 100).toFixed(2)} ${group.currency}`,
    meta: { expense: expense._id, amountCents }
  });

  res.status(201).json({ expense });
});

const getExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id)
    .populate('paidBy', 'name email')
    .populate('shares.user', 'name email');
  if (!expense) throw httpError(404, 'That expense does not exist');
  await loadGroupForUser(expense.group, req.user._id);
  res.json({ expense });
});

const updateExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw httpError(404, 'That expense does not exist');
  const group = await loadGroupForUser(expense.group, req.user._id);

  if (req.body.description !== undefined) expense.description = req.body.description;
  if (req.body.category !== undefined) expense.category = req.body.category;
  if (req.body.note !== undefined) expense.note = req.body.note;
  if (req.body.spentAt !== undefined) expense.spentAt = new Date(req.body.spentAt);
  if (req.body.paidBy !== undefined) expense.paidBy = req.body.paidBy;

  // Changing the amount rebalances the existing shares with the same method.
  if (req.body.amount !== undefined) {
    const amountCents = toCents(req.body.amount);
    if (amountCents < 1) throw httpError(400, 'Enter an amount greater than zero');
    const ids = expense.shares.map((s) => s.user);
    const parts = splitEqually(amountCents, ids.length);
    expense.amountCents = amountCents;
    expense.shares = ids.map((user, i) => ({ user, amountCents: parts[i], weight: 1 }));
  }

  await expense.save();
  await expense.populate([{ path: 'paidBy', select: 'name' }, { path: 'shares.user', select: 'name' }]);

  await Activity.record({
    group: group._id,
    actor: req.user._id,
    action: 'expense.updated',
    summary: `${req.user.name} edited "${expense.description}"`,
    meta: { expense: expense._id }
  });

  res.json({ expense });
});

const deleteExpense = asyncHandler(async (req, res) => {
  const expense = await Expense.findById(req.params.id);
  if (!expense) throw httpError(404, 'That expense does not exist');
  const group = await loadGroupForUser(expense.group, req.user._id);

  await expense.deleteOne();
  await Activity.record({
    group: group._id,
    actor: req.user._id,
    action: 'expense.deleted',
    summary: `${req.user.name} deleted "${expense.description}"`
  });

  res.json({ ok: true });
});

/** Category totals for the dashboard chart. */
const categoryBreakdown = asyncHandler(async (req, res) => {
  const group = await loadGroupForUser(req.params.groupId, req.user._id);
  const rows = await Expense.aggregate([
    { $match: { group: group._id } },
    { $group: { _id: '$category', totalCents: { $sum: '$amountCents' }, count: { $sum: 1 } } },
    { $sort: { totalCents: -1 } }
  ]);
  res.json({ currency: group.currency, breakdown: rows });
});

module.exports = {
  listExpenses,
  createExpense,
  getExpense,
  updateExpense,
  deleteExpense,
  categoryBreakdown
};
