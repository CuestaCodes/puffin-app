/**
 * Tauri Handler: Analytics Dashboard
 *
 * Handles analytics-related operations in Tauri mode.
 * Mirrors the functionality of /api/analytics/dashboard route.
 */

import * as db from '../tauri-db';

interface HandlerContext {
  method: string;
  body?: unknown;
  params: Record<string, string>;
  path: string;
}

interface DashboardSummary {
  totalIncome: number;
  totalSpend: number;
  netBalance: number;
  totalSavings: number;
  savingsRate: number;
  incomeChange: number;
  spendChange: number;
  netChange: number;
  savingsChange: number;
}

interface MonthlyTrend {
  month: string;
  monthLabel: string;
  income: number;
  expenses: number;
  savings: number;
  bills: number;
  debt: number;
  sinking: number;
  net: number;
}

interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  upperCategoryName: string;
  upperCategoryType: string;
  amount: number;
  percentage: number;
}

interface UpperCategoryBreakdown {
  type: string;
  label: string;
  amount: number;
  percentage: number;
}

interface MonthlyCategoryTotal {
  upperCategory: string;
  upperCategoryType: string;
  subCategory: string;
  monthlyTotals: number[];
  yearTotal: number;
}

/**
 * Dashboard handler - /api/analytics/dashboard
 */
export async function handleDashboard(ctx: HandlerContext): Promise<unknown> {
  const { method, params } = ctx;

  if (method !== 'GET') {
    throw new Error(`Method ${method} not allowed`);
  }

  const year = parseInt(params.year || new Date().getFullYear().toString());

  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  const prevStartDate = `${year - 1}-01-01`;
  const prevEndDate = `${year - 1}-12-31`;

  const [summary, monthlyTrends, upperCategoryBreakdown, expenseBreakdown, monthlyCategoryTotals] = await Promise.all([
    getDashboardSummary(startDate, endDate, prevStartDate, prevEndDate),
    getMonthlyTrendsByYear(year),
    getUpperCategoryBreakdown(year),
    getExpenseBreakdown(year),
    getMonthlyCategoryTotals(year),
  ]);

  return {
    summary,
    monthlyTrends,
    upperCategoryBreakdown,
    expenseBreakdown,
    monthlyCategoryTotals,
  };
}

/**
 * Get dashboard summary for a date range.
 */
