// POST /api/data/clear - Clear all transactions (keep categories, rules, settings)
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabase, initializeDatabase, getDatabasePath } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function POST() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const dbPath = getDatabasePath();
    const backupsDir = path.join(path.dirname(dbPath), 'backups');

    // Create a backup before clearing
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
    const backupFilename = `pre-clear-${timestamp}.db`;
    const backupPath = path.join(backupsDir, backupFilename);
    fs.copyFileSync(dbPath, backupPath);

    initializeDatabase();
    const db = getDatabase();

    // Clear all transactions (including split transactions)
    db.exec('DELETE FROM "transaction"');

    // Clear budgets (optional - they reference categories which remain)
    // db.exec('DELETE FROM budget');

    // Get count of deleted transactions for confirmation
    const result = db.prepare('SELECT changes() as count').get() as { count: number };

    return NextResponse.json({
      success: true,
      message: `Cleared ${result.count} transactions. A backup was created.`,
      backupFilename,
      deletedCount: result.count,
    });
  } catch (error) {
    console.error('Clear data error:', error);
    return NextResponse.json(
      { error: 'Failed to clear transactions' },
      { status: 500 }
    );
  }
}
