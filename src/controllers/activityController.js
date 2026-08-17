const Group = require('../models/Group');
const Activity = require('../models/Activity');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const { asyncHandler } = require('../middleware/error');
const { computeBalances } = require('../services/ledger');

const listActivity = asyncHandler(async (req, res) => {
  const { groupId, action, page = 1, limit = 25 } = req.query;

  const groups = await Group.find({ 'members.user': req.user._id }).select('_id');
  const filter = { group: { $in: groups.map((g) => g._id) } };
  if (groupId) filter.group = groupId;
  if (action) filter.action = action;

  const perPage = Math.min(Number(limit) || 25, 100);
  const skip = (Math.max(Number(page), 1) - 1) * perPage;

  const [entries, total] = await Promise.all([
    Activity.find(filter)
      .populate('actor', 'name')
      .populate('group', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(perPage),
    Activity.countDocuments(filter)
  ]);

  res.json({ entries, total, page: Number(page), pages: Math.ceil(total / perPage) || 1 });
});

/** Headline numbers for the dashboard. */
const dashboard = asyncHandler(async (req, res) => {
  const groups = await Group.find({ 'members.user': req.user._id, archived: false }).populate(
    'members.user',
    'name'
  );
  const groupIds = groups.map((g) => g._id);

  const [expenses, settlements, recent] = await Promise.all([
    Expense.find({ group: { $in: groupIds } }),
    Settlement.find({ group: { $in: groupIds } }),
    Activity.find({ group: { $in: groupIds } })
      .populate('actor', 'name')
      .populate('group', 'name')
      .sort({ createdAt: -1 })
      .limit(8)
  ]);

  let youOwe = 0;
  let owedToYou = 0;

  for (const group of groups) {
    const groupExpenses = expenses.filter((e) => String(e.group) === String(group._id));
    const groupSettlements = settlements.filter(
      (s) => String(s.group) === String(group._id) && s.status === 'completed'
    );
    const balances = computeBalances({
      members: group.members.map((m) => m.user._id),
      expenses: groupExpenses,
      settlements: groupSettlements
    });
    const mine = balances.get(String(req.user._id)) || 0;
    if (mine < 0) youOwe += -mine;
    else owedToYou += mine;
  }

  res.json({
    groupCount: groups.length,
    expenseCount: expenses.length,
    totalSpentCents: expenses.reduce((sum, e) => sum + e.amountCents, 0),
    youOweCents: youOwe,
    owedToYouCents: owedToYou,
    settledCount: settlements.filter((s) => s.status === 'completed').length,
    recent
  });
});

module.exports = { listActivity, dashboard };
