#!/usr/bin/env node
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '../data/puffin.db');
const tableName = process.argv[3] || 'transaction';

console.log(`Schema for table "${tableName}" in ${dbPath}:\n`);

try {
  const db = new Database(dbPath);
  const info = db.prepare(`PRAGMA table_info("${tableName}")`).all();
  console.log(info.map(c => `  ${c.name} (${c.type})`).join('\n'));
  db.close();
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}



