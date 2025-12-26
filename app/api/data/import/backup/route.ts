// POST /api/data/import/backup - Restore database from uploaded backup file
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabasePath, resetDatabaseConnection, cleanupWalFiles } from '@/lib/db';
import { getBackupsDir, MAX_BACKUP_SIZE } from '@/lib/data/utils';
import fs from 'fs';
import path from 'path';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith('.db')) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a .db file.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_BACKUP_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 100MB.' },
        { status: 413 }
      );
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Basic SQLite validation - check magic header
    const fileHeader = buffer.slice(0, 16).toString('utf-8');
    if (!fileHeader.startsWith('SQLite format 3')) {
      return NextResponse.json(
        { error: 'Invalid database file. Not a valid SQLite database.' },
        { status: 400 }
      );
    }

    const dbPath = getDatabasePath();
    const backupsDir = getBackupsDir();

    // Ensure backups directory exists
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // Create a backup of current database before restoring
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
    const preRestoreBackup = `pre-restore-${timestamp}.db`;
    const preRestorePath = path.join(backupsDir, preRestoreBackup);

    // Close database connection and reset initialization flag before file operations
    resetDatabaseConnection();

    // Backup current database if it exists
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, preRestorePath);
    }

    // Write the uploaded file as the new database
    fs.writeFileSync(dbPath, buffer);

    // Clean up any stale WAL/SHM files from the old database
    cleanupWalFiles(dbPath);

    return NextResponse.json({
      success: true,
      message: 'Database restored successfully. Please refresh the page.',
      preRestoreBackup,
    });
  } catch (error) {
    console.error('Import backup error:', error);
    return NextResponse.json(
      { error: 'Failed to import backup' },
      { status: 500 }
    );
  }
}
