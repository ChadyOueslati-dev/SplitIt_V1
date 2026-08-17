const mongoose = require('mongoose');

const settlementSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amountCents: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'EUR', uppercase: true, maxlength: 3 },
    method: { type: String, enum: ['mock-card', 'bank-transfer', 'cash'], default: 'mock-card' },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: 'pending',
      index: true
    },
    reference: { type: String, required: true, unique: true },
    failureReason: { type: String, default: '' },
    settledAt: { type: Date }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settlement', settlementSchema);
