// API route for dashboard analytics
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import {
  getDashboardSummary,
  getMonthlyTrends,
  getExpenseBreakdown,
  getIncomeBreakdown,
  getRecentTransactions,
} from '@/lib/db/analytics';

// GET /api/analytics/dashboard - Get all dashboard data
export async function GET(request: NextRequest) {
  const { isAuthenticated, response } = await requireAuth();
  if (!isAuthenticated) return response;

  try {
    initializeDatabase();

    const { searchParams } = new URL(request.url);
    const months = parseInt(searchParams.get('months') || '6');

    // Calculate date ranges for current and previous periods
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // For summary, use current month vs previous month
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    // Get all analytics data
    const summary = getDashboardSummary(
      formatDate(currentMonthStart),
      formatDate(currentMonthEnd),
      formatDate(prevMonthStart),
      formatDate(prevMonthEnd)
    );

    const trends = getMonthlyTrends(months);

    const expenseBreakdown = getExpenseBreakdown(
      formatDate(currentMonthStart),
      formatDate(currentMonthEnd)
    );

    const incomeBreakdown = getIncomeBreakdown(
      formatDate(currentMonthStart),
      formatDate(currentMonthEnd)
    );

    const recentTransactions = getRecentTransactions(10);

    return NextResponse.json({
      summary,
      trends,
      expenseBreakdown,
      incomeBreakdown,
      recentTransactions,
      period: {
        start: formatDate(currentMonthStart),
        end: formatDate(currentMonthEnd),
        months,
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard data' },
      { status: 500 }
    );
  }
}
