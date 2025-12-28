// GET /api/data/stats - Get database statistics
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabase, initializeDatabase, getDatabasePath } from '@/lib/db';
import fs from 'fs';

export async function GET() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    const db = getDatabase();
    const dbPath = getDatabasePath();

    // Get file size
    let fileSize = 0;
    try {
      const stats = fs.statSync(dbPath);
      fileSize = stats.size;
    } catch {
      // File might not exist in some edge cases
    }

    // Get all statistics in a single query using subqueries
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM "transaction" WHERE is_deleted = 0) as transaction_count,
        (SELECT COUNT(*) FROM sub_category WHERE is_deleted = 0) as category_count,
        (SELECT COUNT(*) FROM auto_category_rule) as rule_count,
        (SELECT COUNT(*) FROM source) as source_count,
        (SELECT MIN(date) FROM "transaction" WHERE is_deleted = 0) as earliest,
        (SELECT MAX(date) FROM "transaction" WHERE is_deleted = 0) as latest
    `).get() as {
      transaction_count: number;
      category_count: number;
      rule_count: number;
      source_count: number;
      earliest: string | null;
      latest: string | null;
    };

    return NextResponse.json({
      fileSize,
      transactionCount: stats.transaction_count,
      categoryCount: stats.category_count,
      ruleCount: stats.rule_count,
      sourceCount: stats.source_count,
      earliestTransaction: stats.earliest,
      latestTransaction: stats.latest,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get statistics' },
      { status: 500 }
    );
  }
}
