// Budget database operations
import { getDatabase } from './index';
import { generateId } from '../uuid';
import type { Budget, BudgetWithCategory } from '@/types/database';

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
  
  // Check if budget exists
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
  
  const id = generateId();
  
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
 */
export function getBudgetSummary(year: number, month: number): {
  budgets: Array<BudgetWithCategory & { actual_amount: number }>;
  totalBudgeted: number;
  totalSpent: number;
} {
  const db = getDatabase();
  
  // Get start and end dates for the month
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Last day of month
  
  const query = `
    SELECT 
      b.*,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type,
      COALESCE(ABS(SUM(
        CASE WHEN t.date >= ? AND t.date <= ? AND t.is_deleted = 0 
        THEN t.amount ELSE 0 END
      )), 0) as actual_amount
    FROM budget b
    JOIN sub_category sc ON b.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    LEFT JOIN "transaction" t ON t.sub_category_id = b.sub_category_id
    WHERE b.year = ? AND b.month = ?
    GROUP BY b.id
    ORDER BY uc.sort_order ASC, sc.sort_order ASC
  `;
  
  const budgets = db.prepare(query).all(startDate, endDate, year, month) as Array<BudgetWithCategory & { actual_amount: number }>;
  
  const totalBudgeted = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.actual_amount, 0);
  
  return {
    budgets,
    totalBudgeted,
    totalSpent,
  };
}

/**
 * Get historical average spending for a category
 */
export function getCategoryAverage(subCategoryId: string, months: number = 3): number {
  const db = getDatabase();
  
  // Get date range for the past N months
  const now = new Date();
  const startDate = new Date(now.getFullYear(), now.getMonth() - months, 1);
  const endDate = new Date(now.getFullYear(), now.getMonth(), 0);
  
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
      GROUP BY strftime('%Y-%m', date)
    )
  `).get(
    subCategoryId, 
    startDate.toISOString().split('T')[0],
    endDate.toISOString().split('T')[0]
  ) as { average: number | null };
  
  return result.average || 0;
}

