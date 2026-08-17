const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const groupSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    category: {
      type: String,
      enum: ['trip', 'household', 'project', 'event', 'other'],
      default: 'other'
    },
    currency: { type: String, default: 'EUR', uppercase: true, maxlength: 3 },
    members: { type: [memberSchema], validate: (v) => v.length > 0 },
    archived: { type: Boolean, default: false }
  },
  { timestamps: true }
);

groupSchema.index({ name: 'text', description: 'text' });

groupSchema.methods.hasMember = function hasMember(userId) {
  return this.members.some((m) => String(m.user._id || m.user) === String(userId));
};

module.exports = mongoose.model('Group', groupSchema);
