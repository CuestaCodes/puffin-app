// API routes for transaction splitting
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { 
  splitTransaction, 
  getChildTransactions,
  unsplitTransaction,
  getTransactionById
} from '@/lib/db/transactions';
import { MIN_SPLITS, MAX_SPLITS } from '@/lib/constants';
import { z } from 'zod';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Schema for split request - uses centralized constants
const splitRequestSchema = z.object({
  splits: z.array(z.object({
    amount: z.number().positive('Amount must be positive'),
    sub_category_id: z.string().nullable().optional(),
    description: z.string().optional(),
  })).min(MIN_SPLITS, `Must have at least ${MIN_SPLITS} splits`).max(MAX_SPLITS, `Maximum ${MAX_SPLITS} splits allowed`),
});

// GET /api/transactions/[id]/split - Get child transactions for a split parent
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    const { id } = await params;
    
    const parent = getTransactionById(id);
    if (!parent) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }
    
    if (!parent.is_split) {
      return NextResponse.json(
        { error: 'Transaction is not split' },
        { status: 400 }
      );
    }
    
    const children = getChildTransactions(id);
    
    return NextResponse.json({
      parent,
      children,
    });
  } catch (error) {
    console.error('Error fetching split transactions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch split transactions' },
      { status: 500 }
    );
  }
}

// POST /api/transactions/[id]/split - Split a transaction
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    const { id } = await params;
    const body = await request.json();
    
    const validation = splitRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }
    
    const children = splitTransaction(id, validation.data.splits);
    const parent = getTransactionById(id);
    
    return NextResponse.json({
      success: true,
      parent,
      children,
    }, { status: 201 });
  } catch (error) {
    console.error('Error splitting transaction:', error);
    const message = error instanceof Error ? error.message : 'Failed to split transaction';
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}

// DELETE /api/transactions/[id]/split - Unsplit a transaction
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    const { id } = await params;
    
    const transaction = unsplitTransaction(id);
    
    return NextResponse.json({
      success: true,
      transaction,
    });
  } catch (error) {
    console.error('Error unsplitting transaction:', error);
    const message = error instanceof Error ? error.message : 'Failed to unsplit transaction';
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}

