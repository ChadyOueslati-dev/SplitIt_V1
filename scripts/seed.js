/**
 * Fills an empty database with a worked example: one trip, one flatshare,
 * eight expenses and a completed payment. Run with `npm run seed`.
 * Every demo account uses the password: password123
 */
require('dotenv').config();

const connectDB = require('../src/config/db');
const mongoose = require('mongoose');
const User = require('../src/models/User');
const Group = require('../src/models/Group');
const Expense = require('../src/models/Expense');
const Settlement = require('../src/models/Settlement');
const Activity = require('../src/models/Activity');
const { splitEqually, toCents } = require('../src/services/money');
const { reference } = require('../src/services/payments');

const PEOPLE = [
  { name: 'Chady Oueslati', email: 'chady@example.com' },
  { name: 'Amina Farah', email: 'amina@example.com' },
  { name: 'Bea Lindqvist', email: 'bea@example.com' },
  { name: 'Tomas Weber', email: 'tomas@example.com' }
];

const TRIP_EXPENSES = [
  ['Flights to Lisbon', 'transport', '412.00', 0],
  ['Hostel, three nights', 'accommodation', '268.50', 1],
  ['Airport transfer', 'transport', '46.20', 2],
  ['Dinner at Time Out Market', 'food', '89.40', 3],
  ['Tram passes', 'transport', '24.00', 1],
  ['Groceries for the flat', 'food', '57.35', 0]
];

const FLAT_EXPENSES = [
  ['Electricity, March', 'utilities', '96.80', 1],
  ['Internet, March', 'utilities', '39.99', 2]
];

async function seed() {
  await connectDB();

  await Promise.all([
    User.deleteMany({}),
    Group.deleteMany({}),
    Expense.deleteMany({}),
    Settlement.deleteMany({}),
    Activity.deleteMany({})
  ]);

  const users = [];
  for (const person of PEOPLE) {
    const user = new User(person);
    await user.setPassword('password123');
    await user.save();
    users.push(user);
  }

  const trip = await Group.create({
    name: 'Lisbon trip',
    description: 'Four days in April. Flights, hostel, food, transport.',
    category: 'trip',
    icon: Group.CATEGORY_ICONS.trip,
    currency: 'EUR',
    members: users.map((u, i) => ({ user: u._id, role: i === 0 ? 'owner' : 'member' })),
    joinCode: await Group.createUniqueJoinCode()
  });

  const flat = await Group.create({
    name: 'Flat 4B',
    description: 'Shared bills for the flat.',
    category: 'household',
    icon: Group.CATEGORY_ICONS.household,
    currency: 'EUR',
    members: users.slice(0, 3).map((u, i) => ({ user: u._id, role: i === 0 ? 'owner' : 'member' })),
    joinCode: await Group.createUniqueJoinCode()
  });

  async function addExpenses(group, rows, members) {
    for (const [description, category, amount, payerIndex] of rows) {
      const amountCents = toCents(amount);
      const parts = splitEqually(amountCents, members.length);
      const expense = await Expense.create({
        group: group._id,
        description,
        category,
        amountCents,
        currency: group.currency,
        paidBy: members[payerIndex]._id,
        splitMethod: 'equal',
        shares: members.map((m, i) => ({ user: m._id, amountCents: parts[i], weight: 1 })),
        spentAt: new Date(Date.now() - Math.random() * 20 * 864e5),
        createdBy: members[payerIndex]._id
      });

      await Activity.create({
        group: group._id,
        actor: members[payerIndex]._id,
        action: 'expense.created',
        summary: `${members[payerIndex].name} added "${description}" for ${amount} ${group.currency}`,
        meta: { expense: expense._id }
      });
    }
  }

  await addExpenses(trip, TRIP_EXPENSES, users);
  await addExpenses(flat, FLAT_EXPENSES, users.slice(0, 3));

  const payment = await Settlement.create({
    group: trip._id,
    from: users[3]._id,
    to: users[0]._id,
    amountCents: 5000,
    currency: 'EUR',
    method: 'mock-card',
    status: 'completed',
    reference: reference(),
    settledAt: new Date()
  });

  await Activity.create({
    group: trip._id,
    actor: users[3]._id,
    action: 'settlement.completed',
    summary: `${users[3].name} paid ${users[0].name} 50.00 EUR`,
    meta: { settlement: payment._id }
  });

  console.log('Seeded 4 users, 2 groups, 8 expenses, 1 settlement.');
  console.log('Sign in with chady@example.com / password123');
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
