// Analytics database operations for dashboard
import { getDatabase } from './index';
import type { TransactionWithCategory } from '@/types/database';

export interface DashboardSummary {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  totalSavings: number;
  incomeChange: number; // Percentage change from previous period
  expenseChange: number;
  netChange: number;
  savingsChange: number;
}

export interface MonthlyTrend {
  month: string; // YYYY-MM format
  monthLabel: string; // e.g., "Jan 2024"
  income: number;
  expenses: number;
  savings: number;
  bills: number;
  debt: number;
  net: number;
}

export interface UpperCategoryBreakdown {
  type: string;
  label: string;
  amount: number;
  percentage: number;
}

export interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  upperCategoryName: string;
  upperCategoryType: string;
  amount: number;
  percentage: number;
}

export interface UpperCategoryTrend {
  month: string;
  monthLabel: string;
  expense: number;
  saving: number;
  bill: number;
  debt: number;
}

/**
 * Get dashboard summary for a date range
 */
export function getDashboardSummary(
  startDate: string,
  endDate: string,
  prevStartDate: string,
  prevEndDate: string
): DashboardSummary {
  const db = getDatabase();

  // Current period totals
  // Exclude split parents (is_split = 1) and transfer categories from calculations
  const currentQuery = `
    SELECT
      COALESCE(SUM(CASE WHEN uc.type = 'income' THEN t.amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN uc.type = 'expense' THEN ABS(t.amount) ELSE 0 END), 0) as expenses,
      COALESCE(SUM(CASE WHEN uc.type = 'saving' THEN ABS(t.amount) ELSE 0 END), 0) as savings,
      COALESCE(SUM(CASE WHEN uc.type = 'bill' THEN ABS(t.amount) ELSE 0 END), 0) as bills,
      COALESCE(SUM(CASE WHEN uc.type = 'debt' THEN ABS(t.amount) ELSE 0 END), 0) as debt
    FROM "transaction" t
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE t.date >= ? AND t.date <= ?
      AND t.is_deleted = 0
      AND t.is_split = 0
      AND (uc.type IS NULL OR uc.type != 'transfer')
  `;

  const current = db.prepare(currentQuery).get(startDate, endDate) as {
    income: number;
    expenses: number;
    savings: number;
    bills: number;
    debt: number;
  };

  // Previous period totals (for comparison)
  const previous = db.prepare(currentQuery).get(prevStartDate, prevEndDate) as {
    income: number;
    expenses: number;
    savings: number;
    bills: number;
    debt: number;
  };

  // Calculate totals and changes
  const totalIncome = current.income || 0;
  const totalExpenses = (current.expenses || 0) + (current.bills || 0) + (current.debt || 0);
  const totalSavings = current.savings || 0;
  const netBalance = totalIncome - totalExpenses - totalSavings;

  const prevIncome = previous.income || 0;
  const prevExpenses = (previous.expenses || 0) + (previous.bills || 0) + (previous.debt || 0);
  const prevSavings = previous.savings || 0;
  const prevNet = prevIncome - prevExpenses - prevSavings;

  // Calculate percentage changes
  const calcChange = (current: number, previous: number): number => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - previous) / Math.abs(previous)) * 100);
  };

  return {
    totalIncome,
    totalExpenses,
    netBalance,
    totalSavings,
    incomeChange: calcChange(totalIncome, prevIncome),
    expenseChange: calcChange(totalExpenses, prevExpenses),
    netChange: calcChange(netBalance, prevNet),
    savingsChange: calcChange(totalSavings, prevSavings),
  };
}

/**
 * Get monthly spending trends for a specific year
 */
export function getMonthlyTrendsByYear(year: number): MonthlyTrend[] {
  const db = getDatabase();

  const query = `
    WITH RECURSIVE months AS (
      SELECT 1 as month_num
      UNION ALL
      SELECT month_num + 1
      FROM months
      WHERE month_num < 12
    )
    SELECT
      ? || '-' || printf('%02d', m.month_num) as month,
      COALESCE(SUM(CASE WHEN uc.type = 'income' THEN t.amount ELSE 0 END), 0) as income,
      COALESCE(SUM(CASE WHEN uc.type = 'expense' THEN ABS(t.amount) ELSE 0 END), 0) as expenses,
      COALESCE(SUM(CASE WHEN uc.type = 'saving' THEN ABS(t.amount) ELSE 0 END), 0) as savings,
      COALESCE(SUM(CASE WHEN uc.type = 'bill' THEN ABS(t.amount) ELSE 0 END), 0) as bills,
      COALESCE(SUM(CASE WHEN uc.type = 'debt' THEN ABS(t.amount) ELSE 0 END), 0) as debt
    FROM months m
    LEFT JOIN "transaction" t ON strftime('%Y', t.date) = ?
      AND CAST(strftime('%m', t.date) AS INTEGER) = m.month_num
      AND t.is_deleted = 0
      AND t.is_split = 0
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
      AND (uc.type IS NULL OR uc.type != 'transfer')
    GROUP BY m.month_num
    ORDER BY m.month_num ASC
  `;

  const yearStr = year.toString();
  const results = db.prepare(query).all(yearStr, yearStr) as Array<{
    month: string;
    income: number;
    expenses: number;
    savings: number;
    bills: number;
    debt: number;
  }>;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return results.map((row, index) => {
    const totalSpending = (row.expenses || 0) + (row.bills || 0) + (row.debt || 0) + (row.savings || 0);
    return {
      month: row.month,
      monthLabel: monthNames[index],
      income: row.income || 0,
      expenses: row.expenses || 0,
      savings: row.savings || 0,
      bills: row.bills || 0,
      debt: row.debt || 0,
      net: (row.income || 0) - totalSpending,
    };
  });
}

