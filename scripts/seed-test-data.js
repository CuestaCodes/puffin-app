#!/usr/bin/env node
/**
 * Seed test data for sync testing
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '../data/puffin.db');
console.log('Seeding test data to:', dbPath);

try {
  const db = new Database(dbPath);
  
  // Check if tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  if (tables.length === 0) {
    console.error('Database has no tables! Run the app first to initialize schema.');
    process.exit(1);
  }
  
  // Insert test transactions (without category - will be uncategorized)
  const insertTx = db.prepare(`
    INSERT INTO "transaction" (id, date, description, amount, is_deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, datetime('now'), datetime('now'))
  `);
  
  const crypto = require('crypto');
  const today = new Date();
  const transactions = [
    { desc: 'Test Grocery Shopping', amount: -85.50 },
    { desc: 'Test Gas Station', amount: -45.00 },
    { desc: 'Test Coffee Shop', amount: -6.75 },
    { desc: 'Test Salary Deposit', amount: 3500.00 },
    { desc: 'Test Electric Bill', amount: -125.00 },
  ];
  
  console.log('\nInserting transactions:');
  for (const tx of transactions) {
    const id = crypto.randomUUID();
    insertTx.run(id, today.toISOString().split('T')[0], tx.desc, tx.amount);
    console.log(`  ${tx.desc}: $${tx.amount}`);
  }
  
  // Verify
  const count = db.prepare("SELECT COUNT(*) as count FROM \"transaction\"").get();
  console.log(`\nTotal transactions: ${count.count}`);
  
  // Checkpoint WAL
  db.pragma('wal_checkpoint(TRUNCATE)');
  console.log('WAL checkpointed');
  
  db.close();
  console.log('\nDone! Test data seeded successfully.');
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

