const User = require('../models/User');
const { asyncHandler, httpError } = require('../middleware/error');
const { issueToken, clearToken } = require('../middleware/auth');

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

module.exports = { register, login, logout, me, listUsers };
