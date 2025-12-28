// API routes for auto-categorisation rules
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { createAutoRuleSchema, reorderRulesSchema } from '@/lib/validations';
import {
  getAllRules,
  createRule,
  updateRulePriorities,
  getRuleStats,
  testRule,
  countMatchingTransactions,
} from '@/lib/db/rules';

// GET /api/rules - Get all rules
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    // Get rule statistics
    if (action === 'stats') {
      const stats = getRuleStats();
      return NextResponse.json(stats);
    }

    // Test a rule against existing transactions
    if (action === 'test') {
      const matchText = searchParams.get('matchText');
      if (!matchText) {
        return NextResponse.json(
          { error: 'matchText is required for testing' },
          { status: 400 }
        );
      }
      const limit = parseInt(searchParams.get('limit') || '10');
      const matches = testRule(matchText, limit);
      return NextResponse.json({ matches });
    }

    // Count matching uncategorized transactions for a match text
    if (action === 'count') {
      const matchText = searchParams.get('matchText');
      if (!matchText) {
        return NextResponse.json(
          { error: 'matchText is required for counting' },
          { status: 400 }
        );
      }
      const count = countMatchingTransactions(matchText);
      return NextResponse.json({ count });
    }

    const rules = getAllRules();
    return NextResponse.json(rules);
  } catch (error) {
    console.error('Error fetching rules:', error);
    return NextResponse.json(
      { error: 'Failed to fetch rules' },
      { status: 500 }
    );
  }
}

// POST /api/rules - Create a new rule
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const body = await request.json();
    const parseResult = createAutoRuleSchema.safeParse(body);

    if (!parseResult.success) {
      const errors = parseResult.error.issues.map(e => e.message).join(', ');
      return NextResponse.json(
        { error: errors },
        { status: 400 }
      );
    }

    const { match_text, sub_category_id } = parseResult.data;
    const rule = createRule({ match_text, sub_category_id });
    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error('Error creating rule:', error);
    return NextResponse.json(
      { error: 'Failed to create rule' },
      { status: 500 }
    );
  }
}

// PATCH /api/rules - Update rule priorities (reorder)
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const body = await request.json();
    const parseResult = reorderRulesSchema.safeParse(body);

    if (!parseResult.success) {
      const errors = parseResult.error.issues.map(e => e.message).join(', ');
      return NextResponse.json(
        { error: errors },
        { status: 400 }
      );
    }

    updateRulePriorities(parseResult.data.ruleIds);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating rule priorities:', error);
    return NextResponse.json(
      { error: 'Failed to update rule priorities' },
      { status: 500 }
    );
  }
}
