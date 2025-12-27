// GET /api/data/export/transactions - Export transactions as CSV
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabase, initializeDatabase } from '@/lib/db';

interface TransactionRow {
  date: string;
  description: string;
  amount: number;
  notes: string | null;
  upper_category: string | null;
  sub_category: string | null;
  source_name: string | null;
  is_split: number;
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    const db = getDatabase();

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build query with optional date filters
    let query = `
      SELECT
        t.date,
        t.description,
        t.amount,
        t.notes,
        uc.name as upper_category,
        sc.name as sub_category,
        s.name as source_name,
        t.is_split
      FROM "transaction" t
      LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
      LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
      LEFT JOIN source s ON t.source_id = s.id
      WHERE t.is_deleted = 0 AND t.parent_transaction_id IS NULL
    `;

    const params: string[] = [];

    if (startDate) {
      query += ' AND t.date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND t.date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY t.date DESC, t.created_at DESC';

    const transactions = db.prepare(query).all(...params) as TransactionRow[];

    // Build CSV
    const headers = ['Date', 'Description', 'Amount', 'Category', 'Subcategory', 'Source', 'Notes', 'Is Split'];
    const rows = transactions.map(t => [
      t.date,
      escapeCsvField(t.description),
      t.amount.toString(),
      escapeCsvField(t.upper_category || ''),
      escapeCsvField(t.sub_category || ''),
      escapeCsvField(t.source_name || ''),
      escapeCsvField(t.notes || ''),
      t.is_split ? 'Yes' : 'No',
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Return as downloadable file
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="puffin-transactions-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export transactions' },
      { status: 500 }
    );
  }
}

function escapeCsvField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}
