const Group = require('../models/Group');
const User = require('../models/User');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const Activity = require('../models/Activity');
const { asyncHandler, httpError } = require('../middleware/error');
const { issueToken, optionalUser } = require('../middleware/auth');
const { isValidImageDataUrl } = require('../services/image');
const { computeBalances, simplifyDebts, summarise } = require('../services/ledger');

async function loadGroupForUser(groupId, userId) {
  const group = await Group.findById(groupId).populate('members.user', 'name email avatar');
  if (!group) throw httpError(404, 'That group does not exist');
  if (!group.hasMember(userId)) throw httpError(403, 'You are not a member of that group');
  return group;
}

function requireOwner(group, userId) {
  if (!group.isOwner(userId)) throw httpError(403, 'Only a group owner can do that');
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

  const groups = await Group.find(filter).populate('members.user', 'name email avatar').sort({ updatedAt: -1 });

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
  const {
    name,
    description = '',
    category = 'other',
    currency = 'EUR',
    icon,
    memberEmails = []
  } = req.body;

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

  const joinCode = await Group.createUniqueJoinCode();
  const resolvedIcon = icon && String(icon).trim() ? String(icon).trim() : Group.CATEGORY_ICONS[category];
  const group = await Group.create({
    name,
    description,
    category,
    icon: resolvedIcon,
    currency,
    members,
    joinCode
  });
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
  const fields = ['name', 'description', 'category', 'icon', 'currency', 'archived'];
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

const updateGroupPhoto = asyncHandler(async (req, res) => {
  const group = await loadGroupForUser(req.params.id, req.user._id);
  const { image } = req.body;
  if (!isValidImageDataUrl(image)) {
    throw httpError(400, 'That does not look like a usable image');
  }

  group.photo = image;
  await group.save();
  res.json({ group });
});

const removeGroupPhoto = asyncHandler(async (req, res) => {
  const group = await loadGroupForUser(req.params.id, req.user._id);
  group.photo = null;
  await group.save();
  res.json({ group });
});

const addMember = asyncHandler(async (req, res) => {
  const group = await loadGroupForUser(req.params.id, req.user._id);
  const user = await User.findOne({ email: String(req.body.email).toLowerCase().trim() });
  if (!user) throw httpError(404, 'No account uses that email yet');
  if (group.hasMember(user._id)) throw httpError(409, 'They are already in this group');

  group.members.push({ user: user._id, role: 'member' });
  await group.save();
  await group.populate('members.user', 'name email avatar');

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

/** Finds an existing guest, among this group's members and join requests, whose name
 *  matches. Guests have no email to key off, so within one group a name is the closest
 *  thing to an identity — this is what lets the *same* guest retry safely while stopping
 *  a *different* guest on the same browser/cookie from being folded into their account. */
async function findGuestByNameInGroup(group, name) {
  const candidateIds = [
    ...group.members.map((m) => m.user._id || m.user),
    ...group.joinRequests.map((r) => r.user)
  ];
  if (!candidateIds.length) return null;

  const normalized = name.trim().toLowerCase();
  const candidates = await User.find({ _id: { $in: candidateIds }, isGuest: true });
  return candidates.find((u) => u.name.trim().toLowerCase() === normalized) || null;
}

/** Anyone with a valid group code can ask to join, with or without an existing session.
 *  No account is required: a guest is created from just a name and can later be added
 *  to other groups the same way, all under the same lightweight account.
 *
 *  Identity here is intentionally NOT just "whatever session cookie is on this browser":
 *  a shared device (a family computer, a phone passed around a room) would otherwise let
 *  one guest's cookie silently swallow the next guest's join request. A signed-in real
 *  account keeps its identity across a join; an anonymous or guest caller is matched (or
 *  created) by the name they typed, scoped to this one group. */
const requestToJoin = asyncHandler(async (req, res) => {
  const { name, code, message = '' } = req.body;

  const group = await Group.findOne({ joinCode: String(code).toUpperCase().trim() }).select(
    '+joinRequests'
  );
  if (!group) throw httpError(404, 'No group uses that code');

  const session = await optionalUser(req);
  let user = session && !session.isGuest ? session : null;

  if (!user) {
    if (!name || String(name).trim().length < 2) throw httpError(400, 'Enter your name');
    const trimmedName = String(name).trim();
    user = await findGuestByNameInGroup(group, trimmedName);
    if (!user) {
      user = await User.create({ name: trimmedName, isGuest: true });
    }
  }

  if (group.hasMember(user._id)) throw httpError(409, 'You are already a member of this group');
  if (group.joinRequests.some((r) => String(r.user) === String(user._id) && r.status === 'pending')) {
    throw httpError(409, 'You already asked to join this group');
  }

  group.joinRequests.push({ user: user._id, message: String(message).trim() });
  await group.save();
  issueToken(res, user);

  await Activity.record({
    group: group._id,
    actor: user._id,
    action: 'group.join_requested',
    summary: `${user.name} asked to join "${group.name}"`
  });

  res.status(201).json({ status: 'pending', groupName: group.name, user: user.toPublic() });
});

/** The signed-in caller's own join requests, across every group, so a guest with no
 *  other way into the app can tell whether they have been let in yet. */
const myJoinRequests = asyncHandler(async (req, res) => {
  const groups = await Group.find(
    { 'joinRequests.user': req.user._id },
    { name: 1, joinRequests: 1 }
  );

  const mine = [];
  groups.forEach((group) => {
    group.joinRequests
      .filter((r) => String(r.user) === String(req.user._id))
      .forEach((r) =>
        mine.push({
          groupId: group._id,
          groupName: group.name,
          status: r.status,
          requestedAt: r.requestedAt
        })
      );
  });
  mine.sort((a, b) => b.requestedAt - a.requestedAt);

  res.json({ joinRequests: mine });
});

const listJoinRequests = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id)
    .select('+joinRequests')
    .populate('joinRequests.user', 'name isGuest avatar');
  if (!group) throw httpError(404, 'That group does not exist');
  if (!group.hasMember(req.user._id)) throw httpError(403, 'You are not a member of that group');
  requireOwner(group, req.user._id);

  res.json({ joinRequests: group.joinRequests.filter((r) => r.status === 'pending') });
});

