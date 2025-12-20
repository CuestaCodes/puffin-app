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
  getBudgetCarryOver
} from '@/lib/db/budgets';
import { createBudgetSchema } from '@/lib/validations';

// GET /api/budgets - Get budgets for a month
export async function GET(request: NextRequest) {
  const { isAuthenticated, response } = await requireAuth();
  if (!isAuthenticated) return response;

  try {
    initializeDatabase();
    
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const monthParam = searchParams.get('month');
    const withSummary = searchParams.get('summary') === 'true';
    const forEntry = searchParams.get('forEntry') === 'true';
    const categoryId = searchParams.get('categoryId');
    const averageMonths = searchParams.get('averageMonths');
    
    // Default to current month
    const now = new Date();
    const year = yearParam ? parseInt(yearParam) : now.getFullYear();
    const month = monthParam ? parseInt(monthParam) : now.getMonth() + 1;
    
    // Get category average if requested
    if (categoryId && averageMonths) {
      const months = parseInt(averageMonths) || 3;
      const average = getCategoryAverage(categoryId, months);
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
  const { isAuthenticated, response } = await requireAuth();
  if (!isAuthenticated) return response;

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
      console.log('Creating/updating budget with data:', validation.data);
      const budget = upsertBudget(validation.data);
      console.log('Budget created/updated successfully:', budget);
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



