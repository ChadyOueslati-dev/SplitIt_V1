const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/splitit';
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log(`MongoDB connected: ${mongoose.connection.name}`);

  // Reconciles indexes with the current schema on every boot. Without this, a database
  // created before guest accounts existed keeps its old non-sparse unique index on
  // User.email, and every second guest (email: null) collides with the first.
  await Promise.all([
    require('../models/User').syncIndexes(),
    require('../models/Group').syncIndexes()
  ]);

  return mongoose.connection;
}

module.exports = connectDB;
