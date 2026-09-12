const crypto = require('crypto');
const User = require('../models/User');
const Group = require('../models/Group');
const Expense = require('../models/Expense');
const Settlement = require('../models/Settlement');
const Activity = require('../models/Activity');
const { asyncHandler, httpError } = require('../middleware/error');
const { issueToken, clearToken } = require('../middleware/auth');
const { sendResetCodeEmail } = require('../services/email');
const { isValidImageDataUrl } = require('../services/image');

/** A 6-digit code, uniformly distributed (crypto, not Math.random), zero-padded. */
function generateResetCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

const register = asyncHandler(async (req, res) => {
  const { name, email, password, defaultCurrency } = req.body;

  const existing = await User.findOne({ email: String(email).toLowerCase() });
  if (existing) throw httpError(409, 'An account with that email already exists');

  const user = new User({ name, email, defaultCurrency: defaultCurrency || 'EUR' });
  await user.setPassword(password);
  await user.save();

  issueToken(res, user);
  res.status(201).json({ user: user.toPublic() });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
  if (!user || !(await user.verifyPassword(password))) {
    throw httpError(401, 'Email or password is incorrect');
  }

  issueToken(res, user);
  res.json({ user: user.toPublic() });
});

const logout = (req, res) => {
  clearToken(res);
  res.json({ ok: true });
};

const me = (req, res) => res.json({ user: req.user.toPublic() });

const listUsers = asyncHandler(async (req, res) => {
  const q = (req.query.q || '').trim();
  const filter = q ? { $or: [{ name: new RegExp(q, 'i') }, { email: new RegExp(q, 'i') }] } : {};
  const users = await User.find(filter).limit(20).sort({ name: 1 });
  res.json({ users: users.map((u) => u.toPublic()) });
});

const GENERIC_RESET_MESSAGE = 'If that email has an account, a reset code is on its way.';

/** Always answers the same way regardless of whether the email exists, is a guest
 *  account, or is on cooldown — none of that is anything an outside caller should be
 *  able to learn by probing this endpoint. */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
    '+resetRequestedAt'
  );

  if (user && !user.isGuest && !user.isResetOnCooldown()) {
    const code = generateResetCode();
    await user.setResetCode(code);
    await user.save();
    await sendResetCodeEmail(user.email, user.name, code);
  }

  res.json({ ok: true, message: GENERIC_RESET_MESSAGE });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { email, code, password } = req.body;
  const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select(
    '+resetCodeHash +resetCodeExpires +resetAttempts'
  );

  if (!user || !(await user.verifyResetCode(code))) {
    throw httpError(400, 'That code is incorrect or has expired');
  }

  await user.setPassword(password);
  user.clearResetCode();
  await user.save();

  issueToken(res, user);
  res.json({ user: user.toPublic() });
});

const updateProfile = asyncHandler(async (req, res) => {
  const { name, defaultCurrency } = req.body;
  if (name !== undefined) req.user.name = String(name).trim();
  if (defaultCurrency !== undefined) req.user.defaultCurrency = String(defaultCurrency).toUpperCase();
  await req.user.save();
  res.json({ user: req.user.toPublic() });
});

const changePassword = asyncHandler(async (req, res) => {
  if (req.user.isGuest) {
    throw httpError(400, 'Add an email and password to your account first');
  }

  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.verifyPassword(currentPassword))) {
    throw httpError(401, 'Your current password is incorrect');
  }

  await user.setPassword(newPassword);
  await user.save();
  res.json({ ok: true });
});

/** Turns a guest (name only, joined by code) into a full account, without losing the
 *  membership or expense history already tied to their user id. */
const upgradeGuest = asyncHandler(async (req, res) => {
  if (!req.user.isGuest) throw httpError(409, 'You already have a full account');

  const { email, password } = req.body;
  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) throw httpError(409, 'An account with that email already exists');

  req.user.email = normalizedEmail;
  req.user.isGuest = false;
  await req.user.setPassword(password);
  await req.user.save();

  res.json({ user: req.user.toPublic() });
});

/** Groups where this is the only member are removed entirely. Groups with other members
 *  keep going — losing a member auto-promotes the longest-standing one if that leaves no
 *  owner. The account itself is hard-deleted only if nothing else in the ledger points at
 *  it; otherwise it's stripped to a nameless placeholder so other members' expense and
 *  settlement history stays intact and attributable. */
const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+passwordHash');

  if (!user.isGuest) {
    const { password } = req.body;
    if (!password || !(await user.verifyPassword(password))) {
      throw httpError(401, 'Enter your current password to delete your account');
    }
  }

  const groups = await Group.find({ 'members.user': user._id });
  for (const group of groups) {
    group.members = group.members.filter((m) => String(m.user) !== String(user._id));

    if (group.members.length === 0) {
      await Promise.all([
        Expense.deleteMany({ group: group._id }),
        Settlement.deleteMany({ group: group._id }),
        Activity.deleteMany({ group: group._id })
      ]);
      await group.deleteOne();
      continue;
    }

    if (!group.members.some((m) => m.role === 'owner')) {
      group.members.sort((a, b) => a.joinedAt - b.joinedAt);
      group.members[0].role = 'owner';
    }
    await group.save();
  }

  // Activity.actor is deliberately not part of this check: the activity feed only ever
  // renders its pre-baked `summary` string, never the actor's live name, so a hard delete
  // can't break it. Expense and settlement references are different — those feed other
  // members' balance math and are rendered by name (expense rows, the CSV export), so a
  // dangling reference there would either corrupt a name lookup or throw outright.
  const [hasExpense, hasSettlement] = await Promise.all([
    Expense.exists({ $or: [{ paidBy: user._id }, { 'shares.user': user._id }] }),
    Settlement.exists({ $or: [{ from: user._id }, { to: user._id }] })
  ]);

  clearToken(res);

  if (hasExpense || hasSettlement) {
    user.name = 'Deleted user';
    user.email = undefined;
    user.passwordHash = undefined;
    user.isGuest = true;
    user.clearResetCode();
    await user.save();
  } else {
    await user.deleteOne();
  }

  res.json({ ok: true });
});

const updateAvatar = asyncHandler(async (req, res) => {
  const { image } = req.body;
  if (!isValidImageDataUrl(image)) {
    throw httpError(400, 'That does not look like a usable image');
  }

  req.user.avatar = image;
  await req.user.save();
  res.json({ user: req.user.toPublic() });
});

const removeAvatar = asyncHandler(async (req, res) => {
  req.user.avatar = null;
  await req.user.save();
  res.json({ user: req.user.toPublic() });
});

module.exports = {
  register,
  login,
  logout,
  me,
  listUsers,
  forgotPassword,
  resetPassword,
  updateProfile,
  changePassword,
  upgradeGuest,
  deleteAccount,
  updateAvatar,
  removeAvatar
};
