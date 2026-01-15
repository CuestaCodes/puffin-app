/**
 * Tests for Auto-Categorisation Rules database operations
 *
 * These tests verify rule CRUD, priority ordering, rule matching, and applying rules to transactions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

// Test database path
const TEST_DB_DIR = path.join(process.cwd(), 'data', 'test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'rules-test.db');

// Test schema
const TEST_SCHEMA = `
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

  CREATE TABLE IF NOT EXISTS "transaction" (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    sub_category_id TEXT,
    source_id TEXT,
    is_split INTEGER DEFAULT 0,
    parent_transaction_id TEXT,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (sub_category_id) REFERENCES sub_category(id)
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
`;

describe('Auto-Categorisation Rules', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Ensure test directory exists
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }

    // Remove old test database if exists
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }

    // Create fresh database
    db = new Database(TEST_DB_PATH);
    db.exec(TEST_SCHEMA);

    // Insert test categories
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('upper-expense', 'Expenses', 'expense', 0, now, now);

    db.prepare(`
      INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('upper-income', 'Income', 'income', 1, now, now);

    db.prepare(`
      INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('sub-groceries', 'upper-expense', 'Groceries', 0, 0, now, now);

    db.prepare(`
      INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('sub-dining', 'upper-expense', 'Dining Out', 1, 0, now, now);

    db.prepare(`
      INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('sub-salary', 'upper-income', 'Salary', 0, 0, now, now);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  });

  describe('Rule CRUD Operations', () => {
    it('should create a rule with correct priority', () => {
      const now = new Date().toISOString();

      // Create first rule
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      // Create second rule
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-2', 'COLES', 'sub-groceries', 1, 1, 0, now, now);

      const rules = db.prepare('SELECT * FROM auto_category_rule ORDER BY priority').all() as Array<{
        id: string;
        match_text: string;
        priority: number;
      }>;

      expect(rules).toHaveLength(2);
      expect(rules[0].match_text).toBe('WOOLWORTHS');
      expect(rules[0].priority).toBe(0);
      expect(rules[1].match_text).toBe('COLES');
      expect(rules[1].priority).toBe(1);
    });

    it('should get rule by ID with category info', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      const rule = db.prepare(`
        SELECT r.*, sc.name as sub_category_name, uc.name as upper_category_name, uc.type as upper_category_type
        FROM auto_category_rule r
        JOIN sub_category sc ON r.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE r.id = ?
      `).get('rule-1') as {
        id: string;
        match_text: string;
        sub_category_name: string;
        upper_category_name: string;
        upper_category_type: string;
      };

      expect(rule).toBeDefined();
      expect(rule.match_text).toBe('WOOLWORTHS');
      expect(rule.sub_category_name).toBe('Groceries');
      expect(rule.upper_category_name).toBe('Expenses');
      expect(rule.upper_category_type).toBe('expense');
    });

    it('should update a rule', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      // Update the rule
      db.prepare(`
        UPDATE auto_category_rule SET match_text = ?, sub_category_id = ?, updated_at = ? WHERE id = ?
      `).run('WOOLIES', 'sub-dining', now, 'rule-1');

      const rule = db.prepare('SELECT * FROM auto_category_rule WHERE id = ?').get('rule-1') as {
        match_text: string;
        sub_category_id: string;
      };

      expect(rule.match_text).toBe('WOOLIES');
      expect(rule.sub_category_id).toBe('sub-dining');
    });

    it('should delete a rule', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      const result = db.prepare('DELETE FROM auto_category_rule WHERE id = ?').run('rule-1');

      expect(result.changes).toBe(1);

      const rule = db.prepare('SELECT * FROM auto_category_rule WHERE id = ?').get('rule-1');
      expect(rule).toBeUndefined();
    });

    it('should toggle rule active state', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      // Toggle off
      db.prepare('UPDATE auto_category_rule SET is_active = 0 WHERE id = ?').run('rule-1');

      let rule = db.prepare('SELECT is_active FROM auto_category_rule WHERE id = ?').get('rule-1') as { is_active: number };
      expect(rule.is_active).toBe(0);

      // Toggle on
      db.prepare('UPDATE auto_category_rule SET is_active = 1 WHERE id = ?').run('rule-1');

      rule = db.prepare('SELECT is_active FROM auto_category_rule WHERE id = ?').get('rule-1') as { is_active: number };
      expect(rule.is_active).toBe(1);
    });
  });

  describe('Rule Priority Management', () => {
    it('should reorder rules by priority', () => {
      const now = new Date().toISOString();

      // Create rules
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-2', 'COLES', 'sub-groceries', 1, 1, 0, now, now);

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-3', 'ALDI', 'sub-groceries', 2, 1, 0, now, now);

      // Reorder: ALDI first, WOOLWORTHS second, COLES third
      const newOrder = ['rule-3', 'rule-1', 'rule-2'];
      const updateStmt = db.prepare('UPDATE auto_category_rule SET priority = ? WHERE id = ?');

      newOrder.forEach((id, index) => {
        updateStmt.run(index, id);
      });

      const rules = db.prepare('SELECT id, match_text, priority FROM auto_category_rule ORDER BY priority').all() as Array<{
        id: string;
        match_text: string;
        priority: number;
      }>;

      expect(rules[0].match_text).toBe('ALDI');
      expect(rules[0].priority).toBe(0);
      expect(rules[1].match_text).toBe('WOOLWORTHS');
      expect(rules[1].priority).toBe(1);
      expect(rules[2].match_text).toBe('COLES');
      expect(rules[2].priority).toBe(2);
    });
  });

  describe('Rule Matching', () => {
    it('should match transaction description case-insensitively', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      // Test various cases
      const testDescriptions = [
        'WOOLWORTHS SYDNEY',
        'Woolworths Melbourne',
        'woolworths brisbane',
        'Payment to WOOLWORTHS',
      ];

      for (const desc of testDescriptions) {
        const match = db.prepare(`
          SELECT * FROM auto_category_rule
          WHERE is_active = 1 AND LOWER(?) LIKE '%' || LOWER(match_text) || '%'
          ORDER BY priority LIMIT 1
        `).get(desc);

        expect(match).toBeDefined();
      }
    });

    it('should return first matching rule by priority (first match wins)', () => {
      const now = new Date().toISOString();

      // More specific rule (lower priority number = higher priority)
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'UBER EATS', 'sub-dining', 0, 1, 0, now, now);

      // Less specific rule
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-2', 'UBER', 'sub-groceries', 1, 1, 0, now, now);

      const description = 'UBER EATS SYDNEY';

      // Get all matching rules
      const rules = db.prepare(`
        SELECT * FROM auto_category_rule
        WHERE is_active = 1 AND LOWER(?) LIKE '%' || LOWER(match_text) || '%'
        ORDER BY priority
      `).all(description) as Array<{ id: string; sub_category_id: string }>;

      // Both rules match
      expect(rules).toHaveLength(2);
      // First rule (highest priority) should be UBER EATS -> dining
      expect(rules[0].sub_category_id).toBe('sub-dining');
    });

    it('should not match inactive rules', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 0, 0, now, now); // inactive

      const match = db.prepare(`
        SELECT * FROM auto_category_rule
        WHERE is_active = 1 AND LOWER(?) LIKE '%' || LOWER(match_text) || '%'
        ORDER BY priority LIMIT 1
      `).get('WOOLWORTHS SYDNEY');

      expect(match).toBeUndefined();
    });

    it('should increment match count when rule matches', () => {
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      // Simulate matching and incrementing
      db.prepare('UPDATE auto_category_rule SET match_count = match_count + 1 WHERE id = ?').run('rule-1');
      db.prepare('UPDATE auto_category_rule SET match_count = match_count + 1 WHERE id = ?').run('rule-1');
      db.prepare('UPDATE auto_category_rule SET match_count = match_count + 1 WHERE id = ?').run('rule-1');

      const rule = db.prepare('SELECT match_count FROM auto_category_rule WHERE id = ?').get('rule-1') as { match_count: number };
      expect(rule.match_count).toBe(3);
    });
  });

  describe('Apply Rules to Existing Transactions', () => {
    it('should count matching uncategorized transactions', () => {
      const now = new Date().toISOString();

      // Create transactions
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tx-1', '2024-01-15', 'WOOLWORTHS SYDNEY', -50.00, null, 0, 0, now, now);

      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tx-2', '2024-01-16', 'WOOLWORTHS MELBOURNE', -75.00, null, 0, 0, now, now);

      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tx-3', '2024-01-17', 'COLES EXPRESS', -25.00, null, 0, 0, now, now);

      // Count matching for WOOLWORTHS
      const result = db.prepare(`
        SELECT COUNT(*) as count
        FROM "transaction"
        WHERE is_deleted = 0
          AND is_split = 0
          AND sub_category_id IS NULL
          AND LOWER(description) LIKE '%' || LOWER(?) || '%'
      `).get('WOOLWORTHS') as { count: number };

      expect(result.count).toBe(2);
    });

    it('should apply rule to uncategorized transactions', () => {
      const now = new Date().toISOString();

      // Create rule
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      // Create uncategorized transactions
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tx-1', '2024-01-15', 'WOOLWORTHS SYDNEY', -50.00, null, 0, 0, now, now);

      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tx-2', '2024-01-16', 'WOOLWORTHS MELBOURNE', -75.00, null, 0, 0, now, now);

      // Apply rule
      const result = db.prepare(`
        UPDATE "transaction"
        SET sub_category_id = ?, updated_at = ?
        WHERE is_deleted = 0
          AND is_split = 0
          AND sub_category_id IS NULL
          AND LOWER(description) LIKE '%' || LOWER(?) || '%'
      `).run('sub-groceries', now, 'WOOLWORTHS');

      expect(result.changes).toBe(2);

      // Verify transactions are now categorized
      const tx1 = db.prepare('SELECT sub_category_id FROM "transaction" WHERE id = ?').get('tx-1') as { sub_category_id: string };
      const tx2 = db.prepare('SELECT sub_category_id FROM "transaction" WHERE id = ?').get('tx-2') as { sub_category_id: string };

      expect(tx1.sub_category_id).toBe('sub-groceries');
      expect(tx2.sub_category_id).toBe('sub-groceries');
    });

    it('should not apply to already categorized transactions', () => {
      const now = new Date().toISOString();

      // Create rule
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      // Create already categorized transaction
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tx-1', '2024-01-15', 'WOOLWORTHS SYDNEY', -50.00, 'sub-dining', 0, 0, now, now);

      // Try to apply rule (should not affect already categorized)
      const result = db.prepare(`
        UPDATE "transaction"
        SET sub_category_id = ?, updated_at = ?
        WHERE is_deleted = 0
          AND is_split = 0
          AND sub_category_id IS NULL
          AND LOWER(description) LIKE '%' || LOWER(?) || '%'
      `).run('sub-groceries', now, 'WOOLWORTHS');

      expect(result.changes).toBe(0);

      // Verify transaction still has original category
      const tx = db.prepare('SELECT sub_category_id FROM "transaction" WHERE id = ?').get('tx-1') as { sub_category_id: string };
      expect(tx.sub_category_id).toBe('sub-dining');
    });

    it('should not apply to deleted transactions', () => {
      const now = new Date().toISOString();

      // Create rule
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      // Create deleted transaction
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tx-1', '2024-01-15', 'WOOLWORTHS SYDNEY', -50.00, null, 0, 1, now, now);

      // Try to apply rule
      const result = db.prepare(`
        UPDATE "transaction"
        SET sub_category_id = ?, updated_at = ?
        WHERE is_deleted = 0
          AND is_split = 0
          AND sub_category_id IS NULL
          AND LOWER(description) LIKE '%' || LOWER(?) || '%'
      `).run('sub-groceries', now, 'WOOLWORTHS');

      expect(result.changes).toBe(0);
    });

    it('should not apply to split parent transactions', () => {
      const now = new Date().toISOString();

      // Create rule
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      // Create split parent transaction
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tx-1', '2024-01-15', 'WOOLWORTHS SYDNEY', -100.00, null, 1, 0, now, now);

      // Try to apply rule
      const result = db.prepare(`
        UPDATE "transaction"
        SET sub_category_id = ?, updated_at = ?
        WHERE is_deleted = 0
          AND is_split = 0
          AND sub_category_id IS NULL
          AND LOWER(description) LIKE '%' || LOWER(?) || '%'
      `).run('sub-groceries', now, 'WOOLWORTHS');

      expect(result.changes).toBe(0);
    });
  });

  describe('Add to Top Priority Option', () => {
    // These tests verify the SQL patterns used by createRule({ add_to_top: true })
    // Testing directly with SQL ensures the database behavior matches expectations

    it('should add rule to top with priority 0 when add_to_top is true', () => {
      const now = new Date().toISOString();

      // Create existing rules with priorities 0, 1, 2
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-2', 'COLES', 'sub-groceries', 1, 1, 0, now, now);

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-3', 'ALDI', 'sub-groceries', 2, 1, 0, now, now);

      // Simulate add_to_top logic: shift all existing rules down
      db.prepare('UPDATE auto_category_rule SET priority = priority + 1').run();

      // Insert new rule at priority 0
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-new', 'NETFLIX', 'sub-dining', 0, 1, 0, now, now);

      const rules = db.prepare('SELECT id, match_text, priority FROM auto_category_rule ORDER BY priority').all() as Array<{
        id: string;
        match_text: string;
        priority: number;
      }>;

      expect(rules).toHaveLength(4);
      // New rule should be at top (priority 0)
      expect(rules[0].id).toBe('rule-new');
      expect(rules[0].match_text).toBe('NETFLIX');
      expect(rules[0].priority).toBe(0);
      // Existing rules should be shifted down
      expect(rules[1].id).toBe('rule-1');
      expect(rules[1].priority).toBe(1);
      expect(rules[2].id).toBe('rule-2');
      expect(rules[2].priority).toBe(2);
      expect(rules[3].id).toBe('rule-3');
      expect(rules[3].priority).toBe(3);
    });

    it('should add rule to bottom when add_to_top is false or undefined', () => {
      const now = new Date().toISOString();

      // Create existing rules
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 0, now, now);

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-2', 'COLES', 'sub-groceries', 1, 1, 0, now, now);

      // Get max priority and add at end
      const maxPriority = db.prepare('SELECT COALESCE(MAX(priority), -1) as max FROM auto_category_rule').get() as { max: number };
      const newPriority = maxPriority.max + 1;

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-new', 'NETFLIX', 'sub-dining', newPriority, 1, 0, now, now);

      const rules = db.prepare('SELECT id, match_text, priority FROM auto_category_rule ORDER BY priority').all() as Array<{
        id: string;
        match_text: string;
        priority: number;
      }>;

      expect(rules).toHaveLength(3);
      // New rule should be at bottom
      expect(rules[2].id).toBe('rule-new');
      expect(rules[2].priority).toBe(2);
      // Existing rules should maintain their priorities
      expect(rules[0].id).toBe('rule-1');
      expect(rules[0].priority).toBe(0);
      expect(rules[1].id).toBe('rule-2');
      expect(rules[1].priority).toBe(1);
    });

    it('should add first rule with priority 0 regardless of add_to_top option', () => {
      const now = new Date().toISOString();

      // No existing rules - get max priority
      const maxPriority = db.prepare('SELECT COALESCE(MAX(priority), -1) as max FROM auto_category_rule').get() as { max: number };
      const newPriority = maxPriority.max + 1;

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-first', 'NETFLIX', 'sub-dining', newPriority, 1, 0, now, now);

      const rule = db.prepare('SELECT * FROM auto_category_rule WHERE id = ?').get('rule-first') as { priority: number };

      expect(rule.priority).toBe(0);
    });

    it('should maintain first match wins behavior after adding to top', () => {
      const now = new Date().toISOString();

      // Create a rule that matches "UBER" -> groceries
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-uber', 'UBER', 'sub-groceries', 0, 1, 0, now, now);

      // Add a more specific rule to top: "UBER EATS" -> dining
      db.prepare('UPDATE auto_category_rule SET priority = priority + 1').run();
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-uber-eats', 'UBER EATS', 'sub-dining', 0, 1, 0, now, now);

      // Test matching "UBER EATS SYDNEY" - should match the top rule first
      const matches = db.prepare(`
        SELECT * FROM auto_category_rule
        WHERE is_active = 1 AND LOWER(?) LIKE '%' || LOWER(match_text) || '%'
        ORDER BY priority
      `).all('UBER EATS SYDNEY') as Array<{ id: string; sub_category_id: string }>;

      expect(matches).toHaveLength(2); // Both rules match
      expect(matches[0].id).toBe('rule-uber-eats'); // More specific rule should be first
      expect(matches[0].sub_category_id).toBe('sub-dining');
    });
  });

  describe('Rule Statistics', () => {
    it('should get correct rule statistics', () => {
      const now = new Date().toISOString();

      // Create rules with various states
      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-1', 'WOOLWORTHS', 'sub-groceries', 0, 1, 10, now, now);

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-2', 'COLES', 'sub-groceries', 1, 1, 5, now, now);

      db.prepare(`
        INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('rule-3', 'ALDI', 'sub-groceries', 2, 0, 3, now, now); // inactive

      const stats = db.prepare(`
        SELECT
          COUNT(*) as total_rules,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_rules,
          SUM(match_count) as total_matches
        FROM auto_category_rule
      `).get() as { total_rules: number; active_rules: number; total_matches: number };

      expect(stats.total_rules).toBe(3);
      expect(stats.active_rules).toBe(2);
      expect(stats.total_matches).toBe(18);
    });
  });

  describe('Test Rule (Preview Matches)', () => {
    it('should return matching transactions for rule preview', () => {
      const now = new Date().toISOString();

      // Create uncategorized transactions
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tx-1', '2024-01-15', 'WOOLWORTHS SYDNEY', -50.00, null, 0, 0, now, now);

      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tx-2', '2024-01-16', 'WOOLWORTHS MELBOURNE', -75.00, null, 0, 0, now, now);

      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('tx-3', '2024-01-17', 'COLES EXPRESS', -25.00, null, 0, 0, now, now);

      // Test rule preview
      const matches = db.prepare(`
        SELECT id, description, date, amount
        FROM "transaction"
        WHERE is_deleted = 0
          AND is_split = 0
          AND sub_category_id IS NULL
          AND LOWER(description) LIKE '%' || LOWER(?) || '%'
        ORDER BY date DESC
        LIMIT 10
      `).all('WOOLWORTHS') as Array<{ id: string; description: string; date: string; amount: number }>;

      expect(matches).toHaveLength(2);
      expect(matches[0].description).toBe('WOOLWORTHS MELBOURNE');
      expect(matches[1].description).toBe('WOOLWORTHS SYDNEY');
    });

    it('should respect limit in test results', () => {
      const now = new Date().toISOString();

      // Create many transactions
      for (let i = 0; i < 20; i++) {
        db.prepare(`
          INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(`tx-${i}`, `2024-01-${String(i + 1).padStart(2, '0')}`, `WOOLWORTHS STORE ${i}`, -50.00, null, 0, 0, now, now);
      }

      const matches = db.prepare(`
        SELECT id, description, date, amount
        FROM "transaction"
        WHERE is_deleted = 0
          AND is_split = 0
          AND sub_category_id IS NULL
          AND LOWER(description) LIKE '%' || LOWER(?) || '%'
        ORDER BY date DESC
        LIMIT ?
      `).all('WOOLWORTHS', 5) as Array<{ id: string }>;

      expect(matches).toHaveLength(5);
    });
  });
});
