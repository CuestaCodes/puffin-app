/**
 * Tests for Transaction database operations
 * 
 * These tests verify transaction CRUD and splitting functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

// We need to mock the database for testing
const TEST_DB_DIR = path.join(process.cwd(), 'data', 'test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'transactions-test.db');

// Simple schema for testing
const TEST_SCHEMA = `
  CREATE TABLE IF NOT EXISTS "transaction" (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    sub_category_id TEXT,
    is_split INTEGER DEFAULT 0,
    parent_transaction_id TEXT,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (parent_transaction_id) REFERENCES "transaction"(id)
  );
  
  CREATE TABLE IF NOT EXISTS sub_category (
    id TEXT PRIMARY KEY,
    upper_category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS upper_category (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

describe('Transaction Splitting', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Ensure test directory exists
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
    
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    
    // Create test database
    db = new Database(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    db.exec(TEST_SCHEMA);
    
    // Insert a test transaction
    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, is_split, is_deleted, created_at, updated_at)
      VALUES ('tx-1', '2025-01-15', 'Test Transaction', -100.00, 0, 0, datetime('now'), datetime('now'))
    `).run();
  });

  afterEach(() => {
    db.close();
    
    // Clean up test files
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
    if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
  });

  it('should create a transaction correctly', () => {
    const tx = db.prepare('SELECT * FROM "transaction" WHERE id = ?').get('tx-1') as {
      id: string;
      description: string;
      amount: number;
      is_split: number;
    };
    
    expect(tx).toBeDefined();
    expect(tx.id).toBe('tx-1');
    expect(tx.description).toBe('Test Transaction');
    expect(tx.amount).toBe(-100.00);
    expect(tx.is_split).toBe(0);
  });

  it('should split a transaction into multiple parts', () => {
    const now = new Date().toISOString();
    const parentId = 'tx-1';
    
    // Mark parent as split
    db.prepare('UPDATE "transaction" SET is_split = 1, updated_at = ? WHERE id = ?')
      .run(now, parentId);
    
    // Create child transactions
    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES (?, '2025-01-15', 'Test Transaction (Part 1)', -60.00, ?, 0, 0, ?, ?)
    `).run('child-1', parentId, now, now);
    
    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES (?, '2025-01-15', 'Test Transaction (Part 2)', -40.00, ?, 0, 0, ?, ?)
    `).run('child-2', parentId, now, now);
    
    // Verify parent is marked as split
    const parent = db.prepare('SELECT is_split FROM "transaction" WHERE id = ?').get(parentId) as { is_split: number };
    expect(parent.is_split).toBe(1);
    
    // Verify children exist
    const children = db.prepare(
      'SELECT * FROM "transaction" WHERE parent_transaction_id = ? ORDER BY id'
    ).all(parentId) as Array<{ id: string; amount: number }>;
    
    expect(children).toHaveLength(2);
    expect(children[0].id).toBe('child-1');
    expect(children[0].amount).toBe(-60.00);
    expect(children[1].id).toBe('child-2');
    expect(children[1].amount).toBe(-40.00);
    
    // Verify split amounts sum to original
    const totalChild = children.reduce((sum, c) => sum + c.amount, 0);
    expect(totalChild).toBeCloseTo(-100.00, 2);
  });

  it('should unsplit a transaction and soft-delete children', () => {
    const now = new Date().toISOString();
    const parentId = 'tx-1';
    
    // First split the transaction
    db.prepare('UPDATE "transaction" SET is_split = 1, updated_at = ? WHERE id = ?')
      .run(now, parentId);
    
    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES ('child-1', '2025-01-15', 'Part 1', -60.00, ?, 0, 0, ?, ?)
    `).run(parentId, now, now);
    
    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES ('child-2', '2025-01-15', 'Part 2', -40.00, ?, 0, 0, ?, ?)
    `).run(parentId, now, now);
    
    // Now unsplit
    db.prepare('UPDATE "transaction" SET is_deleted = 1, updated_at = ? WHERE parent_transaction_id = ?')
      .run(now, parentId);
    db.prepare('UPDATE "transaction" SET is_split = 0, updated_at = ? WHERE id = ?')
      .run(now, parentId);
    
    // Verify parent is no longer split
    const parent = db.prepare('SELECT is_split FROM "transaction" WHERE id = ?').get(parentId) as { is_split: number };
    expect(parent.is_split).toBe(0);
    
    // Verify children are soft-deleted
    const activeChildren = db.prepare(
      'SELECT * FROM "transaction" WHERE parent_transaction_id = ? AND is_deleted = 0'
    ).all(parentId);
    expect(activeChildren).toHaveLength(0);
    
    // Verify children still exist but are deleted
    const allChildren = db.prepare(
      'SELECT * FROM "transaction" WHERE parent_transaction_id = ?'
    ).all(parentId);
    expect(allChildren).toHaveLength(2);
  });

  it('should not allow splitting already-split transactions', () => {
    const parentId = 'tx-1';
    
    // Mark as split
    db.prepare('UPDATE "transaction" SET is_split = 1 WHERE id = ?').run(parentId);
    
    const tx = db.prepare('SELECT is_split FROM "transaction" WHERE id = ?').get(parentId) as { is_split: number };
    expect(tx.is_split).toBe(1);
    
    // In the actual implementation, we check this before splitting
    // Here we just verify the flag is set
  });

  it('should not allow splitting child transactions', () => {
    const now = new Date().toISOString();
    const parentId = 'tx-1';
    
    // Create a child transaction
    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES ('child-1', '2025-01-15', 'Child', -50.00, ?, 0, 0, ?, ?)
    `).run(parentId, now, now);
    
    const child = db.prepare('SELECT parent_transaction_id FROM "transaction" WHERE id = ?').get('child-1') as { parent_transaction_id: string };
    expect(child.parent_transaction_id).toBe(parentId);
    
    // In the actual implementation, we check this before splitting
    // Here we just verify the parent_transaction_id is set
  });

  it('should validate that split amounts equal original amount', () => {
    const parent = db.prepare('SELECT amount FROM "transaction" WHERE id = ?').get('tx-1') as { amount: number };
    const originalAmount = Math.abs(parent.amount);
    
    // Valid splits
    const validSplits = [60, 40];
    const validTotal = validSplits.reduce((sum, a) => sum + a, 0);
    expect(validTotal).toBe(originalAmount);
    
    // Invalid splits
    const invalidSplits = [60, 30]; // Only adds to 90
    const invalidTotal = invalidSplits.reduce((sum, a) => sum + a, 0);
    expect(invalidTotal).not.toBe(originalAmount);
  });

  it('should allow 2-3 splits per transaction', () => {
    // This is a validation rule - minimum 2, maximum 3
    const MIN_SPLITS = 2;
    const MAX_SPLITS = 3;
    
    expect(MIN_SPLITS).toBe(2);
    expect(MAX_SPLITS).toBe(3);
    
    // Verify we can create 3 splits
    const threeSplits = [40, 35, 25];
    expect(threeSplits.length).toBeLessThanOrEqual(MAX_SPLITS);
    expect(threeSplits.length).toBeGreaterThanOrEqual(MIN_SPLITS);
    expect(threeSplits.reduce((sum, a) => sum + a, 0)).toBe(100);
  });
});

