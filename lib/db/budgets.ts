// Budget database operations
import { getDatabase } from './index';
import { generateId } from '../uuid';
import type { Budget, BudgetWithCategory, BudgetTemplate } from '@/types/database';

/**
 * Get budgets for a specific month
 */
export function getBudgetsByMonth(year: number, month: number): BudgetWithCategory[] {
  const db = getDatabase();
  
  return db.prepare(`
    SELECT 
      b.*,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM budget b
    JOIN sub_category sc ON b.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE b.year = ? AND b.month = ?
    ORDER BY uc.sort_order ASC, sc.sort_order ASC
  `).all(year, month) as BudgetWithCategory[];
}

/**
 * Get budget by ID
 */
export function getBudgetById(id: string): BudgetWithCategory | null {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT 
      b.*,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM budget b
    JOIN sub_category sc ON b.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE b.id = ?
  `).get(id) as BudgetWithCategory | undefined;
  return result || null;
}

/**
 * Get budget for a specific category and month
 */
export function getBudgetByCategoryAndMonth(
  subCategoryId: string,
  year: number,
  month: number
): Budget | null {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT * FROM budget 
    WHERE sub_category_id = ? AND year = ? AND month = ?
  `).get(subCategoryId, year, month) as Budget | undefined;
  return result || null;
}

/**
 * Create or update a budget
 */
