#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '../data/puffin.db');
console.log('Checking database:', dbPath);

try {
  const db = new Database(dbPath);
  
  // Get tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('\nTables:', tables.map(t => t.name).join(', '));
  
  // Get counts
  for (const table of tables) {
    try {
      const count = db.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`).get();
      console.log(`  ${table.name}: ${count.count} rows`);
    } catch (e) {
      console.log(`  ${table.name}: error - ${e.message}`);
    }
  }
  
  db.close();
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

