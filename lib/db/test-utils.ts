/**
 * Test utilities for database tests
 *
 * Provides shared schema, helper functions, and constants for test files
 *
 * USAGE:
 * Import TEST_TIMESTAMP and use it instead of `new Date().toISOString()` for
 * deterministic tests that don't depend on timing. This prevents flaky tests
 * caused by millisecond differences in timestamps.
 *
 * Example:
 *   import { TEST_TIMESTAMP, createTestDatabase, cleanupTestDb } from './test-utils';
 *   db.prepare('INSERT INTO ... VALUES (?, ?, ?)').run(id, TEST_TIMESTAMP, TEST_TIMESTAMP);
 */

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

// Fixed timestamp for deterministic tests - use instead of new Date().toISOString()
export const TEST_TIMESTAMP = '2025-01-15T00:00:00.000Z';

// Test database directory
export const TEST_DB_DIR = path.join(process.cwd(), 'data', 'test');

/**
 * Core test schema with all tables needed for most tests
 * This is a simplified version of the production schema for faster test execution
 */
export const TEST_SCHEMA = `
  CREATE TABLE IF NOT EXISTS upper_category (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sub_category (
    id TEXT PRIMARY KEY,
    upper_category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (upper_category_id) REFERENCES upper_category(id)
  );

  CREATE TABLE IF NOT EXISTS source (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS "transaction" (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    sub_category_id TEXT,
    source_id TEXT REFERENCES source(id),
    is_split INTEGER DEFAULT 0,
    parent_transaction_id TEXT,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (sub_category_id) REFERENCES sub_category(id),
    FOREIGN KEY (parent_transaction_id) REFERENCES "transaction"(id)
  );

  CREATE TABLE IF NOT EXISTS budget (
    id TEXT PRIMARY KEY,
    sub_category_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    amount REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(sub_category_id, year, month),
    FOREIGN KEY (sub_category_id) REFERENCES sub_category(id)
  );

  CREATE TABLE IF NOT EXISTS budget_template (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    template_data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auto_category_rule (
    id TEXT PRIMARY KEY,
    match_text TEXT NOT NULL,
    sub_category_id TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    match_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (sub_category_id) REFERENCES sub_category(id)
  );

  CREATE TABLE IF NOT EXISTS net_worth_entry (
    id TEXT PRIMARY KEY,
    recorded_at TEXT NOT NULL,
    assets_data TEXT NOT NULL,
    liabilities_data TEXT NOT NULL,
    total_assets REAL NOT NULL,
    total_liabilities REAL NOT NULL,
    net_worth REAL NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transaction_date ON "transaction"(date);
  CREATE INDEX IF NOT EXISTS idx_transaction_sub_category ON "transaction"(sub_category_id);
  CREATE INDEX IF NOT EXISTS idx_transaction_source ON "transaction"(source_id);
`;

/**
 * Default upper categories for seeding test databases
 */
export const DEFAULT_TEST_CATEGORIES = [
  { id: 'income', name: 'Income', type: 'income', sort_order: 1 },
  { id: 'expense', name: 'Expense', type: 'expense', sort_order: 2 },
  { id: 'saving', name: 'Saving', type: 'saving', sort_order: 3 },
  { id: 'bill', name: 'Bill', type: 'bill', sort_order: 4 },
  { id: 'debt', name: 'Debt', type: 'debt', sort_order: 5 },
  { id: 'sinking', name: 'Sinking Funds', type: 'sinking', sort_order: 6 },
  { id: 'transfer', name: 'Transfer', type: 'transfer', sort_order: 7 },
] as const;

/**
 * Ensures test directory exists
 */
export function ensureTestDir(): void {
  if (!fs.existsSync(TEST_DB_DIR)) {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  }
}

/**
 * Cleans up test database files including WAL files
 */
export function cleanupTestDb(dbPath: string): void {
  const files = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];
  for (const file of files) {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
}

/**
 * Creates a test database with schema and optional seed data
 */
export function createTestDatabase(
  dbPath: string,
  options: {
    schema?: string;
    seedCategories?: boolean;
  } = {}
): Database.Database {
  const { schema = TEST_SCHEMA, seedCategories = false } = options;

  ensureTestDir();
  cleanupTestDb(dbPath);

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');
  db.exec(schema);

  if (seedCategories) {
    const stmt = db.prepare(`
      INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const cat of DEFAULT_TEST_CATEGORIES) {
      stmt.run(cat.id, cat.name, cat.type, cat.sort_order, TEST_TIMESTAMP, TEST_TIMESTAMP);
    }
  }

  return db;
}

/**
 * Generates a test database path with a unique name
 */
export function getTestDbPath(testName: string): string {
  return path.join(TEST_DB_DIR, `${testName}.db`);
}
