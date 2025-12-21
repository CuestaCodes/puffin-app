// API route for dashboard analytics
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import {
  getDashboardSummary,
  getMonthlyTrendsByYear,
  getExpenseBreakdown,
  getRecentTransactions,
} from '@/lib/db/analytics';

// GET /api/analytics/dashboard - Get all dashboard data
export async function GET(request: NextRequest) {
  const { isAuthenticated, response } = await requireAuth();
  if (!isAuthenticated) return response;

  try {
    initializeDatabase();

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

    // Calculate date ranges for the selected year
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    // For summary comparison, use previous year
    const prevYearStart = new Date(year - 1, 0, 1);
    const prevYearEnd = new Date(year - 1, 11, 31);

    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    // Get all analytics data
    const summary = getDashboardSummary(
      formatDate(yearStart),
      formatDate(yearEnd),
      formatDate(prevYearStart),
      formatDate(prevYearEnd)
    );

    const trends = getMonthlyTrendsByYear(year);

    const expenseBreakdown = getExpenseBreakdown(
      formatDate(yearStart),
      formatDate(yearEnd)
    );

    const recentTransactions = getRecentTransactions(10);

    return NextResponse.json({
      summary,
      trends,
      expenseBreakdown,
      recentTransactions,
      period: {
        year,
        start: formatDate(yearStart),
        end: formatDate(yearEnd),
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
