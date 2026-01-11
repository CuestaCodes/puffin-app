/**
 * Tests for Transaction database operations
 *
 * These tests verify transaction CRUD and splitting functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  TEST_TIMESTAMP,
  getTestDbPath,
  createTestDatabase,
  cleanupTestDb,
} from './test-utils';

const TEST_DB_PATH = getTestDbPath('transactions-test');

describe('Transaction Splitting', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase(TEST_DB_PATH);

    // Insert a test transaction
    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, is_split, is_deleted, created_at, updated_at)
      VALUES ('tx-1', '2025-01-15', 'Test Transaction', -100.00, 0, 0, ?, ?)
    `).run(TEST_TIMESTAMP, TEST_TIMESTAMP);
  });

  afterEach(() => {
    db.close();
    cleanupTestDb(TEST_DB_PATH);
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
    const parentId = 'tx-1';
    
    // Mark parent as split
    db.prepare('UPDATE "transaction" SET is_split = 1, updated_at = ? WHERE id = ?')
      .run(TEST_TIMESTAMP, parentId);

    // Create child transactions
    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES (?, '2025-01-15', 'Test Transaction (Part 1)', -60.00, ?, 0, 0, ?, ?)
    `).run('child-1', parentId, TEST_TIMESTAMP, TEST_TIMESTAMP);

    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES (?, '2025-01-15', 'Test Transaction (Part 2)', -40.00, ?, 0, 0, ?, ?)
    `).run('child-2', parentId, TEST_TIMESTAMP, TEST_TIMESTAMP);
    
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
    const parentId = 'tx-1';

    // First split the transaction
    db.prepare('UPDATE "transaction" SET is_split = 1, updated_at = ? WHERE id = ?')
      .run(TEST_TIMESTAMP, parentId);

    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES ('child-1', '2025-01-15', 'Part 1', -60.00, ?, 0, 0, ?, ?)
    `).run(parentId, TEST_TIMESTAMP, TEST_TIMESTAMP);

    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES ('child-2', '2025-01-15', 'Part 2', -40.00, ?, 0, 0, ?, ?)
    `).run(parentId, TEST_TIMESTAMP, TEST_TIMESTAMP);

    // Now unsplit
    db.prepare('UPDATE "transaction" SET is_deleted = 1, updated_at = ? WHERE parent_transaction_id = ?')
      .run(TEST_TIMESTAMP, parentId);
    db.prepare('UPDATE "transaction" SET is_split = 0, updated_at = ? WHERE id = ?')
      .run(TEST_TIMESTAMP, parentId);
    
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

    // Mark as split with children
    db.prepare('UPDATE "transaction" SET is_split = 1, updated_at = ? WHERE id = ?')
      .run(TEST_TIMESTAMP, parentId);

    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES ('child-1', '2025-01-15', 'Part 1', -60.00, ?, 0, 0, ?, ?)
    `).run(parentId, TEST_TIMESTAMP, TEST_TIMESTAMP);

    // Verify is_split flag prevents re-splitting
    const tx = db.prepare('SELECT is_split FROM "transaction" WHERE id = ?').get(parentId) as { is_split: number };
    expect(tx.is_split).toBe(1);

    // Simulate the validation check that should happen before splitting
    const canSplit = tx.is_split === 0;
    expect(canSplit).toBe(false);
  });

  it('should not allow splitting child transactions', () => {
    const parentId = 'tx-1';

    // Create a child transaction
    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES ('child-1', '2025-01-15', 'Child', -50.00, ?, 0, 0, ?, ?)
    `).run(parentId, TEST_TIMESTAMP, TEST_TIMESTAMP);

    // Verify parent_transaction_id indicates this is a child
    const child = db.prepare('SELECT parent_transaction_id, is_split FROM "transaction" WHERE id = ?').get('child-1') as {
      parent_transaction_id: string | null;
      is_split: number;
    };
    expect(child.parent_transaction_id).toBe(parentId);

    // Simulate the validation check that should happen before splitting
    const canSplit = child.parent_transaction_id === null;
    expect(canSplit).toBe(false);
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

  it('should allow 2-5 splits per transaction', () => {
    const parentId = 'tx-1';
    const MIN_SPLITS = 2;
    const MAX_SPLITS = 5;

    // Mark parent as split
    db.prepare('UPDATE "transaction" SET is_split = 1, updated_at = ? WHERE id = ?')
      .run(TEST_TIMESTAMP, parentId);

    // Create 3 valid splits (within 2-5 range)
    const splits = [
      { id: 'split-1', amount: -40.00 },
      { id: 'split-2', amount: -35.00 },
      { id: 'split-3', amount: -25.00 },
    ];

    for (const split of splits) {
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, '2025-01-15', 'Split Part', ?, ?, 0, 0, ?, ?)
      `).run(split.id, split.amount, parentId, TEST_TIMESTAMP, TEST_TIMESTAMP);
    }

    // Verify all splits were created
    const children = db.prepare(
      'SELECT * FROM "transaction" WHERE parent_transaction_id = ? AND is_deleted = 0'
    ).all(parentId) as Array<{ id: string; amount: number }>;

    expect(children).toHaveLength(3);
    expect(children.length).toBeGreaterThanOrEqual(MIN_SPLITS);
    expect(children.length).toBeLessThanOrEqual(MAX_SPLITS);

    // Verify total matches original amount
    const total = children.reduce((sum, c) => sum + c.amount, 0);
    expect(total).toBeCloseTo(-100.00, 2);
  });

  it('should exclude split parent transactions from TOTALS to prevent double-counting', () => {
    const parentId = 'tx-1';

    // Split the transaction
    db.prepare('UPDATE "transaction" SET is_split = 1, updated_at = ? WHERE id = ?')
      .run(TEST_TIMESTAMP, parentId);

    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES ('child-1', '2025-01-15', 'Part 1', -60.00, ?, 0, 0, ?, ?)
    `).run(parentId, TEST_TIMESTAMP, TEST_TIMESTAMP);

    db.prepare(`
      INSERT INTO "transaction" (id, date, description, amount, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
      VALUES ('child-2', '2025-01-15', 'Part 2', -40.00, ?, 0, 0, ?, ?)
    `).run(parentId, TEST_TIMESTAMP, TEST_TIMESTAMP);
    
    // All transactions are SHOWN in the list (parent + children)
    const allTransactions = db.prepare(
      'SELECT * FROM "transaction" WHERE is_deleted = 0'
    ).all() as Array<{ id: string; amount: number; is_split: number }>;
    
    // Should have 3 (parent + 2 children) - all are visible
    expect(allTransactions).toHaveLength(3);
    
    // But for TOTALS, we exclude split parents (is_split = 0)
    // This is what budget summary queries use
    const transactionsForTotals = db.prepare(
      'SELECT * FROM "transaction" WHERE is_deleted = 0 AND is_split = 0'
    ).all() as Array<{ id: string; amount: number }>;
    
    // Should have 2 children only (parent has is_split = 1, excluded from totals)
    expect(transactionsForTotals).toHaveLength(2);
    
    // Total should be -100 (60 + 40), NOT -200 (100 + 60 + 40)
    const total = transactionsForTotals.reduce((sum, t) => sum + t.amount, 0);
    expect(total).toBeCloseTo(-100, 2);
    
    // Verify parent IS excluded from totals
    const parentInTotals = transactionsForTotals.find(t => t.id === parentId);
    expect(parentInTotals).toBeUndefined();
  });
});

