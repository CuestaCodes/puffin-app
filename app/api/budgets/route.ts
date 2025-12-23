// API routes for budgets
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import {
  getBudgetsByMonth,
  getBudgetSummary,
  upsertBudget,
  copyBudgetsToMonth,
  getCategoriesForBudgetEntry,
  getCategoryAverage,
  getBudgetCarryOver,
  initializeMonthlyBudgets,
  createBudgetsFrom12MonthAverage
} from '@/lib/db/budgets';
import { createBudgetSchema } from '@/lib/validations';

/**
 * Safely parse an integer from a query parameter with bounds checking
 */
function safeParseInt(
  value: string | null,
  min: number,
  max: number,
  fallback: number
): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < min || parsed > max) return fallback;
  return parsed;
}

// GET /api/budgets - Get budgets for a month
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    
    const { searchParams } = new URL(request.url);
    const withSummary = searchParams.get('summary') === 'true';
    const forEntry = searchParams.get('forEntry') === 'true';
    const categoryId = searchParams.get('categoryId');
    const averageMonthsParam = searchParams.get('averageMonths');

    // Safe parsing with bounds checking
    const now = new Date();
    const year = safeParseInt(searchParams.get('year'), 2000, 2100, now.getFullYear());
    const month = safeParseInt(searchParams.get('month'), 1, 12, now.getMonth() + 1);
    const averageMonths = safeParseInt(averageMonthsParam, 1, 24, 3);
    
    // Get category average if requested
    if (categoryId && averageMonthsParam) {
      const average = getCategoryAverage(categoryId, averageMonths);
      return NextResponse.json({ average });
    }
    
    // Get carry-over if requested
    if (categoryId && searchParams.get('carryOver') === 'true') {
      const carryOver = getBudgetCarryOver(categoryId, year, month);
      return NextResponse.json({ carryOver });
    }
    
    // Get categories for budget entry interface
    if (forEntry) {
      const categories = getCategoriesForBudgetEntry(year, month);
      return NextResponse.json({ categories, year, month });
    }
    
    if (withSummary) {
      const summary = getBudgetSummary(year, month);
      return NextResponse.json({ 
        ...summary,
        year,
        month,
      });
    }
    
    const budgets = getBudgetsByMonth(year, month);
    return NextResponse.json({ budgets, year, month });
  } catch (error) {
    console.error('Error fetching budgets:', error);
    return NextResponse.json(
      { error: 'Failed to fetch budgets' },
      { status: 500 }
    );
  }
}

// POST /api/budgets - Create or update a budget
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    
    const body = await request.json();
    
    // Handle copy operation
    if (body.action === 'copy') {
      const { fromYear, fromMonth, toYear, toMonth } = body;
      
      if (!fromYear || !fromMonth || !toYear || !toMonth) {
        return NextResponse.json(
          { error: 'Missing required fields for copy operation' },
          { status: 400 }
        );
      }
      
      const count = copyBudgetsToMonth(fromYear, fromMonth, toYear, toMonth);
      return NextResponse.json({ 
        success: true, 
        copiedCount: count,
        message: `Copied ${count} budgets`
      });
    }
    
    // Handle initialize operation - create $0 budgets for categories without budgets
    if (body.action === 'initialize') {
      const { year, month } = body;
      
      if (!year || !month) {
        return NextResponse.json(
          { error: 'Missing required fields for initialize operation' },
          { status: 400 }
        );
      }
      
      const count = initializeMonthlyBudgets(year, month);
      return NextResponse.json({ 
        success: true, 
        initializedCount: count,
        message: `Initialized ${count} budgets to $0`
      });
    }
    
    // Handle useAverage operation - create budgets from 12-month averages
    if (body.action === 'useAverage') {
      const { year, month } = body;
      
      if (!year || !month) {
        return NextResponse.json(
          { error: 'Missing required fields for useAverage operation' },
          { status: 400 }
        );
      }
      
      const count = createBudgetsFrom12MonthAverage(year, month);
      return NextResponse.json({ 
        success: true, 
        updatedCount: count,
        message: `Updated ${count} budgets with 12-month averages`
      });
    }
    
    // Normal create/update
    const validation = createBudgetSchema.safeParse(body);
    
    if (!validation.success) {
      const errorDetails = validation.error.flatten();
      console.error('Budget validation failed:', {
        body,
        errors: errorDetails,
      });
      return NextResponse.json(
        { 
          error: 'Validation failed', 
          message: 'Invalid budget data',
          details: errorDetails 
        },
        { status: 400 }
      );
    }

    try {
      const budget = upsertBudget(validation.data);
      return NextResponse.json({ budget }, { status: 201 });
    } catch (dbError) {
      console.error('Database error creating budget:', {
        error: dbError,
        message: dbError instanceof Error ? dbError.message : 'Unknown error',
        stack: dbError instanceof Error ? dbError.stack : undefined,
        data: validation.data,
      });
      return NextResponse.json(
        { 
          error: 'Failed to create budget',
          message: dbError instanceof Error ? dbError.message : 'Database error occurred'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Unexpected error creating budget:', {
      error,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { 
        error: 'Failed to create budget',
        message: error instanceof Error ? error.message : 'An unexpected error occurred'
      },
      { status: 500 }
    );
  }
}



