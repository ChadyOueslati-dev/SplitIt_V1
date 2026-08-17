const { toDecimal } = require('./money');

/**
 * Net balance per member: what they paid minus what they owe, minus any
 * settlements already completed. Positive means the group owes them.
 */
function computeBalances({ members, expenses, settlements }) {
  const balances = new Map();
  members.forEach((id) => balances.set(String(id), 0));

  const bump = (id, delta) => {
    const key = String(id);
    balances.set(key, (balances.get(key) || 0) + delta);
  };

  for (const expense of expenses) {
    bump(expense.paidBy, expense.amountCents);
    for (const share of expense.shares) bump(share.user, -share.amountCents);
  }

  for (const s of settlements) {
    if (s.status !== 'completed') continue;
    bump(s.from, s.amountCents); // paying reduces what you owe
    bump(s.to, -s.amountCents); // receiving reduces what you are owed
  }

  return balances;
}

/**
 * Debt simplification. Instead of every pairwise IOU, the group is settled with
 * the fewest transfers a greedy pass can find: repeatedly match the largest
 * debtor with the largest creditor. For n members this needs at most n-1
 * transfers, against up to n(n-1)/2 pairwise ones.
 */
function simplifyDebts(balances) {
  const debtors = [];
  const creditors = [];

  for (const [user, cents] of balances.entries()) {
    if (cents < 0) debtors.push({ user, cents: -cents });
    else if (cents > 0) creditors.push({ user, cents });
  }

  debtors.sort((a, b) => b.cents - a.cents);
  creditors.sort((a, b) => b.cents - a.cents);

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].cents, creditors[j].cents);
    if (amount > 0) {
      transfers.push({ from: debtors[i].user, to: creditors[j].user, amountCents: amount });
    }
    debtors[i].cents -= amount;
    creditors[j].cents -= amount;
    if (debtors[i].cents === 0) i += 1;
    if (creditors[j].cents === 0) j += 1;
  }

  return transfers;
}

function summarise(balances) {
  const rows = [];
  for (const [user, cents] of balances.entries()) {
    rows.push({ user, amountCents: cents, amount: toDecimal(cents) });
  }
  return rows.sort((a, b) => b.amountCents - a.amountCents);
}

module.exports = { computeBalances, simplifyDebts, summarise };
