const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: {
      type: String,
      required: true,
      enum: [
        'group.created',
        'group.member_added',
        'group.updated',
        'expense.created',
        'expense.updated',
        'expense.deleted',
        'settlement.initiated',
        'settlement.completed',
        'settlement.failed'
      ]
    },
    summary: { type: String, required: true, maxlength: 240 },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activitySchema.statics.record = function record(doc) {
  return this.create(doc).catch((err) => console.error('Activity log failed:', err.message));
};

module.exports = mongoose.model('Activity', activitySchema);
