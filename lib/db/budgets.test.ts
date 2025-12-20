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
    } catch (e) {
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
});

