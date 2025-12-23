// API routes for Net Worth entries
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import {
  getAllNetWorthEntries,
  getNetWorthEntriesForChart,
  createNetWorthEntry,
  generateProjectionPoints,
  calculateNetWorthProjection,
} from '@/lib/db/net-worth';
import { createNetWorthSchema } from '@/lib/validations';

// GET /api/net-worth - Get all entries or chart data
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const { searchParams } = new URL(request.url);
    const forChart = searchParams.get('chart') === 'true';

    if (forChart) {
      // Return data formatted for charting with projections
      const entries = getNetWorthEntriesForChart();
      const projection = calculateNetWorthProjection(entries);
      const projectionPoints = generateProjectionPoints(entries, 5);

      return NextResponse.json({
        entries,
        projection,
        projectionPoints,
      });
    }

    const entries = getAllNetWorthEntries();
    return NextResponse.json(entries);
  } catch (error) {
    console.error('Error fetching net worth entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch net worth entries' },
      { status: 500 }
    );
  }
}

// POST /api/net-worth - Create a new entry
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const body = await request.json();

    // Validate with Zod
    const parseResult = createNetWorthSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.errors[0]?.message || 'Invalid input' },
        { status: 400 }
      );
    }

    const entry = createNetWorthEntry(parseResult.data);
    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    console.error('Error creating net worth entry:', error);
    return NextResponse.json(
      { error: 'Failed to create net worth entry' },
      { status: 500 }
    );
  }
}
