const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const Activity = require('../models/Activity');
const { asyncHandler, httpError } = require('../middleware/error');
const { loadGroupForUser } = require('./groupController');
const { computeBalances, simplifyDebts } = require('../services/ledger');
const { charge, reference } = require('../services/payments');
const { toCents } = require('../services/money');

const listSettlements = asyncHandler(async (req, res) => {
  const { groupId, status, page = 1, limit = 20 } = req.query;

  const groups = await Group.find({ 'members.user': req.user._id }).select('_id');
  const filter = { group: { $in: groups.map((g) => g._id) } };
  if (groupId) filter.group = groupId;
  if (status) filter.status = status;

  const perPage = Math.min(Number(limit) || 20, 100);
  const skip = (Math.max(Number(page), 1) - 1) * perPage;

  const [settlements, total] = await Promise.all([
    Settlement.find(filter)
      .populate('from', 'name')
      .populate('to', 'name')
      .populate('group', 'name currency')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage),
    Settlement.countDocuments(filter)
  ]);

  res.json({ settlements, total, page: Number(page), pages: Math.ceil(total / perPage) || 1 });
});

/**
 * Runs a payment against the mock gateway and records the result. The transfer
 * must match a debt the ledger actually shows, so nobody can settle a debt that
 * is not owed.
 */
const createSettlement = asyncHandler(async (req, res) => {
  const { groupId, to, amount, method = 'mock-card', cardNumber } = req.body;
  const group = await loadGroupForUser(groupId, req.user._id);

  if (!group.hasMember(to)) throw httpError(400, 'The recipient must be a group member');
  if (String(to) === String(req.user._id)) throw httpError(400, 'You cannot pay yourself');

  const amountCents = toCents(amount);
  if (amountCents < 1) throw httpError(400, 'Enter an amount greater than zero');

  const [expenses, completed] = await Promise.all([
    Expense.find({ group: group._id }),
    Settlement.find({ group: group._id, status: 'completed' })
  ]);

  const balances = computeBalances({
    members: group.members.map((m) => m.user._id),
    expenses,
    settlements: completed
  });

  const owed = -(balances.get(String(req.user._id)) || 0);
  if (owed <= 0) throw httpError(400, 'You have nothing outstanding in this group');
  if (amountCents > owed) {
    throw httpError(400, `You only owe ${(owed / 100).toFixed(2)} ${group.currency} in this group`);
  }

  const settlement = await Settlement.create({
    group: group._id,
    from: req.user._id,
    to,
    amountCents,
    currency: group.currency,
    method,
    status: 'processing',
    reference: reference()
  });

  await Activity.record({
    group: group._id,
    actor: req.user._id,
    action: 'settlement.initiated',
    summary: `${req.user.name} started a payment of ${(amountCents / 100).toFixed(2)} ${group.currency}`,
    meta: { settlement: settlement._id }
  });

  const result = await charge({ amountCents, currency: group.currency, cardNumber });

  if (result.ok) {
    settlement.status = 'completed';
    settlement.reference = result.reference;
    settlement.settledAt = new Date();
  } else {
    settlement.status = 'failed';
    settlement.failureReason = result.reason;
  }
  await settlement.save();
  await settlement.populate([{ path: 'from', select: 'name' }, { path: 'to', select: 'name' }]);

  await Activity.record({
    group: group._id,
    actor: req.user._id,
    action: result.ok ? 'settlement.completed' : 'settlement.failed',
    summary: result.ok
      ? `${settlement.from.name} paid ${settlement.to.name} ${(amountCents / 100).toFixed(2)} ${group.currency}`
      : `Payment from ${settlement.from.name} failed: ${result.reason}`,
    meta: { settlement: settlement._id, reference: settlement.reference }
  });

  res.status(result.ok ? 201 : 402).json({ settlement });
});

/** The suggested transfers for a group, straight from the simplification pass. */
const suggestions = asyncHandler(async (req, res) => {
  const group = await loadGroupForUser(req.params.groupId, req.user._id);

  const [expenses, completed] = await Promise.all([
    Expense.find({ group: group._id }),
    Settlement.find({ group: group._id, status: 'completed' })
  ]);

  const balances = computeBalances({
    members: group.members.map((m) => m.user._id),
    expenses,
    settlements: completed
  });

  const nameOf = new Map(group.members.map((m) => [String(m.user._id), m.user.name]));
  const transfers = simplifyDebts(balances).map((t) => ({
    ...t,
    fromName: nameOf.get(t.from),
    toName: nameOf.get(t.to),
    isYours: String(t.from) === String(req.user._id)
  }));

  res.json({ currency: group.currency, transfers });
});

module.exports = { listSettlements, createSettlement, suggestions };
