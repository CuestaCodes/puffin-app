// DELETE /api/data/backups/[filename] - Delete a specific backup
// POST /api/data/backups/[filename] - Restore from a specific backup
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabasePath, resetDatabaseConnection } from '@/lib/db';
import fs from 'fs';
import path from 'path';

// Get backups directory relative to database path
function getBackupsDir(): string {
  return path.join(path.dirname(getDatabasePath()), 'backups');
}

// Validate filename to prevent path traversal
function isValidFilename(filename: string): boolean {
  // Only allow alphanumeric, dash, underscore, dot, and must end with .db
  const validPattern = /^[a-zA-Z0-9_-]+\.db$/;
  return validPattern.test(filename) && !filename.includes('..');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const { filename } = await params;

    // Validate filename
    if (!isValidFilename(filename)) {
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      );
    }

    const backupPath = path.join(getBackupsDir(), filename);

    // Check if backup exists
    if (!fs.existsSync(backupPath)) {
      return NextResponse.json(
        { error: 'Backup not found' },
        { status: 404 }
      );
    }

    // Delete the backup file
    fs.unlinkSync(backupPath);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete backup error:', error);
    return NextResponse.json(
      { error: 'Failed to delete backup' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const { filename } = await params;

    // Validate filename
    if (!isValidFilename(filename)) {
      return NextResponse.json(
        { error: 'Invalid filename' },
        { status: 400 }
      );
    }

    const backupPath = path.join(getBackupsDir(), filename);

    // Check if backup exists
    if (!fs.existsSync(backupPath)) {
      return NextResponse.json(
        { error: 'Backup not found' },
        { status: 404 }
      );
    }

    const dbPath = getDatabasePath();
    const backupsDir = getBackupsDir();

    // Create a backup of current database before restoring
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
    const preRestoreBackup = `pre-restore-${timestamp}.db`;
    const preRestorePath = path.join(backupsDir, preRestoreBackup);

    // Close database connection and reset initialization flag before file operations
    resetDatabaseConnection();

    // Backup current database
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, preRestorePath);
    }

    // Restore from backup
    fs.copyFileSync(backupPath, dbPath);

    return NextResponse.json({
      success: true,
      message: 'Database restored successfully. Please refresh the page.',
      preRestoreBackup,
    });
  } catch (error) {
    console.error('Restore backup error:', error);
    return NextResponse.json(
      { error: 'Failed to restore backup' },
      { status: 500 }
    );
  }
}
