const mongoose = require('mongoose');
const crypto = require('crypto');

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const joinRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    message: { type: String, trim: true, maxlength: 200, default: '' },
    status: { type: String, enum: ['pending', 'approved', 'declined'], default: 'pending' },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date }
  },
  { timestamps: { createdAt: 'requestedAt', updatedAt: false } }
);

const CATEGORY_ICONS = {
  trip: '🧳',
  household: '🏠',
  project: '💼',
  event: '🎉',
  other: '🧾'
};

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    category: {
      type: String,
      enum: ['trip', 'household', 'project', 'event', 'other'],
      default: 'other'
    },
    icon: { type: String, trim: true, maxlength: 8, default: '🧾' },
    // A data URI, like User.avatar — null falls back to the emoji icon above.
    photo: { type: String, default: null, maxlength: 300_000 },
    currency: { type: String, default: 'EUR', uppercase: true, maxlength: 3 },
    members: { type: [memberSchema], validate: (v) => v.length > 0 },
    archived: { type: Boolean, default: false },
    joinCode: { type: String, uppercase: true, unique: true, sparse: true, index: true },
    // Hidden by default: only the owner-facing join-request endpoints ask for it explicitly,
    // so an ordinary GET of a group does not leak who has asked to join.
    joinRequests: { type: [joinRequestSchema], default: [], select: false }
  },
  { timestamps: true }
);

groupSchema.index({ name: 'text', description: 'text' });

// Excludes visually ambiguous characters (0/O, 1/I) so a code can be read off a screen or read aloud.
const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

groupSchema.statics.generateJoinCode = function generateJoinCode(length = 7) {
  let code = '';
  for (let i = 0; i < length; i += 1) {
    code += JOIN_CODE_ALPHABET[crypto.randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
};

groupSchema.statics.createUniqueJoinCode = async function createUniqueJoinCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = this.generateJoinCode();
    // eslint-disable-next-line no-await-in-loop
    const taken = await this.exists({ joinCode: code });
    if (!taken) return code;
  }
  throw new Error('Could not generate a unique join code');
};

groupSchema.methods.hasMember = function hasMember(userId) {
  return this.members.some((m) => String(m.user._id || m.user) === String(userId));
};

groupSchema.methods.isOwner = function isOwner(userId) {
  return this.members.some(
    (m) => String(m.user._id || m.user) === String(userId) && m.role === 'owner'
  );
};

groupSchema.statics.CATEGORY_ICONS = CATEGORY_ICONS;

module.exports = mongoose.model('Group', groupSchema);
