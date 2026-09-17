// GET /api/data/backups - List local backups
// POST /api/data/backups - Create a new local backup
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabasePath, getDatabase, initializeDatabase } from '@/lib/db';
import { listLocalBackups, prepareBackupPath, pruneLocalBackups } from '@/lib/backup-retention-server';
import type { BackupListResponse } from '@/types/backups';
import fs from 'fs';

export async function GET() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    // Newest first, dated from the filename timestamp — see lib/backup-retention.ts
    const response: BackupListResponse = { backups: await listLocalBackups() };
    return NextResponse.json(response);
  } catch (error) {
    console.error('List backups error:', error);
    return NextResponse.json(
      { error: 'Failed to list backups' },
      { status: 500 }
    );
  }
}

export async function POST() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const dbPath = getDatabasePath();

    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json(
        { error: 'Database file not found' },
        { status: 404 }
      );
    }

    // Checkpoint WAL to ensure all recent writes are in the main .db file
    initializeDatabase();
    const db = getDatabase();
    db.pragma('wal_checkpoint(TRUNCATE)');

    // Copy the database file (now includes all recent changes)
    const backup = prepareBackupPath('manual');
    fs.copyFileSync(dbPath, backup.path);
    const stats = fs.statSync(backup.path);

    // Enforce the shared retention limit
    await pruneLocalBackups(backup.filename);

    return NextResponse.json({
      success: true,
      backup: {
        filename: backup.filename,
        size: stats.size,
        createdAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Create backup error:', error);
    return NextResponse.json(
      { error: 'Failed to create backup' },
      { status: 500 }
    );
  }
}
