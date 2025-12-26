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
    case 'POST':
      return createOrUpdateBudget(body as { sub_category_id: string; year: number; month: number; amount: number });
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
        return applyBudgetTemplate(data.templateId, data.year!, data.month!);
      }
      return createBudgetTemplate(data.name!, data.year!, data.month!);
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
  const year = parseInt(params.year || new Date().getFullYear().toString());
  const month = parseInt(params.month || (new Date().getMonth() + 1).toString());
  const includeSummary = params.includeSummary === 'true';

  if (includeSummary) {
    return getBudgetSummary(year, month);
  }

  return getBudgetsByMonth(year, month);
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
async function getBudgetTemplates(): Promise<unknown[]> {
  await ensureTemplateTable();
  return db.query('SELECT * FROM budget_template ORDER BY updated_at DESC');
}

/**
 * Create a budget template from current month's budgets.
 */
async function createBudgetTemplate(name: string, year: number, month: number): Promise<unknown> {
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

  return { id, name, template_data: JSON.stringify(templateData), created_at: now, updated_at: now };
}

/**
 * Apply a budget template to a specific month.
 */
async function applyBudgetTemplate(templateId: string, year: number, month: number): Promise<{ appliedCount: number }> {
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

  return { appliedCount };
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
