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

    // Get transaction count (excluding deleted)
    const transactionCount = db.prepare(`
      SELECT COUNT(*) as count FROM "transaction" WHERE is_deleted = 0
    `).get() as { count: number };

    // Get category count (sub-categories, excluding deleted)
    const categoryCount = db.prepare(`
      SELECT COUNT(*) as count FROM sub_category WHERE is_deleted = 0
    `).get() as { count: number };

    // Get rule count
    const ruleCount = db.prepare(`
      SELECT COUNT(*) as count FROM auto_category_rule
    `).get() as { count: number };

    // Get source count
    const sourceCount = db.prepare(`
      SELECT COUNT(*) as count FROM source
    `).get() as { count: number };

    // Get date range
    const dateRange = db.prepare(`
      SELECT
        MIN(date) as earliest,
        MAX(date) as latest
      FROM "transaction"
      WHERE is_deleted = 0
    `).get() as { earliest: string | null; latest: string | null };

    return NextResponse.json({
      fileSize,
      transactionCount: transactionCount.count,
      categoryCount: categoryCount.count,
      ruleCount: ruleCount.count,
      sourceCount: sourceCount.count,
      earliestTransaction: dateRange.earliest,
      latestTransaction: dateRange.latest,
    });
  } catch (error) {
    console.error('Stats error:', error);
    return NextResponse.json(
      { error: 'Failed to get statistics' },
      { status: 500 }
    );
  }
}
