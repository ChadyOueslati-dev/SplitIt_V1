const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: function requiresEmail() { return !this.isGuest; },
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Enter a valid email address']
    },
    passwordHash: {
      type: String,
      required: function requiresPassword() { return !this.isGuest; },
      select: false
    },
    isGuest: { type: Boolean, default: false },
    defaultCurrency: { type: String, default: 'EUR', uppercase: true, maxlength: 3 },

    // A data URI (client resizes to a small square before upload — see account.js), or
    // null to fall back to an initials avatar. Capped well above what a resized JPEG
    // needs, as a backstop against a client that skips the resize.
    avatar: { type: String, default: null, maxlength: 300_000 },

    // Password reset. Hashed the same way a password is — never store the code itself.
    resetCodeHash: { type: String, select: false },
    resetCodeExpires: { type: Date, select: false },
    resetRequestedAt: { type: Date, select: false },
    resetAttempts: { type: Number, default: 0, select: false },

    // Everything newer than this, in the notifications feed, counts as unread. Defaults
    // to account-creation time so a new user doesn't start with a badge full of history.
    notificationsSeenAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_CODE_COOLDOWN_MS = 60 * 1000;
const RESET_CODE_MAX_ATTEMPTS = 5;

userSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

/** True if a reset code was requested recently enough that a new one should not be sent yet. */
userSchema.methods.isResetOnCooldown = function isResetOnCooldown() {
  return Boolean(this.resetRequestedAt) && Date.now() - this.resetRequestedAt.getTime() < RESET_CODE_COOLDOWN_MS;
};

userSchema.methods.setResetCode = async function setResetCode(code) {
  this.resetCodeHash = await bcrypt.hash(code, 12);
  this.resetCodeExpires = new Date(Date.now() + RESET_CODE_TTL_MS);
  this.resetRequestedAt = new Date();
  this.resetAttempts = 0;
};

/** Checks the code and counts the attempt. Returns false for a missing/expired code, a
 *  wrong code, or once too many wrong guesses have used up the code — a fresh one is
 *  required past that point, so a 6-digit code can't just be brute-forced online. */
userSchema.methods.verifyResetCode = async function verifyResetCode(code) {
  if (!this.resetCodeHash || !this.resetCodeExpires || this.resetCodeExpires < new Date()) return false;
  if (this.resetAttempts >= RESET_CODE_MAX_ATTEMPTS) return false;

  const valid = await bcrypt.compare(String(code), this.resetCodeHash);
  if (!valid) {
    this.resetAttempts += 1;
    await this.save();
  }
  return valid;
};

userSchema.methods.clearResetCode = function clearResetCode() {
  this.resetCodeHash = undefined;
  this.resetCodeExpires = undefined;
  this.resetRequestedAt = undefined;
  this.resetAttempts = 0;
};

userSchema.methods.toPublic = function toPublic() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    defaultCurrency: this.defaultCurrency,
    isGuest: this.isGuest,
    avatar: this.avatar
  };
};

module.exports = mongoose.model('User', userSchema);
