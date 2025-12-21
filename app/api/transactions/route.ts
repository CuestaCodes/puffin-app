// API routes for transactions
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { 
  getTransactions, 
  createTransaction, 
  getUncategorizedCount 
} from '@/lib/db/transactions';
import { 
  createTransactionSchema, 
  transactionFilterSchema, 
  paginationSchema 
} from '@/lib/validations';

// GET /api/transactions - List transactions with filtering and pagination
export async function GET(request: NextRequest) {
  const { isAuthenticated, response } = await requireAuth();
  if (!isAuthenticated) return response;

  try {
    initializeDatabase();
    
    const { searchParams } = new URL(request.url);
    
    // Parse filter params
    const filterResult = transactionFilterSchema.safeParse({
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
      upperCategoryId: searchParams.get('upperCategoryId') || undefined,
      sourceId: searchParams.get('sourceId') || undefined,
      search: searchParams.get('search') || undefined,
      minAmount: searchParams.get('minAmount') ? Number(searchParams.get('minAmount')) : undefined,
      maxAmount: searchParams.get('maxAmount') ? Number(searchParams.get('maxAmount')) : undefined,
      uncategorized: searchParams.get('uncategorized') === 'true',
      includeDeleted: searchParams.get('includeDeleted') === 'true',
    });

    // Parse pagination params
    const paginationResult = paginationSchema.safeParse({
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 50,
      sortBy: searchParams.get('sortBy') || 'date',
      sortOrder: searchParams.get('sortOrder') || 'desc',
    });

    const filter = filterResult.success ? filterResult.data : {};
    const pagination = paginationResult.success ? paginationResult.data : { page: 1, limit: 50, sortBy: 'date' as const, sortOrder: 'desc' as const };

    const { transactions, total } = getTransactions(filter, pagination);
    const uncategorizedCount = getUncategorizedCount();

    return NextResponse.json({
      transactions,
      total,
      page: pagination.page,
      limit: pagination.limit,
      totalPages: Math.ceil(total / pagination.limit),
      uncategorizedCount,
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transactions' },
      { status: 500 }
    );
  }
}

// POST /api/transactions - Create a new transaction
export async function POST(request: NextRequest) {
  const { isAuthenticated, response } = await requireAuth();
  if (!isAuthenticated) return response;

  try {
    initializeDatabase();
    
    const body = await request.json();
    const validation = createTransactionSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const transaction = createTransaction(validation.data);
    
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (error) {
    console.error('Error creating transaction:', error);
    return NextResponse.json(
      { error: 'Failed to create transaction' },
      { status: 500 }
    );
  }
}



