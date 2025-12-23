// API route for dashboard analytics
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import {
  getDashboardSummary,
  getMonthlyTrendsByYear,
  getUpperCategoryBreakdown,
  getExpenseBreakdown,
  getMonthlyIncomeTrendsBySubcategory,
  getMonthlyCategoryTotals,
} from '@/lib/db/analytics';

// GET /api/analytics/dashboard - Get all dashboard data
export async function GET(request: NextRequest) {
  console.log('=== Dashboard API called ===');

  const auth = await requireAuth();
  if (!auth.isAuthenticated) {
    console.log('Dashboard API - Not authenticated');
    return auth.response;
  }

  try {
    console.log('Dashboard API - Initializing database...');
    initializeDatabase();

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

    // Format date as YYYY-MM-DD without timezone conversion issues
    const formatDate = (year: number, month: number, day: number) =>
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Calculate date ranges for the selected year
    const yearStartStr = formatDate(year, 1, 1);
    const yearEndStr = formatDate(year, 12, 31);

    // For summary comparison, use previous year
    const prevYearStartStr = formatDate(year - 1, 1, 1);
    const prevYearEndStr = formatDate(year - 1, 12, 31);

    // Get all analytics data
    const summary = getDashboardSummary(
      yearStartStr,
      yearEndStr,
      prevYearStartStr,
      prevYearEndStr
    );

    const trends = getMonthlyTrendsByYear(year);

    const upperCategoryBreakdown = getUpperCategoryBreakdown(
      yearStartStr,
      yearEndStr
    );

    const expenseBreakdown = getExpenseBreakdown(
      yearStartStr,
      yearEndStr
    );

    const incomeTrends = getMonthlyIncomeTrendsBySubcategory(year);

    const monthlyCategoryTotals = getMonthlyCategoryTotals(year);

    // Debug: log breakdown data
    console.log('Dashboard API - Year:', year);
    console.log('Dashboard API - Date range:', yearStartStr, 'to', yearEndStr);
    console.log('Dashboard API - Summary:', JSON.stringify(summary));
    console.log('Dashboard API - Trends count:', trends.length);
    console.log('Dashboard API - upperCategoryBreakdown:', JSON.stringify(upperCategoryBreakdown));
    console.log('Dashboard API - expenseBreakdown count:', expenseBreakdown.length);
    if (expenseBreakdown.length > 0) {
      console.log('Dashboard API - First expense:', JSON.stringify(expenseBreakdown[0]));
    }

    return NextResponse.json({
      summary,
      trends,
      upperCategoryBreakdown,
      expenseBreakdown,
      incomeTrends,
      monthlyCategoryTotals,
      period: {
        year,
        start: yearStartStr,
        end: yearEndStr,
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
