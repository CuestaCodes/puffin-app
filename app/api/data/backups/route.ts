// GET /api/data/backups - List local backups
// POST /api/data/backups - Create a new local backup
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabasePath, getDatabase, initializeDatabase } from '@/lib/db';
import fs from 'fs';
import path from 'path';

// Get backups directory relative to database path
function getBackupsDir(): string {
  return path.join(path.dirname(getDatabasePath()), 'backups');
}

export async function GET() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const backupsDir = getBackupsDir();

    // Ensure backups directory exists
    if (!fs.existsSync(backupsDir)) {
      return NextResponse.json({ backups: [] });
    }

    // List all .db files in the backups directory
    const files = fs.readdirSync(backupsDir)
      .filter(file => file.endsWith('.db'))
      .map(filename => {
        const filepath = path.join(backupsDir, filename);
        const stats = fs.statSync(filepath);
        return {
          filename,
          size: stats.size,
          createdAt: stats.birthtime.toISOString(),
          modifiedAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({ backups: files });
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
    const backupsDir = getBackupsDir();

    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json(
        { error: 'Database file not found' },
        { status: 404 }
      );
    }

    // Ensure backups directory exists
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // Checkpoint WAL to ensure all recent writes are in the main .db file
    initializeDatabase();
    const db = getDatabase();
    db.pragma('wal_checkpoint(TRUNCATE)');

    // Generate backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
    const filename = `puffin-backup-${timestamp}.db`;
    const backupPath = path.join(backupsDir, filename);

    // Copy the database file (now includes all recent changes)
    fs.copyFileSync(dbPath, backupPath);

    // Get the backup file stats
    const stats = fs.statSync(backupPath);

    return NextResponse.json({
      success: true,
      backup: {
        filename,
        size: stats.size,
        createdAt: stats.birthtime.toISOString(),
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