async function getDashboardSummary(
  startDate: string,
  endDate: string,
  prevStartDate: string,
  prevEndDate: string
): Promise<DashboardSummary> {
  const currentQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN uc.type = 'income' THEN t.amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN uc.type = 'expense' THEN ABS(t.amount) ELSE 0 END), 0) as expenses,
      COALESCE(SUM(CASE WHEN uc.type = 'saving' THEN ABS(t.amount) ELSE 0 END), 0) as savings,
      COALESCE(SUM(CASE WHEN uc.type = 'bill' THEN ABS(t.amount) ELSE 0 END), 0) as bills,
      COALESCE(SUM(CASE WHEN uc.type = 'debt' THEN ABS(t.amount) ELSE 0 END), 0) as debt,
      COALESCE(SUM(CASE WHEN uc.type = 'sinking' THEN ABS(t.amount) ELSE 0 END), 0) as sinking
    FROM "transaction" t
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE t.date >= ? AND t.date <= ?
      AND t.is_deleted = 0
      AND t.is_split = 0
      AND (uc.type IS NULL OR uc.type != 'transfer')
  `;

  const current = await db.queryOne<{
    income: number;
    expenses: number;
    savings: number;
    bills: number;
    debt: number;
    sinking: number;
  }>(currentQuery, [startDate, endDate]);

  const previous = await db.queryOne<{
    income: number;
    expenses: number;
    savings: number;
    bills: number;
    debt: number;
    sinking: number;
  }>(currentQuery, [prevStartDate, prevEndDate]);

  const calculateTotalSpend = (data: { expenses: number; savings: number; bills: number; debt: number; sinking: number }) =>
    (data.expenses || 0) + (data.savings || 0) + (data.bills || 0) + (data.debt || 0) + (data.sinking || 0);

  const totalIncome = current?.income || 0;
  const totalSavings = current?.savings || 0;
  const totalSpend = calculateTotalSpend(current || { expenses: 0, savings: 0, bills: 0, debt: 0, sinking: 0 });
  const netBalance = totalIncome - totalSpend;

  const prevIncome = previous?.income || 0;
  const prevSavings = previous?.savings || 0;
  const prevSpend = calculateTotalSpend(previous || { expenses: 0, savings: 0, bills: 0, debt: 0, sinking: 0 });
  const prevNet = prevIncome - prevSpend;

  const calcChange = (curr: number, prev: number): number => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / Math.abs(prev)) * 100);
  };

  const savingsRate = totalIncome > 0 ? Math.round((totalSavings / totalIncome) * 1000) / 10 : 0;

  return {
    totalIncome,
    totalSpend,
    netBalance,
    totalSavings,
    savingsRate,
    incomeChange: calcChange(totalIncome, prevIncome),
    spendChange: calcChange(totalSpend, prevSpend),
    netChange: calcChange(netBalance, prevNet),
    savingsChange: calcChange(totalSavings, prevSavings),
  };
}

/**
 * Get monthly spending trends for a year.
 * Uses a single aggregated query instead of 12 separate queries.
 */
async function getMonthlyTrendsByYear(year: number): Promise<MonthlyTrend[]> {
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const yearStr = year.toString();

  // Single query that aggregates by month
  const results = await db.query<{
    month_num: number;
    income: number;
    expenses: number;
    savings: number;
    bills: number;
    debt: number;
    sinking: number;
  }>(`
    SELECT
      CAST(strftime('%m', t.date) AS INTEGER) as month_num,
      COALESCE(SUM(CASE WHEN uc.type = 'income' THEN t.amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN uc.type = 'expense' THEN ABS(t.amount) ELSE 0 END), 0) as expenses,
      COALESCE(SUM(CASE WHEN uc.type = 'saving' THEN ABS(t.amount) ELSE 0 END), 0) as savings,
      COALESCE(SUM(CASE WHEN uc.type = 'bill' THEN ABS(t.amount) ELSE 0 END), 0) as bills,
      COALESCE(SUM(CASE WHEN uc.type = 'debt' THEN ABS(t.amount) ELSE 0 END), 0) as debt,
      COALESCE(SUM(CASE WHEN uc.type = 'sinking' THEN ABS(t.amount) ELSE 0 END), 0) as sinking
    FROM "transaction" t
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE strftime('%Y', t.date) = ?
      AND t.is_deleted = 0
      AND t.is_split = 0
      AND (uc.type IS NULL OR uc.type != 'transfer')
    GROUP BY month_num
    ORDER BY month_num
  `, [yearStr]);

  // Build a map of results by month
  const resultMap = new Map<number, typeof results[0]>();
  for (const row of results) {
    resultMap.set(row.month_num, row);
  }

  // Generate all 12 months, filling in zeros for missing months
  const trends: MonthlyTrend[] = [];
  for (let month = 1; month <= 12; month++) {
    const monthStr = String(month).padStart(2, '0');
    const data = resultMap.get(month) || {
      month_num: month,
      income: 0,
      expenses: 0,
      savings: 0,
      bills: 0,
      debt: 0,
      sinking: 0,
    };
    const totalSpending = data.expenses + data.savings + data.bills + data.debt + data.sinking;

    trends.push({
      month: `${year}-${monthStr}`,
      monthLabel: monthNames[month - 1],
      income: data.income,
      expenses: data.expenses,
      savings: data.savings,
      bills: data.bills,
      debt: data.debt,
      sinking: data.sinking,
      net: data.income - totalSpending,
    });
  }

  return trends;
}

/**
 * Get spending breakdown by upper category type.
 */
async function getUpperCategoryBreakdown(year: number): Promise<UpperCategoryBreakdown[]> {
  const yearStr = year.toString();

  const results = await db.query<{ type: string; amount: number }>(`
    SELECT
      uc.type,
      COALESCE(SUM(ABS(t.amount)), 0) as amount
    FROM "transaction" t
    JOIN sub_category sc ON t.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE strftime('%Y', t.date) = ?
      AND t.is_deleted = 0
      AND t.is_split = 0
      AND uc.type IN ('expense', 'bill', 'debt', 'sinking', 'saving')
    GROUP BY uc.type
    HAVING SUM(ABS(t.amount)) > 0
    ORDER BY amount DESC
  `, [yearStr]);

  const total = results.reduce((sum, row) => sum + row.amount, 0);

  const labels: Record<string, string> = {
    expense: 'Expenses',
    bill: 'Bills',
    debt: 'Debt',
    sinking: 'Sinking Funds',
    saving: 'Savings',
  };

  return results.map(row => ({
    type: row.type,
    label: labels[row.type] || row.type,
    amount: row.amount,
    percentage: total > 0 ? Math.round((row.amount / total) * 1000) / 10 : 0,
  }));
}

/**
 * Get expense breakdown by sub-category.
 */
async function getExpenseBreakdown(year: number): Promise<CategoryBreakdown[]> {
  const yearStr = year.toString();

  const results = await db.query<{
    category_id: string;
    category_name: string;
    upper_category_name: string;
    upper_category_type: string;
    amount: number;
  }>(`
    SELECT
      sc.id as category_id,
      sc.name as category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type,
      COALESCE(SUM(ABS(t.amount)), 0) as amount
    FROM "transaction" t
    JOIN sub_category sc ON t.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE strftime('%Y', t.date) = ?
      AND t.is_deleted = 0
      AND t.is_split = 0
      AND uc.type IN ('expense', 'bill', 'debt', 'sinking', 'saving')
    GROUP BY sc.id
    HAVING SUM(ABS(t.amount)) > 0
    ORDER BY amount DESC
  `, [yearStr]);

  const total = results.reduce((sum, row) => sum + row.amount, 0);

  return results.map(row => ({
    categoryId: row.category_id,
    categoryName: row.category_name,
    upperCategoryName: row.upper_category_name,
    upperCategoryType: row.upper_category_type,
    amount: row.amount,
    percentage: total > 0 ? Math.round((row.amount / total) * 1000) / 10 : 0,
  }));
}

/**
 * Get monthly totals by category and subcategory.
 */
async function getMonthlyCategoryTotals(year: number): Promise<MonthlyCategoryTotal[]> {
  const yearStr = year.toString();

  const results = await db.query<{
    upper_category: string;
    upper_category_type: string;
    sub_category: string;
    month_num: number;
    amount: number;
  }>(`
    SELECT
      uc.name as upper_category,
      uc.type as upper_category_type,
      sc.name as sub_category,
      CAST(strftime('%m', t.date) AS INTEGER) as month_num,
      COALESCE(SUM(ABS(t.amount)), 0) as amount
    FROM "transaction" t
    JOIN sub_category sc ON t.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE strftime('%Y', t.date) = ?
      AND t.is_deleted = 0
      AND t.is_split = 0
      AND uc.type != 'transfer'
    GROUP BY uc.name, uc.type, sc.name, month_num
    ORDER BY
      CASE uc.type
        WHEN 'income' THEN 1
        WHEN 'expense' THEN 2
        WHEN 'bill' THEN 3
        WHEN 'saving' THEN 4
        WHEN 'debt' THEN 5
        WHEN 'sinking' THEN 6
        ELSE 7
      END,
      uc.name,
      sc.name,
      month_num
  `, [yearStr]);

  // Group by upper category + sub category
  const categoryMap = new Map<string, MonthlyCategoryTotal>();

  for (const row of results) {
    const key = `${row.upper_category}|${row.sub_category}`;

    if (!categoryMap.has(key)) {
      categoryMap.set(key, {
        upperCategory: row.upper_category,
        upperCategoryType: row.upper_category_type,
        subCategory: row.sub_category,
        monthlyTotals: new Array(12).fill(0),
        yearTotal: 0,
      });
    }

    const entry = categoryMap.get(key)!;
    entry.monthlyTotals[row.month_num - 1] = row.amount;
    entry.yearTotal += row.amount;
  }

  return Array.from(categoryMap.values());
}
