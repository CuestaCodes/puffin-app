// API routes for individual Net Worth entry operations
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import {
  getNetWorthEntryById,
  updateNetWorthEntry,
  deleteNetWorthEntry,
} from '@/lib/db/net-worth';
import type { UpdateNetWorthInput } from '@/types/net-worth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/net-worth/[id] - Get a single entry
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const { id } = await params;
    const entry = getNetWorthEntryById(id);

    if (!entry) {
      return NextResponse.json(
        { error: 'Net worth entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(entry);
  } catch (error) {
    console.error('Error fetching net worth entry:', error);
    return NextResponse.json(
      { error: 'Failed to fetch net worth entry' },
      { status: 500 }
    );
  }
}

// PUT /api/net-worth/[id] - Update an entry
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const { id } = await params;
    const body = await request.json() as UpdateNetWorthInput;

    const entry = updateNetWorthEntry(id, body);

    if (!entry) {
      return NextResponse.json(
        { error: 'Net worth entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(entry);
  } catch (error) {
    console.error('Error updating net worth entry:', error);
    return NextResponse.json(
      { error: 'Failed to update net worth entry' },
      { status: 500 }
    );
  }
}

// DELETE /api/net-worth/[id] - Delete an entry
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const { id } = await params;
    const deleted = deleteNetWorthEntry(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Net worth entry not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting net worth entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete net worth entry' },
      { status: 500 }
    );
  }
}