export function upsertBudget(data: {
  sub_category_id: string;
  year: number;
  month: number;
  amount: number;
}): Budget {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  // Verify the sub_category exists and is not deleted
  const categoryCheck = db.prepare(`
    SELECT id FROM sub_category 
    WHERE id = ? AND is_deleted = 0
  `).get(data.sub_category_id);
  
  if (!categoryCheck) {
    throw new Error(`Sub-category with ID ${data.sub_category_id} does not exist or has been deleted`);
  }
  
  // Check if budget exists
  const existing = getBudgetByCategoryAndMonth(data.sub_category_id, data.year, data.month);
  
  if (existing) {
    try {
      db.prepare(`
        UPDATE budget SET amount = ?, updated_at = ? WHERE id = ?
      `).run(data.amount, now, existing.id);
      
      return {
        ...existing,
        amount: data.amount,
        updated_at: now,
      };
    } catch (error) {
      throw new Error(`Failed to update budget: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  const id = generateId();
  
  try {
    db.prepare(`
      INSERT INTO budget (id, sub_category_id, year, month, amount, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.sub_category_id, data.year, data.month, data.amount, now, now);
    
    return {
      id,
      sub_category_id: data.sub_category_id,
      year: data.year,
      month: data.month,
      amount: data.amount,
      created_at: now,
      updated_at: now,
    };
  } catch (error) {
    // Check for unique constraint violation
    if (error instanceof Error && error.message.includes('UNIQUE constraint')) {
      // Budget was created between check and insert, try update instead
      const existing = getBudgetByCategoryAndMonth(data.sub_category_id, data.year, data.month);
      if (existing) {
        db.prepare(`
          UPDATE budget SET amount = ?, updated_at = ? WHERE id = ?
        `).run(data.amount, now, existing.id);
        return {
          ...existing,
          amount: data.amount,
          updated_at: now,
        };
      }
    }
    throw new Error(`Failed to create budget: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete a budget
 */
export function deleteBudget(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM budget WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Initialize $0 budgets for all non-income categories that don't have a budget for the given month
 * This ensures any spending shows as "over budget" rather than being in an uninitialized state
 */
export function initializeMonthlyBudgets(year: number, month: number): number {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  // Get all non-income, non-transfer sub-categories that don't have a budget for this month
  const categoriesWithoutBudget = db.prepare(`
    SELECT sc.id as sub_category_id
    FROM sub_category sc
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE sc.is_deleted = 0
      AND uc.type NOT IN ('income', 'transfer')
      AND sc.id NOT IN (
        SELECT sub_category_id FROM budget WHERE year = ? AND month = ?
      )
  `).all(year, month) as Array<{ sub_category_id: string }>;
  
  if (categoriesWithoutBudget.length === 0) {
    return 0;
  }
  
  const insert = db.prepare(`
    INSERT INTO budget (id, sub_category_id, year, month, amount, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `);
  
  let count = 0;
  
  const initAll = db.transaction(() => {
    for (const cat of categoriesWithoutBudget) {
      const id = generateId();
      insert.run(id, cat.sub_category_id, year, month, now, now);
      count++;
    }
  });
  
  initAll();
  
  return count;
}

/**
 * Create or update budgets for all non-income categories based on 12-month spending averages
 * This helps users quickly set up realistic budgets based on historical spending patterns
 */
export function createBudgetsFrom12MonthAverage(year: number, month: number): number {
  const db = getDatabase();
  
  // Get all non-income, non-transfer sub-categories
  const categories = db.prepare(`
    SELECT sc.id as sub_category_id
    FROM sub_category sc
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE sc.is_deleted = 0
      AND uc.type NOT IN ('income', 'transfer')
  `).all() as Array<{ sub_category_id: string }>;
  
  if (categories.length === 0) {
    return 0;
  }
  
  let count = 0;
  
  for (const cat of categories) {
    // Get 12-month average for this category, using the 12 months BEFORE the target month
    const average = getCategoryAverage(cat.sub_category_id, 12, year, month);
    
    // Round to 2 decimal places
    const roundedAverage = Math.round(average * 100) / 100;
    
    // Use upsertBudget for DRY - it handles both create and update
    upsertBudget({
      sub_category_id: cat.sub_category_id,
      year,
      month,
      amount: roundedAverage,
    });
    
    count++;
  }
  
  return count;
}

/**
 * Copy budgets from one month to another
 */
export function copyBudgetsToMonth(
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number
): number {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  // Get existing budgets for source month
  const sourceBudgets = getBudgetsByMonth(fromYear, fromMonth);
  
  if (sourceBudgets.length === 0) {
    return 0;
  }
  
  const insert = db.prepare(`
    INSERT OR REPLACE INTO budget (id, sub_category_id, year, month, amount, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  let copiedCount = 0;
  
  const copyAll = db.transaction((budgets: BudgetWithCategory[]) => {
    for (const budget of budgets) {
      const existingTarget = getBudgetByCategoryAndMonth(budget.sub_category_id, toYear, toMonth);
      const id = existingTarget?.id || generateId();
      insert.run(id, budget.sub_category_id, toYear, toMonth, budget.amount, now, now);
      copiedCount++;
    }
  });
  
  copyAll(sourceBudgets);
  
  return copiedCount;
}

/**
 * Get budget summary with actual spending for a month
 * Includes total income from income categories and excludes income from budget calculations
 */
export function getBudgetSummary(year: number, month: number): {
  budgets: Array<BudgetWithCategory & { actual_amount: number }>;
  totalBudgeted: number;
  totalSpent: number;
  totalIncome: number;
  incomeCategories: Array<{
    sub_category_id: string;
    sub_category_name: string;
    upper_category_name: string;
    upper_category_type: string;
    actual_amount: number;
  }>;
} {
  const db = getDatabase();
  
  // Get start and end dates for the month (avoiding timezone issues with explicit formatting)
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  
  // Note: We exclude split parent transactions (is_split = 1) from totals
  // because their amounts are represented by their child transactions instead.
  // This prevents double-counting when a transaction is split.
  // Also exclude income and transfer categories from budgets (they don't need budgeting)
  // Transfer transactions are like splits - visible but excluded from calculations
  const query = `
    SELECT
      b.*,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type,
      COALESCE(ABS(SUM(
        CASE WHEN t.date >= ? AND t.date <= ? AND t.is_deleted = 0 AND t.is_split = 0
        THEN t.amount ELSE 0 END
      )), 0) as actual_amount
    FROM budget b
    JOIN sub_category sc ON b.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    LEFT JOIN "transaction" t ON t.sub_category_id = b.sub_category_id
    WHERE b.year = ? AND b.month = ?
      AND uc.type NOT IN ('income', 'transfer')
    GROUP BY b.id
    ORDER BY uc.sort_order ASC, sc.sort_order ASC
  `;
  
  const budgets = db.prepare(query).all(startDate, endDate, year, month) as Array<BudgetWithCategory & { actual_amount: number }>;
  
  // Calculate total income from all transactions in income categories
  const incomeQuery = `
    SELECT 
      COALESCE(SUM(t.amount), 0) as total_income
    FROM "transaction" t
    JOIN sub_category sc ON t.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE uc.type = 'income'
      AND t.date >= ? AND t.date <= ?
      AND t.is_deleted = 0
      AND t.is_split = 0
  `;
  
  const incomeResult = db.prepare(incomeQuery).get(startDate, endDate) as { total_income: number };
  const totalIncome = incomeResult.total_income || 0;
  
  // Get income categories with their transaction totals for display
  const incomeCategoriesQuery = `
    SELECT 
      sc.id as sub_category_id,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type,
      COALESCE(SUM(
        CASE WHEN t.date >= ? AND t.date <= ? AND t.is_deleted = 0 AND t.is_split = 0
        THEN t.amount ELSE 0 END
      ), 0) as actual_amount
    FROM sub_category sc
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    LEFT JOIN "transaction" t ON t.sub_category_id = sc.id
    WHERE uc.type = 'income'
      AND sc.is_deleted = 0
    GROUP BY sc.id
    ORDER BY uc.sort_order ASC, sc.sort_order ASC
  `;
  
  const incomeCategories = db.prepare(incomeCategoriesQuery).all(startDate, endDate) as Array<{
    sub_category_id: string;
    sub_category_name: string;
    upper_category_name: string;
    upper_category_type: string;
    actual_amount: number;
  }>;
  
  const totalBudgeted = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.actual_amount, 0);
  
  return {
    budgets,
    totalBudgeted,
    totalSpent,
    totalIncome,
    incomeCategories,
  };
}

/**
 * Get historical average spending for a category
 * If beforeYear and beforeMonth are provided, calculates average for N months before that month
 * Otherwise, uses the current date as the reference point
 */
export function getCategoryAverage(
  subCategoryId: string, 
  months: number = 3,
  beforeYear?: number,
  beforeMonth?: number
): number {
  const db = getDatabase();
  
  // Get date range for the past N months
  // If beforeYear/beforeMonth provided, use that as reference; otherwise use current date
  let referenceDate: Date;
  if (beforeYear !== undefined && beforeMonth !== undefined) {
    // Use the month BEFORE the target month as the end point
    referenceDate = new Date(beforeYear, beforeMonth - 1, 1); // JS months are 0-indexed
  } else {
    referenceDate = new Date();
  }
  
  // Start from N months before reference, end at the last day of the month before reference
  const startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - months, 1);
  const endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0); // Last day of previous month
  
  // Exclude split parent transactions from averages (they are represented by children)
  const result = db.prepare(`
    SELECT AVG(monthly_total) as average FROM (
      SELECT 
        strftime('%Y-%m', date) as month,
        ABS(SUM(amount)) as monthly_total
      FROM "transaction"
      WHERE sub_category_id = ? 
        AND date >= ? 
        AND date <= ?
        AND is_deleted = 0
        AND is_split = 0
      GROUP BY strftime('%Y-%m', date)
    )
  `).get(
    subCategoryId, 
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  ) as { average: number | null };
  
  return result.average || 0;
}

/**
 * Get budget carry-over amount (unused budget from previous month)
 */
export function getBudgetCarryOver(subCategoryId: string, year: number, month: number): number {
  // Get previous month
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  
  // Get budget and actual for previous month
  const prevBudget = getBudgetByCategoryAndMonth(subCategoryId, prevYear, prevMonth);
  if (!prevBudget) {
    return 0;
  }
  
  // Get actual spending for previous month
  const startDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(prevYear, prevMonth, 0).getDate();
  const endDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COALESCE(ABS(SUM(amount)), 0) as actual
    FROM "transaction"
    WHERE sub_category_id = ?
      AND date >= ?
      AND date <= ?
      AND is_deleted = 0
      AND is_split = 0
  `).get(subCategoryId, startDate, endDate) as { actual: number };
  
  const unused = prevBudget.amount - result.actual;
  return Math.max(0, unused); // Only carry over positive amounts
}

/**
 * Get all sub-categories with their current budget status for a month
 * This is useful for budget entry interfaces
 * Includes actual transaction amounts for the month
 */
export function getCategoriesForBudgetEntry(year: number, month: number): Array<{
  sub_category_id: string;
  sub_category_name: string;
  upper_category_name: string;
  upper_category_type: string;
  current_budget: number | null;
  average_3mo: number;
  average_6mo: number;
  carry_over: number;
  actual_amount: number;
}> {
  const db = getDatabase();
  
  // Get date range for the month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  
  // Get all categories with their transaction totals for the month
  const subCategories = db.prepare(`
    SELECT 
      sc.id as sub_category_id,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type,
      COALESCE(SUM(
        CASE WHEN t.date >= ? AND t.date <= ? AND t.is_deleted = 0 AND t.is_split = 0
        THEN t.amount ELSE 0 END
      ), 0) as actual_amount
    FROM sub_category sc
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    LEFT JOIN "transaction" t ON t.sub_category_id = sc.id
    WHERE sc.is_deleted = 0
    GROUP BY sc.id
    ORDER BY uc.sort_order ASC, sc.sort_order ASC
  `).all(startDate, endDate) as Array<{
    sub_category_id: string;
    sub_category_name: string;
    upper_category_name: string;
    upper_category_type: string;
    actual_amount: number;
  }>;
  
  return subCategories.map(cat => {
    const currentBudget = getBudgetByCategoryAndMonth(cat.sub_category_id, year, month);
    const average3mo = getCategoryAverage(cat.sub_category_id, 3);
    const average6mo = getCategoryAverage(cat.sub_category_id, 6);
    const carryOver = getBudgetCarryOver(cat.sub_category_id, year, month);
    
    return {
      ...cat,
      current_budget: currentBudget?.amount || null,
      average_3mo: average3mo,
      average_6mo: average6mo,
      carry_over: carryOver,
    };
  });
}

/**
 * Budget Template functions
 */

/**
 * Ensure budget_template table exists (for migration support)
 */
function ensureTemplateTable(): void {
  const db = getDatabase();
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='budget_template'"
  ).get();
  
  if (!tableExists) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS budget_template (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        template_data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }
}

/**
 * Create a budget template from current month's budgets
 */
export function createBudgetTemplate(name: string, year: number, month: number): BudgetTemplate {
  ensureTemplateTable();
  const db = getDatabase();
  const budgets = getBudgetsByMonth(year, month);
  
  // Create template data as JSON
  const templateData: Record<string, number> = {};
  for (const budget of budgets) {
    templateData[budget.sub_category_id] = budget.amount;
  }
  
  const id = generateId();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO budget_template (id, name, template_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, JSON.stringify(templateData), now, now);
  
  return {
    id,
    name,
    template_data: JSON.stringify(templateData),
    created_at: now,
    updated_at: now,
  };
}

/**
 * Get all budget templates
 */
export function getBudgetTemplates(): BudgetTemplate[] {
  ensureTemplateTable();
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM budget_template
    ORDER BY updated_at DESC
  `).all() as BudgetTemplate[];
}

/**
 * Get a budget template by ID
 */
export function getBudgetTemplateById(id: string): BudgetTemplate | null {
  ensureTemplateTable();
  const db = getDatabase();
  const result = db.prepare('SELECT * FROM budget_template WHERE id = ?').get(id) as BudgetTemplate | undefined;
  return result || null;
}

/**
 * Delete a budget template
 */
export function deleteBudgetTemplate(id: string): boolean {
  ensureTemplateTable();
  const db = getDatabase();
  const result = db.prepare('DELETE FROM budget_template WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Apply a budget template to a specific month
 */
export function applyBudgetTemplate(templateId: string, year: number, month: number): number {
  ensureTemplateTable();
  const template = getBudgetTemplateById(templateId);
  if (!template) {
    throw new Error('Template not found');
  }
  
  const templateData = JSON.parse(template.template_data) as Record<string, number>;
  const now = new Date().toISOString();
  const db = getDatabase();
  
  let appliedCount = 0;
  
  const applyTemplate = db.transaction(() => {
    for (const [subCategoryId, amount] of Object.entries(templateData)) {
      // Check if category still exists
      const categoryCheck = db.prepare('SELECT id FROM sub_category WHERE id = ? AND is_deleted = 0').get(subCategoryId);
      if (!categoryCheck) {
        continue; // Skip deleted categories
      }
      
      const existing = getBudgetByCategoryAndMonth(subCategoryId, year, month);
      const id = existing?.id || generateId();
      
      db.prepare(`
        INSERT OR REPLACE INTO budget (id, sub_category_id, year, month, amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, subCategoryId, year, month, amount, now, now);
      
      appliedCount++;
    }
  });
  
  applyTemplate();
  
  return appliedCount;
}

