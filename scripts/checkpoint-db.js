#!/usr/bin/env node
/**
 * Checkpoint the SQLite WAL file to ensure all data is in the main database
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '../data/puffin.db');

console.log(`Checkpointing database: ${dbPath}`);

try {
  const db = new Database(dbPath);
  const result = db.pragma('wal_checkpoint(TRUNCATE)');
  console.log('Checkpoint result:', result);
  db.close();
  console.log('Checkpoint complete!');
} catch (error) {
  console.error('Checkpoint error:', error.message);
  process.exit(1);
}



