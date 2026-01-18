/**
 * Tests for Category database operations
 * 
 * These tests verify category CRUD, hierarchy management, and transaction reassignment
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

// Test database path
const TEST_DB_DIR = path.join(process.cwd(), 'data', 'test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'categories-test.db');

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
    is_split INTEGER DEFAULT 0,
    parent_transaction_id TEXT,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (sub_category_id) REFERENCES sub_category(id)
  );
`;

describe('Category Operations', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Ensure test directory exists
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
    
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
    if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
    
    // Create test database
    db = new Database(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    db.exec(TEST_SCHEMA);
    
    // Insert default upper categories
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
      VALUES ('income', 'Income', 'income', 1, ?, ?)
    `).run(now, now);
    
    db.prepare(`
      INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
      VALUES ('expense', 'Expense', 'expense', 2, ?, ?)
    `).run(now, now);
    
    db.prepare(`
      INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
      VALUES ('saving', 'Saving', 'saving', 3, ?, ?)
    `).run(now, now);
  });

  afterEach(() => {
    db.close();
    
    // Clean up test files
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
    if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
  });

  describe('Upper Categories', () => {
    it('should get all upper categories', () => {
      const categories = db.prepare('SELECT * FROM upper_category ORDER BY sort_order').all();
      
      expect(categories).toHaveLength(3);
      expect(categories[0]).toMatchObject({ id: 'income', name: 'Income', type: 'income' });
      expect(categories[1]).toMatchObject({ id: 'expense', name: 'Expense', type: 'expense' });
      expect(categories[2]).toMatchObject({ id: 'saving', name: 'Saving', type: 'saving' });
    });

    it('should get upper category by ID', () => {
      const category = db.prepare('SELECT * FROM upper_category WHERE id = ?').get('income') as {
        id: string;
        name: string;
        type: string;
      };
      
      expect(category).toBeDefined();
      expect(category.name).toBe('Income');
      expect(category.type).toBe('income');
    });

    it('should update upper category name', () => {
      const now = new Date().toISOString();
      db.prepare('UPDATE upper_category SET name = ?, updated_at = ? WHERE id = ?')
        .run('My Income', now, 'income');
      
      const category = db.prepare('SELECT name FROM upper_category WHERE id = ?').get('income') as { name: string };
      expect(category.name).toBe('My Income');
    });
  });

  describe('Sub Categories', () => {
    beforeEach(() => {
      // Add test sub-categories
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('sub-1', 'expense', 'Groceries', 1, 0, ?, ?)
      `).run(now, now);
      
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('sub-2', 'expense', 'Transportation', 2, 0, ?, ?)
      `).run(now, now);
      
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('sub-3', 'income', 'Salary', 1, 0, ?, ?)
      `).run(now, now);
    });

    it('should get all sub-categories', () => {
      const categories = db.prepare(`
        SELECT sc.*, uc.name as upper_category_name
        FROM sub_category sc
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE sc.is_deleted = 0
        ORDER BY uc.sort_order, sc.sort_order
      `).all();
      
      expect(categories).toHaveLength(3);
    });

    it('should get sub-categories by upper category', () => {
      const categories = db.prepare(`
        SELECT * FROM sub_category 
        WHERE upper_category_id = ? AND is_deleted = 0
        ORDER BY sort_order
      `).all('expense');
      
      expect(categories).toHaveLength(2);
    });

    it('should create a new sub-category', () => {
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('sub-4', 'expense', 'Dining Out', 3, 0, ?, ?)
      `).run(now, now);
      
      const category = db.prepare('SELECT * FROM sub_category WHERE id = ?').get('sub-4') as {
        id: string;
        name: string;
        upper_category_id: string;
      };
      
      expect(category).toBeDefined();
      expect(category.name).toBe('Dining Out');
      expect(category.upper_category_id).toBe('expense');
    });

    it('should update a sub-category', () => {
      const now = new Date().toISOString();
      db.prepare('UPDATE sub_category SET name = ?, updated_at = ? WHERE id = ?')
        .run('Food & Groceries', now, 'sub-1');
      
      const category = db.prepare('SELECT name FROM sub_category WHERE id = ?').get('sub-1') as { name: string };
      expect(category.name).toBe('Food & Groceries');
    });

    it('should soft delete a sub-category', () => {
      const now = new Date().toISOString();
      db.prepare('UPDATE sub_category SET is_deleted = 1, updated_at = ? WHERE id = ?')
        .run(now, 'sub-1');
      
      const activeCategories = db.prepare('SELECT * FROM sub_category WHERE is_deleted = 0').all();
      expect(activeCategories).toHaveLength(2);
      
      const allCategories = db.prepare('SELECT * FROM sub_category').all();
      expect(allCategories).toHaveLength(3);
    });

    it('should include deleted categories when requested', () => {
      const now = new Date().toISOString();
      db.prepare('UPDATE sub_category SET is_deleted = 1, updated_at = ? WHERE id = ?')
        .run(now, 'sub-1');

      const withDeleted = db.prepare('SELECT * FROM sub_category').all();
      const withoutDeleted = db.prepare('SELECT * FROM sub_category WHERE is_deleted = 0').all();

      expect(withDeleted).toHaveLength(3);
      expect(withoutDeleted).toHaveLength(2);
    });

    it('should sort sub-categories alphabetically within each upper category', () => {
      const now = new Date().toISOString();

      // Add more categories with non-alphabetical sort_order to verify name sorting
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('sub-4', 'expense', 'Aardvark Expenses', 99, 0, ?, ?)
      `).run(now, now);

      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('sub-5', 'expense', 'zebra costs', 1, 0, ?, ?)
      `).run(now, now);

      // Query with alphabetical sorting (case-insensitive)
      const categories = db.prepare(`
        SELECT sc.*, uc.name as upper_category_name
        FROM sub_category sc
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE sc.is_deleted = 0 AND sc.upper_category_id = 'expense'
        ORDER BY sc.name COLLATE NOCASE ASC
      `).all() as Array<{ id: string; name: string }>;

      // Should be sorted: Aardvark, Groceries, Transportation, zebra
      expect(categories).toHaveLength(4);
      expect(categories[0].name).toBe('Aardvark Expenses');
      expect(categories[1].name).toBe('Groceries');
      expect(categories[2].name).toBe('Transportation');
      expect(categories[3].name).toBe('zebra costs');
    });
  });

  describe('Category-Transaction Relationships', () => {
    beforeEach(() => {
      const now = new Date().toISOString();
      
      // Add sub-categories
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('sub-1', 'expense', 'Groceries', 1, 0, ?, ?)
      `).run(now, now);
      
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('sub-2', 'expense', 'Transportation', 2, 0, ?, ?)
      `).run(now, now);
      
      // Add transactions
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-1', '2025-01-15', 'Grocery Store', -50.00, 'sub-1', 0, 0, ?, ?)
      `).run(now, now);
      
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-2', '2025-01-16', 'More Groceries', -30.00, 'sub-1', 0, 0, ?, ?)
      `).run(now, now);
    });

    it('should check if category has transactions', () => {
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM "transaction" 
        WHERE sub_category_id = ? AND is_deleted = 0
      `).get('sub-1') as { count: number };
      
      expect(result.count).toBe(2);
    });

    it('should reassign transactions to another category', () => {
      const now = new Date().toISOString();
      
      db.prepare(`
        UPDATE "transaction" SET sub_category_id = ?, updated_at = ?
        WHERE sub_category_id = ? AND is_deleted = 0
      `).run('sub-2', now, 'sub-1');
      
      const sub1Count = db.prepare(`
        SELECT COUNT(*) as count FROM "transaction" WHERE sub_category_id = 'sub-1'
      `).get() as { count: number };
      
      const sub2Count = db.prepare(`
        SELECT COUNT(*) as count FROM "transaction" WHERE sub_category_id = 'sub-2'
      `).get() as { count: number };
      
      expect(sub1Count.count).toBe(0);
      expect(sub2Count.count).toBe(2);
    });

    it('should reassign transactions to uncategorized (null)', () => {
      const now = new Date().toISOString();
      
      db.prepare(`
        UPDATE "transaction" SET sub_category_id = NULL, updated_at = ?
        WHERE sub_category_id = ? AND is_deleted = 0
      `).run(now, 'sub-1');
      
      const uncategorized = db.prepare(`
        SELECT COUNT(*) as count FROM "transaction" WHERE sub_category_id IS NULL
      `).get() as { count: number };
      
      expect(uncategorized.count).toBe(2);
    });
  });

  describe('Category Reordering', () => {
    beforeEach(() => {
      const now = new Date().toISOString();
      
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('sub-1', 'expense', 'Groceries', 1, 0, ?, ?)
      `).run(now, now);
      
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('sub-2', 'expense', 'Transportation', 2, 0, ?, ?)
      `).run(now, now);
      
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('sub-3', 'expense', 'Entertainment', 3, 0, ?, ?)
      `).run(now, now);
    });

    it('should reorder sub-categories', () => {
      const now = new Date().toISOString();
      const newOrder = ['sub-3', 'sub-1', 'sub-2'];
      
      newOrder.forEach((id, index) => {
        db.prepare('UPDATE sub_category SET sort_order = ?, updated_at = ? WHERE id = ?')
          .run(index + 1, now, id);
      });
      
      const categories = db.prepare(`
        SELECT id, sort_order FROM sub_category 
        WHERE upper_category_id = 'expense' 
        ORDER BY sort_order
      `).all() as Array<{ id: string; sort_order: number }>;
      
      expect(categories[0].id).toBe('sub-3');
      expect(categories[1].id).toBe('sub-1');
      expect(categories[2].id).toBe('sub-2');
    });
  });
});



