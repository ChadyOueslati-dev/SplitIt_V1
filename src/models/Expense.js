const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Stored in minor units (cents) so no floating point drift ever reaches the ledger.
    amountCents: { type: Number, required: true, min: 0 },
    weight: { type: Number, default: 1, min: 0 }
  },
  { _id: false }
);

const expenseSchema = new mongoose.Schema(
  {
    group: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    description: { type: String, required: true, trim: true, maxlength: 140 },
    category: {
      type: String,
      enum: ['food', 'transport', 'accommodation', 'utilities', 'entertainment', 'other'],
      default: 'other',
      index: true
    },
    amountCents: { type: Number, required: true, min: 1 },
    currency: { type: String, default: 'EUR', uppercase: true, maxlength: 3 },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    splitMethod: { type: String, enum: ['equal', 'exact', 'shares'], default: 'equal' },
    shares: { type: [shareSchema], default: [] },
    spentAt: { type: Date, default: Date.now, index: true },
    note: { type: String, trim: true, maxlength: 300, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

expenseSchema.index({ description: 'text', note: 'text' });

// Shares must add up to the expense total, to the cent.
expenseSchema.pre('validate', function checkShares(next) {
  if (!this.shares.length) return next();
  const total = this.shares.reduce((sum, s) => sum + s.amountCents, 0);
  if (total !== this.amountCents) {
    return next(new Error(`Shares add up to ${total} cents but the expense is ${this.amountCents}`));
  }
  return next();
});

module.exports = mongoose.model('Expense', expenseSchema);
