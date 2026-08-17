const test = require('node:test');
const assert = require('node:assert');

const { splitEqually, splitByWeight, toCents } = require('../src/services/money');
const { computeBalances, simplifyDebts } = require('../src/services/ledger');

test('an equal split never loses or invents a cent', () => {
  const parts = splitEqually(1000, 3);
  assert.deepStrictEqual(parts, [334, 333, 333]);
  assert.strictEqual(parts.reduce((a, b) => a + b, 0), 1000);
});

test('a weighted split hands leftover cents to the largest fractions', () => {
  const parts = splitByWeight(10000, [2, 1, 1]);
  assert.strictEqual(parts.reduce((a, b) => a + b, 0), 10000);
  assert.strictEqual(parts[0], 5000);
});

test('decimal input converts to cents without float drift', () => {
  assert.strictEqual(toCents('19.99'), 1999);
  assert.strictEqual(toCents(0.1 + 0.2), 30);
});

test('balances net paid against owed and always sum to zero', () => {
  const members = ['a', 'b', 'c'];
  const expenses = [
    {
      paidBy: 'a',
      amountCents: 9000,
      shares: [
        { user: 'a', amountCents: 3000 },
        { user: 'b', amountCents: 3000 },
        { user: 'c', amountCents: 3000 }
      ]
    },
    {
      paidBy: 'b',
      amountCents: 3000,
      shares: [
        { user: 'a', amountCents: 1500 },
        { user: 'b', amountCents: 1500 }
      ]
    }
  ];

  const balances = computeBalances({ members, expenses, settlements: [] });
  assert.strictEqual(balances.get('a'), 4500);
  assert.strictEqual(balances.get('b'), -1500);
  assert.strictEqual(balances.get('c'), -3000);
  assert.strictEqual([...balances.values()].reduce((a, b) => a + b, 0), 0);
});

test('a completed settlement moves both sides towards zero', () => {
  const members = ['a', 'b'];
  const expenses = [
    {
      paidBy: 'a',
      amountCents: 2000,
      shares: [
        { user: 'a', amountCents: 1000 },
        { user: 'b', amountCents: 1000 }
      ]
    }
  ];
  const settlements = [{ from: 'b', to: 'a', amountCents: 1000, status: 'completed' }];

  const balances = computeBalances({ members, expenses, settlements });
  assert.strictEqual(balances.get('a'), 0);
  assert.strictEqual(balances.get('b'), 0);
});

test('simplification clears the group in at most n-1 transfers', () => {
  const balances = new Map([
    ['a', 8420],
    ['b', 3110],
    ['c', -4230],
    ['d', -7300]
  ]);

  const transfers = simplifyDebts(balances);
  assert.ok(transfers.length <= 3, 'four members should settle in three transfers or fewer');

  const after = new Map(balances);
  for (const t of transfers) {
    after.set(t.from, after.get(t.from) + t.amountCents);
    after.set(t.to, after.get(t.to) - t.amountCents);
  }
  for (const value of after.values()) assert.strictEqual(value, 0);
});

test('an already settled group needs no transfers', () => {
  assert.deepStrictEqual(simplifyDebts(new Map([['a', 0], ['b', 0]])), []);
});
