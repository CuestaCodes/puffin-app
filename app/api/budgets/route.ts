// API routes for budgets
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { 
  getBudgetsByMonth, 
  getBudgetSummary,
  upsertBudget,
  copyBudgetsToMonth
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
    
    // Default to current month
    const now = new Date();
    const year = yearParam ? parseInt(yearParam) : now.getFullYear();
    const month = monthParam ? parseInt(monthParam) : now.getMonth() + 1;
    
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
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const budget = upsertBudget(validation.data);
    
    return NextResponse.json({ budget }, { status: 201 });
  } catch (error) {
    console.error('Error creating budget:', error);
    return NextResponse.json(
      { error: 'Failed to create budget' },
      { status: 500 }
    );
  }
}

