const Group = require('../models/Group');
const User = require('../models/User');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const Activity = require('../models/Activity');
const { asyncHandler, httpError } = require('../middleware/error');
const { computeBalances, simplifyDebts, summarise } = require('../services/ledger');

async function loadGroupForUser(groupId, userId) {
  const group = await Group.findById(groupId).populate('members.user', 'name email');
  if (!group) throw httpError(404, 'That group does not exist');
  if (!group.hasMember(userId)) throw httpError(403, 'You are not a member of that group');
  return group;
}

const listGroups = asyncHandler(async (req, res) => {
  const { q = '', category, archived = 'false' } = req.query;

  const filter = { 'members.user': req.user._id, archived: archived === 'true' };
  if (category) filter.category = category;
  if (q.trim()) {
    filter.$or = [
      { name: new RegExp(q.trim(), 'i') },
      { description: new RegExp(q.trim(), 'i') }
    ];
  }

  const groups = await Group.find(filter).populate('members.user', 'name email').sort({ updatedAt: -1 });

  // Attach the signed-in user's net position in each group.
  const withBalance = await Promise.all(
    groups.map(async (group) => {
      const [expenses, settlements] = await Promise.all([
        Expense.find({ group: group._id }),
        Settlement.find({ group: group._id, status: 'completed' })
      ]);
      const balances = computeBalances({
        members: group.members.map((m) => m.user._id),
        expenses,
        settlements
      });
      return {
        ...group.toObject(),
        expenseCount: expenses.length,
        yourBalanceCents: balances.get(String(req.user._id)) || 0
      };
    })
  );

  res.json({ groups: withBalance });
});

const createGroup = asyncHandler(async (req, res) => {
  const { name, description = '', category = 'other', currency = 'EUR', memberEmails = [] } = req.body;

  const members = [{ user: req.user._id, role: 'owner' }];
  const seen = new Set([String(req.user._id)]);
  const unknown = [];

  for (const email of memberEmails) {
    const found = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!found) {
      unknown.push(email);
      continue;
    }
    if (!seen.has(String(found._id))) {
      members.push({ user: found._id, role: 'member' });
      seen.add(String(found._id));
    }
  }

  const group = await Group.create({ name, description, category, currency, members });
  await Activity.record({
    group: group._id,
    actor: req.user._id,
    action: 'group.created',
    summary: `${req.user.name} created the group "${group.name}"`
  });

  res.status(201).json({ group, unknownEmails: unknown });
});

const getGroup = asyncHandler(async (req, res) => {
  const group = await loadGroupForUser(req.params.id, req.user._id);
  res.json({ group });
});

const updateGroup = asyncHandler(async (req, res) => {
  const group = await loadGroupForUser(req.params.id, req.user._id);
  const fields = ['name', 'description', 'category', 'currency', 'archived'];
  fields.forEach((f) => {
    if (req.body[f] !== undefined) group[f] = req.body[f];
  });
  await group.save();

  await Activity.record({
    group: group._id,
    actor: req.user._id,
    action: 'group.updated',
    summary: `${req.user.name} updated the group "${group.name}"`
  });

  res.json({ group });
});

const addMember = asyncHandler(async (req, res) => {
  const group = await loadGroupForUser(req.params.id, req.user._id);
  const user = await User.findOne({ email: String(req.body.email).toLowerCase().trim() });
  if (!user) throw httpError(404, 'No account uses that email yet');
  if (group.hasMember(user._id)) throw httpError(409, 'They are already in this group');

  group.members.push({ user: user._id, role: 'member' });
  await group.save();
  await group.populate('members.user', 'name email');

  await Activity.record({
    group: group._id,
    actor: req.user._id,
    action: 'group.member_added',
    summary: `${req.user.name} added ${user.name} to "${group.name}"`,
    meta: { addedUser: user._id }
  });

  res.status(201).json({ group });
});

/** Balances plus the simplified transfer list for the group. */
const getBalances = asyncHandler(async (req, res) => {
  const group = await loadGroupForUser(req.params.id, req.user._id);

  const [expenses, settlements] = await Promise.all([
    Expense.find({ group: group._id }),
    Settlement.find({ group: group._id, status: 'completed' })
  ]);

  const balances = computeBalances({
    members: group.members.map((m) => m.user._id),
    expenses,
    settlements
  });

  const nameOf = new Map(group.members.map((m) => [String(m.user._id), m.user.name]));

  res.json({
    currency: group.currency,
    totalSpentCents: expenses.reduce((sum, e) => sum + e.amountCents, 0),
    balances: summarise(balances).map((row) => ({ ...row, name: nameOf.get(row.user) })),
    transfers: simplifyDebts(balances).map((t) => ({
      ...t,
      fromName: nameOf.get(t.from),
      toName: nameOf.get(t.to)
    }))
  });
});

module.exports = {
  listGroups,
  createGroup,
  getGroup,
  updateGroup,
  addMember,
  getBalances,
  loadGroupForUser
};