/**
 * Get spending breakdown by upper category type for a period
 */
export function getUpperCategoryBreakdown(startDate: string, endDate: string): UpperCategoryBreakdown[] {
  const db = getDatabase();

  const query = `
    SELECT
      uc.type,
      COALESCE(SUM(ABS(t.amount)), 0) as amount
    FROM "transaction" t
    JOIN sub_category sc ON t.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE t.date >= ? AND t.date <= ?
      AND t.is_deleted = 0
      AND t.is_split = 0
      AND uc.type IN ('expense', 'bill', 'debt', 'saving')
    GROUP BY uc.type
    HAVING amount > 0
    ORDER BY amount DESC
  `;

  const results = db.prepare(query).all(startDate, endDate) as Array<{
    type: string;
    amount: number;
  }>;

  const total = results.reduce((sum, row) => sum + row.amount, 0);

  const labels: Record<string, string> = {
    expense: 'Expenses',
    bill: 'Bills',
    debt: 'Debt',
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
 * Get expense breakdown by sub-category for a period
 */
export function getExpenseBreakdown(startDate: string, endDate: string): CategoryBreakdown[] {
  const db = getDatabase();

  const query = `
    SELECT
      sc.id as category_id,
      sc.name as category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type,
      COALESCE(SUM(ABS(t.amount)), 0) as amount
    FROM "transaction" t
    JOIN sub_category sc ON t.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE t.date >= ? AND t.date <= ?
      AND t.is_deleted = 0
      AND t.is_split = 0
      AND uc.type IN ('expense', 'bill', 'debt', 'saving')
    GROUP BY sc.id
    HAVING amount > 0
    ORDER BY amount DESC
  `;

  const results = db.prepare(query).all(startDate, endDate) as Array<{
    category_id: string;
    category_name: string;
    upper_category_name: string;
    upper_category_type: string;
    amount: number;
  }>;

  // Calculate total for percentages
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
 * Get income breakdown by sub-category for a period
 */
export function getIncomeBreakdown(startDate: string, endDate: string): CategoryBreakdown[] {
  const db = getDatabase();

  const query = `
    SELECT
      sc.id as category_id,
      sc.name as category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type,
      COALESCE(SUM(t.amount), 0) as amount
    FROM "transaction" t
    JOIN sub_category sc ON t.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE t.date >= ? AND t.date <= ?
      AND t.is_deleted = 0
      AND t.is_split = 0
      AND uc.type = 'income'
    GROUP BY sc.id
    HAVING amount > 0
    ORDER BY amount DESC
  `;

  const results = db.prepare(query).all(startDate, endDate) as Array<{
    category_id: string;
    category_name: string;
    upper_category_name: string;
    upper_category_type: string;
    amount: number;
  }>;

  // Calculate total for percentages
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
 * Get upper category spending trends over time
 */
export function getUpperCategoryTrends(months: number = 6): UpperCategoryTrend[] {
  const db = getDatabase();

  const query = `
    WITH RECURSIVE months AS (
      SELECT date('now', 'start of month', '-' || (? - 1) || ' months') as month_start
      UNION ALL
      SELECT date(month_start, '+1 month')
      FROM months
      WHERE month_start < date('now', 'start of month')
    )
    SELECT
      strftime('%Y-%m', m.month_start) as month,
      COALESCE(SUM(CASE WHEN uc.type = 'expense' THEN ABS(t.amount) ELSE 0 END), 0) as expense,
      COALESCE(SUM(CASE WHEN uc.type = 'saving' THEN ABS(t.amount) ELSE 0 END), 0) as saving,
      COALESCE(SUM(CASE WHEN uc.type = 'bill' THEN ABS(t.amount) ELSE 0 END), 0) as bill,
      COALESCE(SUM(CASE WHEN uc.type = 'debt' THEN ABS(t.amount) ELSE 0 END), 0) as debt
    FROM months m
    LEFT JOIN "transaction" t ON strftime('%Y-%m', t.date) = strftime('%Y-%m', m.month_start)
      AND t.is_deleted = 0
      AND t.is_split = 0
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
    GROUP BY strftime('%Y-%m', m.month_start)
    ORDER BY month ASC
  `;

  const results = db.prepare(query).all(months) as Array<{
    month: string;
    expense: number;
    saving: number;
    bill: number;
    debt: number;
  }>;

  return results.map(row => {
    const [year, monthNum] = row.month.split('-');
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthLabel = `${monthNames[parseInt(monthNum) - 1]} ${year}`;

    return {
      month: row.month,
      monthLabel,
      expense: row.expense || 0,
      saving: row.saving || 0,
      bill: row.bill || 0,
      debt: row.debt || 0,
    };
  });
}

/**
 * Get recent transactions for dashboard
 */
export function getRecentTransactions(limit: number = 10): TransactionWithCategory[] {
  const db = getDatabase();

  const query = `
    SELECT
      t.*,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type,
      s.name as source_name
    FROM "transaction" t
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
    LEFT JOIN source s ON t.source_id = s.id
    WHERE t.is_deleted = 0
      AND t.is_split = 0
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT ?
  `;

  return db.prepare(query).all(limit) as TransactionWithCategory[];
}
