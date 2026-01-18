// API endpoint for checking duplicate transactions
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getExistingFingerprints, checkDuplicatesBatch, getDateRange } from '@/lib/csv/duplicate-detector';
import { initializeDatabase } from '@/lib/db';

interface TransactionToCheck {
  date: string;
  amount: number;
  description: string;
  rowIndex: number;
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;
  
  try {
    initializeDatabase();
    
    const body = await request.json();
    const { transactions } = body as { transactions: TransactionToCheck[] };
    
    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'Invalid request: transactions array required' },
        { status: 400 }
      );
    }
    
    if (transactions.length === 0) {
      return NextResponse.json({ duplicates: [] });
    }
    
    // Get date range from transactions
    const dates = transactions.map(t => t.date);
    const dateRange = getDateRange(dates);
    
    if (!dateRange) {
      return NextResponse.json({ duplicates: [] });
    }
    
    // Get existing fingerprints for the date range
    const existingFingerprints = getExistingFingerprints(
      dateRange.start,
      dateRange.end
    );
    
    // Check for duplicates
    const fingerprints = transactions.map(t => ({
      date: t.date,
      amount: t.amount,
      description: t.description || '',
    }));
    
    const duplicateFlags = checkDuplicatesBatch(fingerprints, existingFingerprints, true);
    
    // Return row indices of duplicates
    const duplicates = transactions
      .filter((_, index) => duplicateFlags[index])
      .map(t => t.rowIndex);
    
    return NextResponse.json({ duplicates });
  } catch (error) {
    console.error('Error checking duplicates:', error);
    return NextResponse.json(
      { error: 'Failed to check duplicates' },
      { status: 500 }
    );
  }
}

