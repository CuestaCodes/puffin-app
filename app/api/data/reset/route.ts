// POST /api/data/reset - Full app reset (delete database and all sync configuration)
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { getDatabasePath, resetDatabaseConnection, cleanupWalFiles } from '@/lib/db';
import { SyncConfigManager } from '@/lib/sync/config';
import fs from 'fs';
import path from 'path';

export async function POST() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const dbPath = getDatabasePath();
    const backupsDir = path.join(path.dirname(dbPath), 'backups');

    // Create a backup before resetting
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
    const backupFilename = `pre-reset-${timestamp}.db`;
    const backupPath = path.join(backupsDir, backupFilename);

    // Backup existing database if it exists
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, backupPath);
    }

    // Close database connection and reset initialization flag
    resetDatabaseConnection();

    // Delete the database file and WAL files
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    cleanupWalFiles(dbPath);

    // Clear all sync configuration (Google Drive connection, tokens, credentials)
    try {
      SyncConfigManager.clearConfig();
      SyncConfigManager.clearCredentials();
    } catch (syncError) {
      console.warn('Failed to clear sync config during reset:', syncError);
      // Continue with reset even if sync config clearing fails
    }

    // The next request will automatically recreate the database with fresh schema
    // User will need to set up password and reconfigure sync again

    return NextResponse.json({
      success: true,
      message: 'App reset successfully. Please refresh and set up your password again.',
      backupFilename,
    });
  } catch (error) {
    console.error('Reset database error:', error);
    return NextResponse.json(
      { error: 'Failed to reset database' },
      { status: 500 }
    );
  }
}
