// POST /api/data/clear - Clear all transactions (keep categories, rules, settings)
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabase, initializeDatabase, getDatabasePath } from '@/lib/db';
import { prepareBackupPath, pruneLocalBackups } from '@/lib/backup-retention-server';
import fs from 'fs';

export async function POST() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    // Create a backup before clearing
    const backup = prepareBackupPath('pre-clear');
    const backupFilename = backup.filename;
    fs.copyFileSync(getDatabasePath(), backup.path);
    await pruneLocalBackups(backupFilename);

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
