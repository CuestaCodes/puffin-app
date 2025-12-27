// API route for dashboard analytics
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { formatDateYMD } from '@/lib/utils';
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
  const auth = await requireAuth();
  if (!auth.isAuthenticated) {
    return auth.response;
  }

  try {
    initializeDatabase();

    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString());

    // Calculate date ranges for the selected year
    const yearStartStr = formatDateYMD(year, 1, 1);
    const yearEndStr = formatDateYMD(year, 12, 31);

    // For summary comparison, use previous year
    const prevYearStartStr = formatDateYMD(year - 1, 1, 1);
    const prevYearEndStr = formatDateYMD(year - 1, 12, 31);

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
