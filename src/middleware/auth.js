const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { asyncHandler, httpError } = require('./error');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const MAX_AGE_DAYS = 7;

function issueToken(res, user) {
  const token = jwt.sign({ sub: String(user._id) }, SECRET, { expiresIn: `${MAX_AGE_DAYS}d` });
  res.cookie('splitit_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_DAYS * 24 * 60 * 60 * 1000
  });
  return token;
}

function clearToken(res) {
  res.clearCookie('splitit_token');
}

const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = req.cookies.splitit_token || (header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) throw httpError(401, 'Sign in to continue');

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    throw httpError(401, 'Your session expired. Sign in again.');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw httpError(401, 'That account no longer exists');

  req.user = user;
  next();
});

/** Returns the signed-in user for this request, or null. Never throws. Used where a
 *  route serves both anonymous and signed-in callers (e.g. joining by group code). */
async function optionalUser(req) {
  const header = req.headers.authorization || '';
  const token = req.cookies.splitit_token || (header.startsWith('Bearer ') ? header.slice(7) : null);
  if (!token) return null;

  try {
    const payload = jwt.verify(token, SECRET);
    return await User.findById(payload.sub);
  } catch {
    return null;
  }
}

module.exports = { issueToken, clearToken, requireAuth, optionalUser };
