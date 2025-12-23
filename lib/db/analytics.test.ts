/**
 * Tests for Analytics database operations
 *
 * These tests verify dashboard analytics calculations including:
 * - Summary calculations (income, spending, savings)
 * - Monthly trends
 * - Category breakdowns
 * - Monthly category totals table
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

const TEST_DB_DIR = path.join(process.cwd(), 'data', 'test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'analytics-test.db');

// Schema for testing analytics
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
    FOREIGN KEY (sub_category_id) REFERENCES sub_category(id),
    FOREIGN KEY (parent_transaction_id) REFERENCES "transaction"(id)
  );
`;

describe('Analytics Functions', () => {
  let db: Database.Database;
  const now = new Date().toISOString();

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

    // Insert upper categories
    const insertUpperCat = db.prepare(`
      INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertUpperCat.run('uc-income', 'Income', 'income', 1, now, now);
    insertUpperCat.run('uc-expense', 'Expense', 'expense', 2, now, now);
    insertUpperCat.run('uc-bill', 'Bill', 'bill', 3, now, now);
    insertUpperCat.run('uc-saving', 'Saving', 'saving', 4, now, now);
    insertUpperCat.run('uc-debt', 'Debt', 'debt', 5, now, now);
    insertUpperCat.run('uc-transfer', 'Transfer', 'transfer', 6, now, now);

    // Insert sub categories
    const insertSubCat = db.prepare(`
      INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `);
    insertSubCat.run('sc-salary', 'uc-income', 'Salary', 1, now, now);
    insertSubCat.run('sc-bonus', 'uc-income', 'Bonus', 2, now, now);
    insertSubCat.run('sc-food', 'uc-expense', 'Food', 1, now, now);
    insertSubCat.run('sc-transport', 'uc-expense', 'Transport', 2, now, now);
    insertSubCat.run('sc-groceries', 'uc-bill', 'Groceries', 1, now, now);
    insertSubCat.run('sc-invest', 'uc-saving', 'Invest', 1, now, now);
    insertSubCat.run('sc-mortgage', 'uc-debt', 'Mortgage', 1, now, now);
    insertSubCat.run('sc-transfer-out', 'uc-transfer', 'Transfer Out', 1, now, now);
  });

  afterEach(() => {
    db.close();

    // Clean up test files
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
    if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
  });

  describe('Dashboard Summary Calculations', () => {
    it('should calculate total income correctly', () => {
      // Insert income transactions
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-15', 'Salary Jan', 5000, 'sc-salary', now, now);
      insertTx.run('tx-2', '2025-02-15', 'Salary Feb', 5000, 'sc-salary', now, now);
      insertTx.run('tx-3', '2025-01-20', 'Bonus', 1000, 'sc-bonus', now, now);

      // Query total income for 2025
      const result = db.prepare(`
        SELECT COALESCE(SUM(t.amount), 0) as total_income
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type = 'income'
      `).get() as { total_income: number };

      expect(result.total_income).toBe(11000);
    });

    it('should calculate total spending correctly (expense + bill + debt + saving)', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      // Expenses are negative amounts
      insertTx.run('tx-1', '2025-01-10', 'Lunch', -50, 'sc-food', now, now);
      insertTx.run('tx-2', '2025-01-12', 'Bus', -20, 'sc-transport', now, now);
      insertTx.run('tx-3', '2025-01-15', 'Groceries', -300, 'sc-groceries', now, now);
      insertTx.run('tx-4', '2025-01-20', 'Invest', -500, 'sc-invest', now, now);
      insertTx.run('tx-5', '2025-01-25', 'Mortgage', -1500, 'sc-mortgage', now, now);

      // Query total spending for 2025
      const result = db.prepare(`
        SELECT COALESCE(SUM(ABS(t.amount)), 0) as total_spend
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type IN ('expense', 'bill', 'debt', 'saving')
      `).get() as { total_spend: number };

      // 50 + 20 + 300 + 500 + 1500 = 2370
      expect(result.total_spend).toBe(2370);
    });

    it('should exclude transfer category from spending calculations', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-10', 'Food', -100, 'sc-food', now, now);
      insertTx.run('tx-2', '2025-01-15', 'Transfer to savings', -500, 'sc-transfer-out', now, now);

      // Query spending excluding transfers
      const result = db.prepare(`
        SELECT COALESCE(SUM(ABS(t.amount)), 0) as total_spend
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type IN ('expense', 'bill', 'debt', 'saving')
      `).get() as { total_spend: number };

      // Only food (100), transfer is excluded
      expect(result.total_spend).toBe(100);
    });

    it('should exclude soft-deleted transactions from calculations', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-10', 'Active expense', -100, 'sc-food', 0, now, now);
      insertTx.run('tx-2', '2025-01-15', 'Deleted expense', -200, 'sc-food', 1, now, now);

      const result = db.prepare(`
        SELECT COALESCE(SUM(ABS(t.amount)), 0) as total
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type = 'expense'
      `).get() as { total: number };

      expect(result.total).toBe(100);
    });

    it('should exclude split parent transactions from totals', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, parent_transaction_id, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      `);
      // Parent transaction (is_split = 1)
      insertTx.run('tx-parent', '2025-01-10', 'Parent expense', -100, 'sc-food', 1, null, now, now);
      // Child transactions (is_split = 0)
      insertTx.run('tx-child-1', '2025-01-10', 'Child 1', -60, 'sc-food', 0, 'tx-parent', now, now);
      insertTx.run('tx-child-2', '2025-01-10', 'Child 2', -40, 'sc-food', 0, 'tx-parent', now, now);

      const result = db.prepare(`
        SELECT COALESCE(SUM(ABS(t.amount)), 0) as total
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type = 'expense'
      `).get() as { total: number };

      // Should be 100 (60 + 40), not 200 (100 + 60 + 40)
      expect(result.total).toBe(100);
    });

    it('should calculate savings rate correctly', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-15', 'Salary', 5000, 'sc-salary', now, now);
      insertTx.run('tx-2', '2025-01-20', 'Invest', -500, 'sc-invest', now, now);

      // Get income
      const incomeResult = db.prepare(`
        SELECT COALESCE(SUM(t.amount), 0) as total
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type = 'income'
      `).get() as { total: number };

      // Get savings
      const savingsResult = db.prepare(`
        SELECT COALESCE(SUM(ABS(t.amount)), 0) as total
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type = 'saving'
      `).get() as { total: number };

      const savingsRate = incomeResult.total > 0
        ? Math.round((savingsResult.total / incomeResult.total) * 100)
        : 0;

      expect(savingsRate).toBe(10); // 500 / 5000 = 10%
    });
  });

  describe('Monthly Trends', () => {
    it('should return data for all 12 months', () => {
      const result = db.prepare(`
        WITH RECURSIVE months AS (
          SELECT 1 as month_num
          UNION ALL
          SELECT month_num + 1
          FROM months
          WHERE month_num < 12
        )
        SELECT '2025' || '-' || printf('%02d', month_num) as month
        FROM months
      `).all() as Array<{ month: string }>;

      expect(result).toHaveLength(12);
      expect(result[0].month).toBe('2025-01');
      expect(result[11].month).toBe('2025-12');
    });

    it('should calculate monthly totals by upper category type', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-15', 'Salary', 5000, 'sc-salary', now, now);
      insertTx.run('tx-2', '2025-01-10', 'Food', -100, 'sc-food', now, now);
      insertTx.run('tx-3', '2025-02-15', 'Salary', 5000, 'sc-salary', now, now);
      insertTx.run('tx-4', '2025-02-10', 'Food', -150, 'sc-food', now, now);

      const result = db.prepare(`
        SELECT
          strftime('%Y-%m', t.date) as month,
          COALESCE(SUM(CASE WHEN uc.type = 'income' THEN t.amount ELSE 0 END), 0) as income,
          COALESCE(SUM(CASE WHEN uc.type = 'expense' THEN ABS(t.amount) ELSE 0 END), 0) as expenses
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
        GROUP BY strftime('%Y-%m', t.date)
        ORDER BY month
      `).all() as Array<{ month: string; income: number; expenses: number }>;

      expect(result[0].month).toBe('2025-01');
      expect(result[0].income).toBe(5000);
      expect(result[0].expenses).toBe(100);
      expect(result[1].month).toBe('2025-02');
      expect(result[1].income).toBe(5000);
      expect(result[1].expenses).toBe(150);
    });
  });

  describe('Upper Category Breakdown', () => {
    it('should group spending by upper category type', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-10', 'Food', -100, 'sc-food', now, now);
      insertTx.run('tx-2', '2025-01-12', 'Transport', -50, 'sc-transport', now, now);
      insertTx.run('tx-3', '2025-01-15', 'Groceries', -300, 'sc-groceries', now, now);
      insertTx.run('tx-4', '2025-01-20', 'Invest', -500, 'sc-invest', now, now);
      insertTx.run('tx-5', '2025-01-25', 'Mortgage', -1000, 'sc-mortgage', now, now);

      const result = db.prepare(`
        SELECT
          uc.type,
          COALESCE(SUM(ABS(t.amount)), 0) as amount
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type IN ('expense', 'bill', 'debt', 'saving')
        GROUP BY uc.type
        HAVING SUM(ABS(t.amount)) > 0
        ORDER BY amount DESC
      `).all() as Array<{ type: string; amount: number }>;

      expect(result).toHaveLength(4);
      // debt: 1000, saving: 500, bill: 300, expense: 150
      expect(result[0].type).toBe('debt');
      expect(result[0].amount).toBe(1000);
      expect(result[1].type).toBe('saving');
      expect(result[1].amount).toBe(500);
    });

    it('should calculate percentages correctly', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-10', 'Food', -50, 'sc-food', now, now);
      insertTx.run('tx-2', '2025-01-15', 'Groceries', -50, 'sc-groceries', now, now);

      const result = db.prepare(`
        SELECT
          uc.type,
          COALESCE(SUM(ABS(t.amount)), 0) as amount
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type IN ('expense', 'bill', 'debt', 'saving')
        GROUP BY uc.type
      `).all() as Array<{ type: string; amount: number }>;

      const total = result.reduce((sum, r) => sum + r.amount, 0);
      const percentages = result.map(r => ({
        type: r.type,
        percentage: Math.round((r.amount / total) * 100)
      }));

      // Each should be 50%
      expect(percentages[0].percentage).toBe(50);
      expect(percentages[1].percentage).toBe(50);
    });
  });

  describe('Expense Breakdown by Subcategory', () => {
    it('should group spending by subcategory', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-10', 'Lunch', -30, 'sc-food', now, now);
      insertTx.run('tx-2', '2025-01-12', 'Dinner', -50, 'sc-food', now, now);
      insertTx.run('tx-3', '2025-01-15', 'Bus', -20, 'sc-transport', now, now);

      const result = db.prepare(`
        SELECT
          sc.id as category_id,
          sc.name as category_name,
          uc.name as upper_category_name,
          uc.type as upper_category_type,
          COALESCE(SUM(ABS(t.amount)), 0) as amount
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type IN ('expense', 'bill', 'debt', 'saving')
        GROUP BY sc.id
        HAVING SUM(ABS(t.amount)) > 0
        ORDER BY amount DESC
      `).all() as Array<{ category_name: string; amount: number }>;

      expect(result).toHaveLength(2);
      expect(result[0].category_name).toBe('Food');
      expect(result[0].amount).toBe(80); // 30 + 50
      expect(result[1].category_name).toBe('Transport');
      expect(result[1].amount).toBe(20);
    });
  });

  describe('Monthly Category Totals Table', () => {
    it('should return monthly totals for each subcategory', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-10', 'Food Jan', -100, 'sc-food', now, now);
      insertTx.run('tx-2', '2025-02-10', 'Food Feb', -120, 'sc-food', now, now);
      insertTx.run('tx-3', '2025-01-15', 'Salary Jan', 5000, 'sc-salary', now, now);

      const result = db.prepare(`
        SELECT
          uc.name as upper_category,
          uc.type as upper_category_type,
          sc.name as sub_category,
          CAST(strftime('%m', t.date) AS INTEGER) as month_num,
          COALESCE(SUM(ABS(t.amount)), 0) as amount
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type != 'transfer'
        GROUP BY uc.name, uc.type, sc.name, month_num
        ORDER BY uc.type, uc.name, sc.name, month_num
      `).all() as Array<{
        upper_category: string;
        sub_category: string;
        month_num: number;
        amount: number;
      }>;

      expect(result.length).toBeGreaterThan(0);

      // Check Food entries
      const foodJan = result.find(r => r.sub_category === 'Food' && r.month_num === 1);
      const foodFeb = result.find(r => r.sub_category === 'Food' && r.month_num === 2);
      expect(foodJan?.amount).toBe(100);
      expect(foodFeb?.amount).toBe(120);

      // Check Salary entry
      const salaryJan = result.find(r => r.sub_category === 'Salary' && r.month_num === 1);
      expect(salaryJan?.amount).toBe(5000);
    });

    it('should exclude transfer category from monthly totals', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-10', 'Food', -100, 'sc-food', now, now);
      insertTx.run('tx-2', '2025-01-15', 'Transfer', -500, 'sc-transfer-out', now, now);

      const result = db.prepare(`
        SELECT sc.name as sub_category
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type != 'transfer'
        GROUP BY sc.name
      `).all() as Array<{ sub_category: string }>;

      const subCategories = result.map(r => r.sub_category);
      expect(subCategories).toContain('Food');
      expect(subCategories).not.toContain('Transfer Out');
    });

    it('should calculate year totals correctly', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-10', 'Food Jan', -100, 'sc-food', now, now);
      insertTx.run('tx-2', '2025-02-10', 'Food Feb', -120, 'sc-food', now, now);
      insertTx.run('tx-3', '2025-03-10', 'Food Mar', -80, 'sc-food', now, now);

      const result = db.prepare(`
        SELECT
          sc.name as sub_category,
          COALESCE(SUM(ABS(t.amount)), 0) as year_total
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type != 'transfer'
        GROUP BY sc.name
      `).get() as { sub_category: string; year_total: number };

      expect(result.year_total).toBe(300); // 100 + 120 + 80
    });
  });

  describe('Income Trends by Subcategory', () => {
    it('should return income broken down by subcategory per month', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-15', 'Salary Jan', 5000, 'sc-salary', now, now);
      insertTx.run('tx-2', '2025-01-20', 'Bonus Jan', 500, 'sc-bonus', now, now);
      insertTx.run('tx-3', '2025-02-15', 'Salary Feb', 5000, 'sc-salary', now, now);

      const result = db.prepare(`
        SELECT
          strftime('%Y-%m', t.date) as month,
          sc.name as subcategory_name,
          COALESCE(SUM(t.amount), 0) as amount
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type = 'income'
        GROUP BY strftime('%Y-%m', t.date), sc.name
        ORDER BY month, amount DESC
      `).all() as Array<{ month: string; subcategory_name: string; amount: number }>;

      expect(result.length).toBe(3);

      const janSalary = result.find(r => r.month === '2025-01' && r.subcategory_name === 'Salary');
      const janBonus = result.find(r => r.month === '2025-01' && r.subcategory_name === 'Bonus');
      const febSalary = result.find(r => r.month === '2025-02' && r.subcategory_name === 'Salary');

      expect(janSalary?.amount).toBe(5000);
      expect(janBonus?.amount).toBe(500);
      expect(febSalary?.amount).toBe(5000);
    });

    it('should only include income category transactions', () => {
      const insertTx = db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)
      `);
      insertTx.run('tx-1', '2025-01-15', 'Salary', 5000, 'sc-salary', now, now);
      insertTx.run('tx-2', '2025-01-10', 'Food', -100, 'sc-food', now, now);

      const result = db.prepare(`
        SELECT sc.name as subcategory_name
        FROM "transaction" t
        JOIN sub_category sc ON t.sub_category_id = sc.id
        JOIN upper_category uc ON sc.upper_category_id = uc.id
        WHERE strftime('%Y', t.date) = '2025'
          AND t.is_deleted = 0
          AND t.is_split = 0
          AND uc.type = 'income'
        GROUP BY sc.name
      `).all() as Array<{ subcategory_name: string }>;

      const names = result.map(r => r.subcategory_name);
      expect(names).toContain('Salary');
      expect(names).not.toContain('Food');
    });
  });
});
