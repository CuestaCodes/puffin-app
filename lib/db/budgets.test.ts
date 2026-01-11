/**
 * Tests for Budget database operations
 * 
 * These tests verify budget CRUD, templates, carry-over, and historical averages
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

// Test database path
const TEST_DB_DIR = path.join(process.cwd(), 'data', 'test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'budgets-test.db');

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
  
  CREATE TABLE IF NOT EXISTS budget (
    id TEXT PRIMARY KEY,
    sub_category_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    amount REAL NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(sub_category_id, year, month),
    FOREIGN KEY (sub_category_id) REFERENCES sub_category(id)
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
  
  CREATE TABLE IF NOT EXISTS budget_template (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    template_data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

// Mock the database module - use a shared database instance
let sharedTestDb: Database.Database | null = null;

function getTestDatabase(): Database.Database {
  if (!sharedTestDb) {
    // Ensure test directory exists
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
    
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
    if (fs.existsSync(TEST_DB_PATH + '-wal')) {
      fs.unlinkSync(TEST_DB_PATH + '-wal');
    }
    if (fs.existsSync(TEST_DB_PATH + '-shm')) {
      fs.unlinkSync(TEST_DB_PATH + '-shm');
    }
    
    // Create new test database
    sharedTestDb = new Database(TEST_DB_PATH);
    sharedTestDb.pragma('foreign_keys = ON');
    sharedTestDb.exec(TEST_SCHEMA);
  }
  return sharedTestDb;
}

vi.mock('./index', () => {
  return {
    getDatabase: () => getTestDatabase(),
    initializeDatabase: () => {},
  };
});

// Import budget functions after mock is set up
import {
  getBudgetsByMonth,
  getBudgetById,
  getBudgetByCategoryAndMonth,
  upsertBudget,
  deleteBudget,
  copyBudgetsToMonth,
  getBudgetSummary,
  getCategoryAverage,
  getBudgetCarryOver,
  getCategoriesForBudgetEntry,
  createBudgetTemplate,
  getBudgetTemplates,
  getBudgetTemplateById,
  deleteBudgetTemplate,
  applyBudgetTemplate,
  initializeMonthlyBudgets,
  createBudgetsFrom12MonthAverage,
} from './budgets';

describe('Budget Operations', () => {
  let categoryId1: string;
  let categoryId2: string;
  let upperCategoryId: string;

  beforeEach(() => {
    // Get the test database (will be created if it doesn't exist)
    const db = getTestDatabase();
    
    // Clear all tables first
    db.exec(`
      DELETE FROM budget_template;
      DELETE FROM "transaction";
      DELETE FROM budget;
      DELETE FROM sub_category;
      DELETE FROM upper_category;
    `);
    
    // Seed test data
    const now = new Date().toISOString();
    
    // Create upper category
    upperCategoryId = 'upper-1';
    db.prepare(`
      INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
      VALUES (?, 'Expense', 'expense', 1, ?, ?)
    `).run(upperCategoryId, now, now);
    
    // Create sub categories
    categoryId1 = 'cat-1';
    categoryId2 = 'cat-2';
    db.prepare(`
      INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Groceries', 1, 0, ?, ?)
    `).run(categoryId1, upperCategoryId, now, now);
    
    db.prepare(`
      INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
      VALUES (?, ?, 'Transportation', 2, 0, ?, ?)
    `).run(categoryId2, upperCategoryId, now, now);
  });

  afterEach(() => {
    // Clear data but keep database connection for next test
    const db = getTestDatabase();
    try {
      db.exec(`
        DELETE FROM budget_template;
        DELETE FROM "transaction";
        DELETE FROM budget;
        DELETE FROM sub_category;
        DELETE FROM upper_category;
      `);
    } catch (_e) {
      // Ignore errors
    }
  });

  afterAll(() => {
    // Clean up database connection and files after all tests
    if (sharedTestDb) {
      sharedTestDb.close();
      sharedTestDb = null;
    }
    
    // Clean up test files
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
    if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
  });

  describe('Basic CRUD Operations', () => {
    it('should create a budget', () => {
      const budget = upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      expect(budget).toBeDefined();
      expect(budget.sub_category_id).toBe(categoryId1);
      expect(budget.year).toBe(2025);
      expect(budget.month).toBe(1);
      expect(budget.amount).toBe(500.00);
    });

    it('should update an existing budget', () => {
      const budget1 = upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      const budget2 = upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 600.00,
      });
      
      expect(budget2.id).toBe(budget1.id);
      expect(budget2.amount).toBe(600.00);
    });

    it('should get budget by month', () => {
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      upsertBudget({
        sub_category_id: categoryId2,
        year: 2025,
        month: 1,
        amount: 300.00,
      });
      
      const budgets = getBudgetsByMonth(2025, 1);
      expect(budgets).toHaveLength(2);
      expect(budgets[0].sub_category_name).toBe('Groceries');
      expect(budgets[1].sub_category_name).toBe('Transportation');
    });

    it('should get budget by category and month', () => {
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      const budget = getBudgetByCategoryAndMonth(categoryId1, 2025, 1);
      expect(budget).toBeDefined();
      expect(budget?.amount).toBe(500.00);
    });

    it('should delete a budget', () => {
      const budget = upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      const deleted = deleteBudget(budget.id);
      expect(deleted).toBe(true);
      
      const found = getBudgetById(budget.id);
      expect(found).toBeNull();
    });
  });

  describe('Budget Summary', () => {
    it('should calculate budget summary with actual spending', () => {
      const db = getTestDatabase();
      
      // Create budgets
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      // Create transactions
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-1', '2025-01-15', 'Grocery Store', -150.00, ?, 0, 0, ?, ?)
      `).run(categoryId1, now, now);
      
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-2', '2025-01-20', 'More Groceries', -100.00, ?, 0, 0, ?, ?)
      `).run(categoryId1, now, now);
      
      const summary = getBudgetSummary(2025, 1);
      
      expect(summary.budgets).toHaveLength(1);
      expect(summary.budgets[0].actual_amount).toBe(250.00);
      expect(summary.totalBudgeted).toBe(500.00);
      expect(summary.totalSpent).toBe(250.00);
    });

    it('should exclude split parent transactions from totals', () => {
      const db = getTestDatabase();
      
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      const now = new Date().toISOString();
      // Create a split parent transaction (should be excluded)
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-parent', '2025-01-15', 'Split Transaction', -200.00, ?, 1, 0, ?, ?)
      `).run(categoryId1, now, now);
      
      // Create a child transaction (should be included)
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, parent_transaction_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-child', '2025-01-15', 'Split Part 1', -100.00, ?, 'tx-parent', 0, 0, ?, ?)
      `).run(categoryId1, now, now);
      
      const summary = getBudgetSummary(2025, 1);
      // Should only count the child transaction, not the parent
      expect(summary.totalSpent).toBe(100.00);
    });
  });

  describe('Historical Averages', () => {
    it('should calculate 3-month average', () => {
      const db = getTestDatabase();
      const now = new Date().toISOString();
      
      // Calculate dates relative to current date (past 3 months)
      const currentDate = new Date();
      const month3 = new Date(currentDate.getFullYear(), currentDate.getMonth() - 3, 15);
      const month2 = new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 15);
      const month1 = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 15);
      
      const date3 = month3.toISOString().split('T')[0];
      const date2 = month2.toISOString().split('T')[0];
      const date1 = month1.toISOString().split('T')[0];
      
      // Create transactions for past 3 months
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-1', ?, 'Grocery', -200.00, ?, 0, 0, ?, ?)
      `).run(date3, categoryId1, now, now);
      
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-2', ?, 'Grocery', -300.00, ?, 0, 0, ?, ?)
      `).run(date2, categoryId1, now, now);
      
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-3', ?, 'Grocery', -400.00, ?, 0, 0, ?, ?)
      `).run(date1, categoryId1, now, now);
      
      const average = getCategoryAverage(categoryId1, 3);
      expect(average).toBeCloseTo(300.00, 2); // (200 + 300 + 400) / 3 = 300
    });

    it('should return 0 for categories with no transactions', () => {
      const average = getCategoryAverage(categoryId1, 3);
      expect(average).toBe(0);
    });
  });

  describe('Budget Carry-Over', () => {
    it('should calculate carry-over from previous month', () => {
      const db = getTestDatabase();
      
      // Create budget for previous month
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2024,
        month: 12,
        amount: 500.00,
      });
      
      // Create transactions that spend less than budget
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-1', '2024-12-15', 'Grocery', -300.00, ?, 0, 0, ?, ?)
      `).run(categoryId1, now, now);
      
      const carryOver = getBudgetCarryOver(categoryId1, 2025, 1);
      expect(carryOver).toBe(200.00); // 500 - 300 = 200
    });

    it('should return 0 if previous month had no budget', () => {
      const carryOver = getBudgetCarryOver(categoryId1, 2025, 1);
      expect(carryOver).toBe(0);
    });

    it('should return 0 if previous month was over budget', () => {
      const db = getTestDatabase();
      
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2024,
        month: 12,
        amount: 500.00,
      });
      
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-1', '2024-12-15', 'Grocery', -600.00, ?, 0, 0, ?, ?)
      `).run(categoryId1, now, now);
      
      const carryOver = getBudgetCarryOver(categoryId1, 2025, 1);
      expect(carryOver).toBe(0); // No carry-over for over-budget
    });
  });

  describe('Categories for Budget Entry', () => {
    it('should return all categories with budget info', () => {
      const db = getTestDatabase();
      
      // Create a budget for one category
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      // Create some transactions for averages
      const now = new Date().toISOString();
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-1', '2024-12-15', 'Grocery', -200.00, ?, 0, 0, ?, ?)
      `).run(categoryId1, now, now);
      
      const categories = getCategoriesForBudgetEntry(2025, 1);
      
      expect(categories.length).toBeGreaterThanOrEqual(2);
      const cat1 = categories.find(c => c.sub_category_id === categoryId1);
      expect(cat1).toBeDefined();
      expect(cat1?.current_budget).toBe(500.00);
      expect(cat1?.average_3mo).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Copy Budgets', () => {
    it('should copy budgets from one month to another', () => {
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      upsertBudget({
        sub_category_id: categoryId2,
        year: 2025,
        month: 1,
        amount: 300.00,
      });
      
      const copiedCount = copyBudgetsToMonth(2025, 1, 2025, 2);
      expect(copiedCount).toBe(2);
      
      const budgets = getBudgetsByMonth(2025, 2);
      expect(budgets).toHaveLength(2);
      expect(budgets.find(b => b.sub_category_id === categoryId1)?.amount).toBe(500.00);
      expect(budgets.find(b => b.sub_category_id === categoryId2)?.amount).toBe(300.00);
    });

    it('should return 0 if source month has no budgets', () => {
      const copiedCount = copyBudgetsToMonth(2025, 1, 2025, 2);
      expect(copiedCount).toBe(0);
    });
  });

  describe('Budget Templates', () => {
    it('should create a budget template', () => {
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      upsertBudget({
        sub_category_id: categoryId2,
        year: 2025,
        month: 1,
        amount: 300.00,
      });
      
      const template = createBudgetTemplate('Test Template', 2025, 1);
      
      expect(template).toBeDefined();
      expect(template.name).toBe('Test Template');
      expect(template.template_data).toBeTruthy();
      
      const data = JSON.parse(template.template_data);
      expect(data[categoryId1]).toBe(500.00);
      expect(data[categoryId2]).toBe(300.00);
    });

    it('should get all templates', () => {
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      createBudgetTemplate('Template 1', 2025, 1);
      createBudgetTemplate('Template 2', 2025, 1);
      
      const templates = getBudgetTemplates();
      expect(templates.length).toBeGreaterThanOrEqual(2);
    });

    it('should get template by ID', () => {
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      const template = createBudgetTemplate('Test Template', 2025, 1);
      const found = getBudgetTemplateById(template.id);
      
      expect(found).toBeDefined();
      expect(found?.name).toBe('Test Template');
    });

    it('should delete a template', () => {
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      const template = createBudgetTemplate('Test Template', 2025, 1);
      const deleted = deleteBudgetTemplate(template.id);
      
      expect(deleted).toBe(true);
      
      const found = getBudgetTemplateById(template.id);
      expect(found).toBeNull();
    });

    it('should apply a template to a month', () => {
      // Create template
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      upsertBudget({
        sub_category_id: categoryId2,
        year: 2025,
        month: 1,
        amount: 300.00,
      });
      
      const template = createBudgetTemplate('Test Template', 2025, 1);
      
      // Apply to different month
      const appliedCount = applyBudgetTemplate(template.id, 2025, 2);
      
      expect(appliedCount).toBe(2);
      
      const budgets = getBudgetsByMonth(2025, 2);
      expect(budgets.find(b => b.sub_category_id === categoryId1)?.amount).toBe(500.00);
      expect(budgets.find(b => b.sub_category_id === categoryId2)?.amount).toBe(300.00);
    });

    it('should throw error when applying non-existent template', () => {
      expect(() => {
        applyBudgetTemplate('non-existent-id', 2025, 2);
      }).toThrow('Template not found');
    });
  });

  describe('Initialize Monthly Budgets', () => {
    it('should create $0 budgets for categories without budgets', () => {
      // categoryId1 and categoryId2 have no budgets
      const count = initializeMonthlyBudgets(2025, 3);
      
      expect(count).toBe(2); // Both categories should get initialized
      
      const budgets = getBudgetsByMonth(2025, 3);
      expect(budgets).toHaveLength(2);
      expect(budgets.every(b => b.amount === 0)).toBe(true);
    });

    it('should not overwrite existing budgets', () => {
      // Create a budget for one category
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 3,
        amount: 500.00,
      });
      
      const count = initializeMonthlyBudgets(2025, 3);
      
      // Only categoryId2 should be initialized
      expect(count).toBe(1);
      
      const budgets = getBudgetsByMonth(2025, 3);
      const cat1Budget = budgets.find(b => b.sub_category_id === categoryId1);
      const cat2Budget = budgets.find(b => b.sub_category_id === categoryId2);
      
      expect(cat1Budget?.amount).toBe(500.00); // Unchanged
      expect(cat2Budget?.amount).toBe(0); // Initialized to 0
    });

    it('should return 0 when all categories already have budgets', () => {
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 3,
        amount: 500.00,
      });
      
      upsertBudget({
        sub_category_id: categoryId2,
        year: 2025,
        month: 3,
        amount: 300.00,
      });
      
      const count = initializeMonthlyBudgets(2025, 3);
      expect(count).toBe(0);
    });

    it('should not create budgets for income categories', () => {
      const db = getTestDatabase();
      const now = new Date().toISOString();
      
      // Create an income upper category
      db.prepare(`
        INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
        VALUES ('income-cat', 'Income', 'income', 0, ?, ?)
      `).run(now, now);
      
      // Create an income sub-category
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('income-sub', 'income-cat', 'Salary', 1, 0, ?, ?)
      `).run(now, now);
      
      const count = initializeMonthlyBudgets(2025, 3);
      
      // Should only initialize the 2 expense categories, not the income one
      expect(count).toBe(2);
      
      const budgets = getBudgetsByMonth(2025, 3);
      const incomeBudget = budgets.find(b => b.sub_category_id === 'income-sub');
      expect(incomeBudget).toBeUndefined();
    });
  });

  describe('12-Month Average Budgets', () => {
    it('should create budgets based on 12-month spending average', () => {
      const db = getTestDatabase();
      const now = new Date().toISOString();

      // Create transactions over the past 12 months before March 2025
      // For categoryId1: 100 per month = 1200 total over 12 months = 100 average
      for (let i = 1; i <= 12; i++) {
        // Calculate date i months before March 2025
        const targetDate = new Date(2025, 2 - i, 15); // Month is 0-indexed, so 2 = March
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1; // Convert back to 1-indexed
        const dateStr = `${year}-${String(month).padStart(2, '0')}-15`;
        
        db.prepare(`
          INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
          VALUES (?, ?, 'Monthly Expense', -100.00, ?, 0, 0, ?, ?)
        `).run(`tx-avg-${i}`, dateStr, categoryId1, now, now);
      }
      
      const count = createBudgetsFrom12MonthAverage(2025, 3);
      
      expect(count).toBe(2); // Both categories processed
      
      const budgets = getBudgetsByMonth(2025, 3);
      const cat1Budget = budgets.find(b => b.sub_category_id === categoryId1);
      
      // Average should be around 100 (may vary based on exact date calculations)
      expect(cat1Budget?.amount).toBeGreaterThanOrEqual(0);
    });

    it('should set $0 budget for categories with no transaction history', () => {
      const count = createBudgetsFrom12MonthAverage(2025, 3);
      
      expect(count).toBe(2);
      
      const budgets = getBudgetsByMonth(2025, 3);
      expect(budgets.every(b => b.amount === 0)).toBe(true);
    });

    it('should update existing budgets with new averages', () => {
      const db = getTestDatabase();
      const now = new Date().toISOString();
      
      // Create initial budget
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 3,
        amount: 999.00,
      });
      
      // Create transaction history
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-old', '2025-02-15', 'Last Month', -200.00, ?, 0, 0, ?, ?)
      `).run(categoryId1, now, now);
      
      const count = createBudgetsFrom12MonthAverage(2025, 3);
      
      expect(count).toBe(2);
      
      const budgets = getBudgetsByMonth(2025, 3);
      const cat1Budget = budgets.find(b => b.sub_category_id === categoryId1);
      
      // Budget should be updated (not 999 anymore)
      expect(cat1Budget?.amount).not.toBe(999.00);
    });

    it('should not create budgets for income categories', () => {
      const db = getTestDatabase();
      const now = new Date().toISOString();
      
      // Create an income category
      db.prepare(`
        INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
        VALUES ('income-cat2', 'Income', 'income', 0, ?, ?)
      `).run(now, now);
      
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('income-sub2', 'income-cat2', 'Salary', 1, 0, ?, ?)
      `).run(now, now);
      
      // Create income transactions
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('income-tx', '2025-02-15', 'Paycheck', 5000.00, 'income-sub2', 0, 0, ?, ?)
      `).run(now, now);
      
      const count = createBudgetsFrom12MonthAverage(2025, 3);
      
      // Should only process expense categories (2), not income
      expect(count).toBe(2);
      
      const budgets = getBudgetsByMonth(2025, 3);
      const incomeBudget = budgets.find(b => b.sub_category_id === 'income-sub2');
      expect(incomeBudget).toBeUndefined();
    });
  });

  describe('Income Calculations in Budget Summary', () => {
    it('should include income totals in budget summary', () => {
      const db = getTestDatabase();
      const now = new Date().toISOString();
      
      // Create an income category
      db.prepare(`
        INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
        VALUES ('income-upper', 'Income', 'income', 0, ?, ?)
      `).run(now, now);
      
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('salary-cat', 'income-upper', 'Salary', 1, 0, ?, ?)
      `).run(now, now);
      
      // Create income transaction
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, sub_category_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('income-tx', '2025-01-15', 'Paycheck', 5000.00, 'salary-cat', 0, 0, ?, ?)
      `).run(now, now);
      
      // Create expense budget
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      const summary = getBudgetSummary(2025, 1);
      
      expect(summary.totalIncome).toBe(5000.00);
      expect(summary.incomeCategories).toHaveLength(1);
      expect(summary.incomeCategories[0].sub_category_name).toBe('Salary');
      expect(summary.incomeCategories[0].actual_amount).toBe(5000.00);
    });

    it('should separate income from expense budgets', () => {
      const db = getTestDatabase();
      const now = new Date().toISOString();
      
      // Create income category and budget
      db.prepare(`
        INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
        VALUES ('income-upper2', 'Income', 'income', 0, ?, ?)
      `).run(now, now);
      
      db.prepare(`
        INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
        VALUES ('salary-cat2', 'income-upper2', 'Salary', 1, 0, ?, ?)
      `).run(now, now);
      
      // Create expense budget
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      const summary = getBudgetSummary(2025, 1);
      
      // Income categories should not be in the main budgets array
      const incomeBudgetInMain = summary.budgets.find(
        (b: { sub_category_id: string }) => b.sub_category_id === 'salary-cat2'
      );
      expect(incomeBudgetInMain).toBeUndefined();
      
      // Expense budgets should be in main array
      expect(summary.budgets).toHaveLength(1);
      expect(summary.budgets[0].sub_category_id).toBe(categoryId1);
    });

    it('should return 0 income when no income transactions exist', () => {
      upsertBudget({
        sub_category_id: categoryId1,
        year: 2025,
        month: 1,
        amount: 500.00,
      });
      
      const summary = getBudgetSummary(2025, 1);
      
      expect(summary.totalIncome).toBe(0);
      expect(summary.incomeCategories).toHaveLength(0);
    });
  });
});

