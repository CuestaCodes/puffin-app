// POST /api/auth/reset - Full app reset (unauthenticated, for forgot password)
// This endpoint does NOT require authentication since the user forgot their password
import { NextResponse } from 'next/server';
import { getDatabasePath, resetDatabaseConnection, cleanupWalFiles } from '@/lib/db';
import { SyncConfigManager } from '@/lib/sync/config';
import fs from 'fs';
import path from 'path';

export async function POST() {
  try {
    const dbPath = getDatabasePath();
    const backupsDir = path.join(path.dirname(dbPath), 'backups');

    // Close database connection and reset initialization flag
    resetDatabaseConnection();

    // Delete the database file and WAL files
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
    cleanupWalFiles(dbPath);

    // Delete all local backups (full reset means starting completely fresh)
    if (fs.existsSync(backupsDir)) {
      const backupFiles = fs.readdirSync(backupsDir).filter(f => f.endsWith('.db'));
      for (const file of backupFiles) {
        try {
          fs.unlinkSync(path.join(backupsDir, file));
        } catch (err) {
          console.warn(`Failed to delete backup ${file}:`, err);
        }
      }
    }

    // Clear all sync configuration (Google Drive connection, tokens, credentials)
    try {
      SyncConfigManager.clearConfig();
      SyncConfigManager.clearCredentials();
    } catch (syncError) {
      console.warn('Failed to clear sync config during reset:', syncError);
      // Continue with reset even if sync config clearing fails
    }

    // The next request will automatically recreate the database with fresh schema
    // User will need to set up password again

    return NextResponse.json({
      success: true,
      message: 'App reset successfully. Please set up your password.',
    });
  } catch (error) {
    console.error('Reset app error:', error);
    return NextResponse.json(
      { error: 'Failed to reset app' },
      { status: 500 }
    );
  }
}
