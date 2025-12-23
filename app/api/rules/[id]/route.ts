// API routes for individual auto-categorisation rule operations
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { getRuleById, updateRule, deleteRule, applyRuleToExistingTransactions } from '@/lib/db/rules';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/rules/[id] - Get a single rule
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const { id } = await params;
    const rule = getRuleById(id);

    if (!rule) {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(rule);
  } catch (error) {
    console.error('Error fetching rule:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rule' },
      { status: 500 }
    );
  }
}

// PATCH /api/rules/[id] - Update a single rule
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const { id } = await params;
    const body = await request.json();
    const { match_text, sub_category_id, is_active } = body;

    // Validate match_text if provided
    if (match_text !== undefined && (typeof match_text !== 'string' || match_text.trim().length === 0)) {
      return NextResponse.json(
        { error: 'match_text must be a non-empty string' },
        { status: 400 }
      );
    }

    const updates: { match_text?: string; sub_category_id?: string; is_active?: boolean } = {};
    if (match_text !== undefined) updates.match_text = match_text;
    if (sub_category_id !== undefined) updates.sub_category_id = sub_category_id;
    if (is_active !== undefined) updates.is_active = is_active;

    const rule = updateRule(id, updates);

    if (!rule) {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(rule);
  } catch (error) {
    console.error('Error updating rule:', error);
    return NextResponse.json(
      { error: 'Failed to update rule' },
      { status: 500 }
    );
  }
}

// POST /api/rules/[id] - Apply rule to existing uncategorized transactions
export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const { id } = await params;
    const rule = getRuleById(id);

    if (!rule) {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
      );
    }

    const updatedCount = applyRuleToExistingTransactions(id);

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `Applied rule to ${updatedCount} transaction${updatedCount !== 1 ? 's' : ''}`,
    });
  } catch (error) {
    console.error('Error applying rule:', error);
    return NextResponse.json(
      { error: 'Failed to apply rule' },
      { status: 500 }
    );
  }
}

// DELETE /api/rules/[id] - Delete a rule
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const { id } = await params;
    const deleted = deleteRule(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Rule not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting rule:', error);
    return NextResponse.json(
      { error: 'Failed to delete rule' },
      { status: 500 }
    );
  }
}
