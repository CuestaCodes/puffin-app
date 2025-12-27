// GET /api/data/export/backup - Download database as backup file
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabasePath, getDatabase, initializeDatabase } from '@/lib/db';
import fs from 'fs';

export async function GET() {
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

    // Read the database file (now includes all recent changes)
    const dbBuffer = fs.readFileSync(dbPath);

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
    const filename = `puffin-backup-${timestamp}.db`;

    // Return as downloadable file
    return new NextResponse(dbBuffer, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': dbBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('Backup export error:', error);
    return NextResponse.json(
      { error: 'Failed to export backup' },
      { status: 500 }
    );
  }
}
