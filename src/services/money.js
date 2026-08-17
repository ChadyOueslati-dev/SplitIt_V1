/**
 * All money in SplitIt is handled as integer cents. These helpers are the only
 * place where conversion between the API's decimal strings and cents happens.
 */

function toCents(value) {
  const num = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value);
  if (!Number.isFinite(num)) throw new Error('Amount is not a number');
  return Math.round(num * 100);
}

function toDecimal(cents) {
  return (cents / 100).toFixed(2);
}

function format(cents, currency = 'EUR') {
  return `${toDecimal(cents)} ${currency}`;
}

/**
 * Splits a total across n participants without losing or inventing cents.
 * The remainder is handed out one cent at a time, starting from the first
 * participant, so 10.00 across 3 people becomes 3.34 / 3.33 / 3.33.
 */
function splitEqually(totalCents, participantCount) {
  if (participantCount < 1) throw new Error('At least one participant is required');
  const base = Math.floor(totalCents / participantCount);
  let remainder = totalCents - base * participantCount;
  return Array.from({ length: participantCount }, () => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return base + extra;
  });
}

/** Splits by weight (e.g. 2 shares for a couple, 1 for a single person). */
function splitByWeight(totalCents, weights) {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) throw new Error('Total weight must be greater than zero');
  const raw = weights.map((w) => (totalCents * w) / totalWeight);
  const floored = raw.map((v) => Math.floor(v));
  let remainder = totalCents - floored.reduce((a, b) => a + b, 0);
  // Give leftover cents to the largest fractional parts first.
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floored[i] += 1;
    remainder -= 1;
  }
  return floored;
}

module.exports = { toCents, toDecimal, format, splitEqually, splitByWeight };