const decideJoinRequest = asyncHandler(async (req, res) => {
  const { decision } = req.body;

  const group = await Group.findById(req.params.id)
    .select('+joinRequests')
    .populate('members.user', 'name email avatar');
  if (!group) throw httpError(404, 'That group does not exist');
  if (!group.hasMember(req.user._id)) throw httpError(403, 'You are not a member of that group');
  requireOwner(group, req.user._id);

  const request = group.joinRequests.id(req.params.requestId);
  if (!request) throw httpError(404, 'That join request does not exist');
  if (request.status !== 'pending') throw httpError(409, 'That request was already decided');

  request.status = decision === 'approve' ? 'approved' : 'declined';
  request.decidedBy = req.user._id;
  request.decidedAt = new Date();

  if (decision === 'approve' && !group.hasMember(request.user)) {
    group.members.push({ user: request.user, role: 'member' });
  }

  await group.save();
  await group.populate('members.user', 'name email avatar');

  const requester = await User.findById(request.user);
  await Activity.record({
    group: group._id,
    actor: req.user._id,
    action: decision === 'approve' ? 'group.join_approved' : 'group.join_declined',
    summary: `${req.user.name} ${decision === 'approve' ? 'approved' : 'declined'} ${
      requester ? requester.name : 'someone'
    } joining "${group.name}"`,
    meta: { requestUser: request.user }
  });

  res.json({ group, decision: request.status });
});

const regenerateJoinCode = asyncHandler(async (req, res) => {
  const group = await loadGroupForUser(req.params.id, req.user._id);
  requireOwner(group, req.user._id);

  group.joinCode = await Group.createUniqueJoinCode();
  await group.save();

  res.json({ joinCode: group.joinCode });
});

module.exports = {
  listGroups,
  createGroup,
  getGroup,
  updateGroup,
  updateGroupPhoto,
  removeGroupPhoto,
  addMember,
  getBalances,
  loadGroupForUser,
  requestToJoin,
  myJoinRequests,
  listJoinRequests,
  decideJoinRequest,
  regenerateJoinCode
};
