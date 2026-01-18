/**
 * Tauri Handler: Budgets
 *
 * Handles budget-related operations in Tauri mode.
 * Mirrors the functionality of /api/budgets/* routes.
 */

import * as db from '../tauri-db';

interface Budget {
  id: string;
  sub_category_id: string;
  year: number;
  month: number;
  amount: number;
  created_at: string;
  updated_at: string;
}

interface BudgetWithCategory extends Budget {
  sub_category_name: string;
  upper_category_name: string;
  upper_category_type: string;
}

interface HandlerContext {
  method: string;
  body?: unknown;
  params: Record<string, string>;
  path: string;
}

/**
 * Main budgets handler - /api/budgets
 */
export async function handleBudgets(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;

  switch (method) {
    case 'GET':
      return getBudgets(params);
    case 'POST': {
      const data = body as {
        action?: string;
        sub_category_id?: string;
        year?: number;
        month?: number;
        amount?: number;
        fromYear?: number;
        fromMonth?: number;
        toYear?: number;
        toMonth?: number;
      };

      // Handle copy operation
      if (data.action === 'copy') {
        if (!data.fromYear || !data.fromMonth || !data.toYear || !data.toMonth) {
          throw new Error('Missing required fields for copy operation');
        }
        const count = await copyBudgetsToMonth(data.fromYear, data.fromMonth, data.toYear, data.toMonth);
        return { success: true, copiedCount: count, message: `Copied ${count} budgets` };
      }

      // Handle initialize operation
      if (data.action === 'initialize') {
        if (!data.year || !data.month) {
          throw new Error('Missing required fields for initialize operation');
        }
        const count = await initializeMonthlyBudgets(data.year, data.month);
        return { success: true, initializedCount: count, message: `Initialized ${count} budgets to $0` };
      }

      // Handle useAverage operation
      if (data.action === 'useAverage') {
        if (!data.year || !data.month) {
          throw new Error('Missing required fields for useAverage operation');
        }
        const count = await createBudgetsFrom12MonthAverage(data.year, data.month);
        return { success: true, updatedCount: count, message: `Updated ${count} budgets with 12-month averages` };
      }

      // Normal create/update
      if (!data.sub_category_id || data.year === undefined || data.month === undefined || data.amount === undefined) {
        throw new Error('sub_category_id, year, month, and amount are required');
      }
      const budget = await createOrUpdateBudget({
        sub_category_id: data.sub_category_id,
        year: data.year,
        month: data.month,
        amount: data.amount,
      });
      return { budget };
    }
    case 'PUT':
      return createOrUpdateBudget(body as { sub_category_id: string; year: number; month: number; amount: number });
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Budget templates handler - /api/budgets/templates
 */
export async function handleBudgetTemplates(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;

  switch (method) {
    case 'GET':
      return getBudgetTemplates();
    case 'POST': {
      const data = body as { action?: string; templateId?: string; name?: string; year?: number; month?: number };
      if (data.action === 'apply' && data.templateId) {
        if (data.year === undefined || data.month === undefined) {
          throw new Error('year and month are required when applying a template');
        }
        return applyBudgetTemplate(data.templateId, data.year, data.month);
      }
      if (!data.name || data.year === undefined || data.month === undefined) {
        throw new Error('name, year, and month are required to create a template');
      }
      return createBudgetTemplate(data.name, data.year, data.month);
    }
    case 'DELETE':
      return deleteBudgetTemplate(params.id);
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Get budgets with optional summary data.
 */
async function getBudgets(params: Record<string, string>): Promise<unknown> {
  const now = new Date();
  const year = parseInt(params.year || now.getFullYear().toString());
  const month = parseInt(params.month || (now.getMonth() + 1).toString());
  const withSummary = params.summary === 'true';
  const forEntry = params.forEntry === 'true';
  const categoryId = params.categoryId;
  const averageMonths = params.averageMonths ? parseInt(params.averageMonths) : null;

  // Get category average if requested
  if (categoryId && averageMonths) {
    const average = await getCategoryAverage(categoryId, averageMonths);
    return { average };
  }

  // Get carry-over if requested
  if (categoryId && params.carryOver === 'true') {
    const carryOver = await getBudgetCarryOver(categoryId, year, month);
    return { carryOver };
  }

  // Get categories for budget entry interface
  if (forEntry) {
    const categories = await getCategoriesForBudgetEntry(year, month);
    return { categories, year, month };
  }

  if (withSummary) {
    const summary = await getBudgetSummary(year, month) as Record<string, unknown>;
    return { ...summary, year, month };
  }

  const budgets = await getBudgetsByMonth(year, month);
  return { budgets, year, month };
}

/**
 * Get budgets for a specific month.
 */
async function getBudgetsByMonth(year: number, month: number): Promise<BudgetWithCategory[]> {
  return db.query<BudgetWithCategory>(`
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
  `, [year, month]);
}

/**
 * Get budget summary with actual spending.
 */
async function getBudgetSummary(year: number, month: number): Promise<unknown> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const budgets = await db.query<BudgetWithCategory & { actual_amount: number }>(`
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
  `, [startDate, endDate, year, month]);

  // Calculate total income
  const incomeResult = await db.queryOne<{ total_income: number }>(`
    SELECT COALESCE(SUM(t.amount), 0) as total_income
    FROM "transaction" t
    JOIN sub_category sc ON t.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE uc.type = 'income'
      AND t.date >= ? AND t.date <= ?
      AND t.is_deleted = 0
      AND t.is_split = 0
  `, [startDate, endDate]);

  // Get income categories
  const incomeCategories = await db.query<{
    sub_category_id: string;
    sub_category_name: string;
    upper_category_name: string;
    upper_category_type: string;
    actual_amount: number;
  }>(`
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
  `, [startDate, endDate]);

  const totalBudgeted = budgets.reduce((sum, b) => sum + b.amount, 0);
  const totalSpent = budgets.reduce((sum, b) => sum + b.actual_amount, 0);

  return {
    budgets,
    totalBudgeted,
    totalSpent,
    totalIncome: incomeResult?.total_income || 0,
    incomeCategories,
  };
}

/**
 * Get category average spending over N months.
 * Uses SUM/months (not AVG) to include months with zero spending in the calculation.
 */
async function getCategoryAverage(categoryId: string, months: number): Promise<number> {
  // Start from N months before current month, end at last day of previous month
  const referenceDate = new Date();
  const startDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - months, 1);
  const endDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0); // Last day of previous month

  // Use SUM/months instead of AVG to get true average over the full period
  // (AVG only divides by months with data, not the total period)
  const result = await db.queryOne<{ total: number | null }>(`
    SELECT SUM(monthly_total) as total
    FROM (
      SELECT ABS(SUM(t.amount)) as monthly_total
      FROM "transaction" t
      WHERE t.sub_category_id = ?
        AND t.date >= ?
        AND t.date <= ?
        AND t.is_deleted = 0
        AND t.is_split = 0
      GROUP BY strftime('%Y-%m', t.date)
    )
  `, [categoryId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

  return (result?.total || 0) / months;
}

/**
 * Get budget carry-over (remaining budget from previous month).
 */
async function getBudgetCarryOver(categoryId: string, year: number, month: number): Promise<number> {
  // Get previous month
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear = year - 1;
  }

  const startDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(prevYear, prevMonth, 0).getDate();
  const endDate = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Get previous month's budget
  const budget = await db.queryOne<{ amount: number }>(
    'SELECT amount FROM budget WHERE sub_category_id = ? AND year = ? AND month = ?',
    [categoryId, prevYear, prevMonth]
  );

  if (!budget) return 0;

  // Get previous month's spending
  const spending = await db.queryOne<{ total: number }>(`
    SELECT COALESCE(ABS(SUM(amount)), 0) as total
    FROM "transaction"
    WHERE sub_category_id = ?
      AND date >= ? AND date <= ?
      AND is_deleted = 0
      AND is_split = 0
  `, [categoryId, startDate, endDate]);

  // Carry-over is budget minus spending (positive means under budget)
  return budget.amount - (spending?.total || 0);
}

/**
 * Get categories with budget info for entry interface.
 */
async function getCategoriesForBudgetEntry(year: number, month: number): Promise<unknown[]> {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // Get all categories (including income and transfer) with their transaction totals
  const subCategories = await db.query<{
    sub_category_id: string;
    sub_category_name: string;
    upper_category_name: string;
    upper_category_type: string;
    actual_amount: number;
  }>(`
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
  `, [startDate, endDate]);

  // Add budget info and averages for each category
  const results = [];
  for (const cat of subCategories) {
    // Get current budget for this category and month
    const budgetResult = await db.queryOne<{ amount: number }>(
      'SELECT amount FROM budget WHERE sub_category_id = ? AND year = ? AND month = ?',
      [cat.sub_category_id, year, month]
    );
    const average3mo = await getCategoryAverage(cat.sub_category_id, 3);
    const average6mo = await getCategoryAverage(cat.sub_category_id, 6);
    const carryOver = await getBudgetCarryOver(cat.sub_category_id, year, month);

    results.push({
      ...cat,
      current_budget: budgetResult?.amount ?? null,
      average_3mo: average3mo,
      average_6mo: average6mo,
      carry_over: carryOver,
    });
  }

  return results;
}

/**
 * Create or update a budget.
 */
async function createOrUpdateBudget(data: {
  sub_category_id: string;
  year: number;
  month: number;
  amount: number;
}): Promise<Budget> {
  const now = new Date().toISOString();

  // Verify sub_category exists
  const category = await db.queryOne<{ id: string }>(
    'SELECT id FROM sub_category WHERE id = ? AND is_deleted = 0',
    [data.sub_category_id]
  );

  if (!category) {
    throw new Error(`Sub-category with ID ${data.sub_category_id} does not exist or has been deleted`);
  }

  // Check if budget exists
  const existing = await db.queryOne<Budget>(
    'SELECT * FROM budget WHERE sub_category_id = ? AND year = ? AND month = ?',
    [data.sub_category_id, data.year, data.month]
  );

  if (existing) {
    await db.execute(
      'UPDATE budget SET amount = ?, updated_at = ? WHERE id = ?',
      [data.amount, now, existing.id]
    );
    return { ...existing, amount: data.amount, updated_at: now };
  }

  const id = crypto.randomUUID();
  await db.execute(
    'INSERT INTO budget (id, sub_category_id, year, month, amount, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, data.sub_category_id, data.year, data.month, data.amount, now, now]
  );

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
 * Get all budget templates.
 */
async function getBudgetTemplates(): Promise<{ templates: unknown[] }> {
  await ensureTemplateTable();
  const templates = await db.query('SELECT * FROM budget_template ORDER BY updated_at DESC');
  return { templates };
}

/**
 * Create a budget template from current month's budgets.
 */
async function createBudgetTemplate(name: string, year: number, month: number): Promise<{ template: unknown }> {
  await ensureTemplateTable();
  const budgets = await getBudgetsByMonth(year, month);

  const templateData: Record<string, number> = {};
  for (const budget of budgets) {
    templateData[budget.sub_category_id] = budget.amount;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.execute(
    'INSERT INTO budget_template (id, name, template_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, name, JSON.stringify(templateData), now, now]
  );

  return { template: { id, name, template_data: JSON.stringify(templateData), created_at: now, updated_at: now } };
}

/**
 * Apply a budget template to a specific month.
 */
async function applyBudgetTemplate(templateId: string, year: number, month: number): Promise<{ success: boolean; appliedCount: number; message: string }> {
  await ensureTemplateTable();

  const template = await db.queryOne<{ template_data: string }>(
    'SELECT template_data FROM budget_template WHERE id = ?',
    [templateId]
  );

  if (!template) {
    throw new Error('Template not found');
  }

  const templateData = JSON.parse(template.template_data) as Record<string, number>;
  let appliedCount = 0;

  for (const [subCategoryId, amount] of Object.entries(templateData)) {
    // Check if category still exists
    const categoryCheck = await db.queryOne<{ id: string }>(
      'SELECT id FROM sub_category WHERE id = ? AND is_deleted = 0',
      [subCategoryId]
    );
    if (!categoryCheck) continue;

    await createOrUpdateBudget({ sub_category_id: subCategoryId, year, month, amount });
    appliedCount++;
  }

  return { success: true, appliedCount, message: `Applied template to ${appliedCount} categories` };
}

/**
 * Delete a budget template.
 */
async function deleteBudgetTemplate(id: string): Promise<{ success: boolean }> {
  await ensureTemplateTable();
  await db.execute('DELETE FROM budget_template WHERE id = ?', [id]);
  return { success: true };
}

/**
 * Ensure budget_template table exists.
 */
async function ensureTemplateTable(): Promise<void> {
  const tables = await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='budget_template'"
  );

  if (tables.length === 0) {
    await db.execute(`
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
 * Copy budgets from one month to another.
 * Skips budgets for deleted sub-categories.
 */
async function copyBudgetsToMonth(
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number
): Promise<number> {
  const sourceBudgets = await getBudgetsByMonth(fromYear, fromMonth);
  let copiedCount = 0;

  for (const budget of sourceBudgets) {
    try {
      await createOrUpdateBudget({
        sub_category_id: budget.sub_category_id,
        year: toYear,
        month: toMonth,
        amount: budget.amount,
      });
      copiedCount++;
    } catch {
      // Skip budgets for deleted categories
      console.warn(`Skipping budget for deleted category ${budget.sub_category_id}`);
    }
  }

  return copiedCount;
}

/**
 * Initialize monthly budgets with $0 for categories that don't have budgets.
 */
async function initializeMonthlyBudgets(year: number, month: number): Promise<number> {
  // Get all expense/savings/bills categories that don't have a budget for this month
  const categoriesWithoutBudget = await db.query<{ id: string }>(`
    SELECT sc.id
    FROM sub_category sc
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    LEFT JOIN budget b ON b.sub_category_id = sc.id AND b.year = ? AND b.month = ?
    WHERE sc.is_deleted = 0
      AND uc.type NOT IN ('income', 'transfer')
      AND b.id IS NULL
  `, [year, month]);

  let initializedCount = 0;

  for (const category of categoriesWithoutBudget) {
    await createOrUpdateBudget({
      sub_category_id: category.id,
      year,
      month,
      amount: 0,
    });
    initializedCount++;
  }

  return initializedCount;
}

/**
 * Create budgets based on 12-month average spending.
 */
async function createBudgetsFrom12MonthAverage(year: number, month: number): Promise<number> {
  const endDate = new Date(year, month - 1, 1);
  const startDate = new Date(year, month - 13, 1);

  // Get average spending per category over the last 12 months
  // Use SUM / 12.0 instead of AVG to properly average over 12 months
  // (AVG only divides by months with data, not the full 12 months)
  const averages = await db.query<{ sub_category_id: string; average: number }>(`
    SELECT
      sub.sub_category_id,
      SUM(sub.monthly_total) / 12.0 as average
    FROM (
      SELECT
        t.sub_category_id,
        ABS(SUM(t.amount)) as monthly_total
      FROM "transaction" t
      JOIN sub_category sc ON t.sub_category_id = sc.id
      JOIN upper_category uc ON sc.upper_category_id = uc.id
      WHERE t.date >= ? AND t.date < ?
        AND t.is_deleted = 0
        AND t.is_split = 0
        AND sc.is_deleted = 0
        AND uc.type NOT IN ('income', 'transfer')
        AND t.sub_category_id IS NOT NULL
      GROUP BY t.sub_category_id, strftime('%Y-%m', t.date)
    ) sub
    GROUP BY sub.sub_category_id
  `, [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]);

  let updatedCount = 0;

  for (const avg of averages) {
    if (avg.average > 0) {
      try {
        await createOrUpdateBudget({
          sub_category_id: avg.sub_category_id,
          year,
          month,
          amount: Math.round(avg.average * 100) / 100,
        });
        updatedCount++;
      } catch {
        // Skip budgets for deleted categories
        console.warn(`Skipping budget for deleted category ${avg.sub_category_id}`);
      }
    }
  }

  return updatedCount;
}
