/**
 * Sync Pull API
 * POST - Download database from Google Drive
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { GoogleDriveService } from '@/lib/sync/google-drive';
import { SyncConfigManager } from '@/lib/sync/config';
import { resetDatabaseConnection, cleanupWalFiles } from '@/lib/db';

// Database paths
const DATA_DIR = process.env.PUFFIN_DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'puffin.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const TEMP_DOWNLOAD_PATH = path.join(DATA_DIR, 'puffin-download-temp.db');

/**
 * Create a local backup before overwriting
 */
function createLocalBackup(): string | null {
  if (!fs.existsSync(DB_PATH)) {
    return null;
  }

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `puffin-pre-pull-${timestamp}.db`);
  
  fs.copyFileSync(DB_PATH, backupPath);
  
  // Keep only last 5 pre-pull backups
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('puffin-pre-pull-') && f.endsWith('.db'))
    .sort()
    .reverse();
  
  for (const old of backups.slice(5)) {
    fs.unlinkSync(path.join(BACKUP_DIR, old));
  }

  return backupPath;
}

export async function POST() {
  try {
    const config = SyncConfigManager.getConfig();

    // Check configuration - need either folder-based or file-based sync
    const hasValidConfig = config.isFileBasedSync
      ? !!config.backupFileId
      : !!config.folderId;

    if (!config.isConfigured || !hasValidConfig) {
      return NextResponse.json(
        { success: false, error: 'Sync not configured' },
        { status: 400 }
      );
    }

    // Create local backup before pull
    const backupPath = createLocalBackup();

    // Download from Google Drive to temp location
    const driveService = new GoogleDriveService();
    let result: { success: boolean; error?: string; notFound?: boolean };

    if (config.isFileBasedSync && config.backupFileId) {
      // File-based sync: download by file ID directly
      result = await driveService.downloadDatabaseByFileId(config.backupFileId, TEMP_DOWNLOAD_PATH);
    } else {
      // Folder-based sync: search for backup file in folder
      result = await driveService.downloadDatabase(config.folderId!, TEMP_DOWNLOAD_PATH);
    }

    if (!result.success) {
      // Clean up temp file if it exists
      if (fs.existsSync(TEMP_DOWNLOAD_PATH)) {
        fs.unlinkSync(TEMP_DOWNLOAD_PATH);
      }

      if (result.notFound) {
        return NextResponse.json(
          { success: false, error: 'No backup found in sync folder', notFound: true },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    // Replace local database with downloaded one
    try {
      // Close existing database connection before replacing the file
      resetDatabaseConnection();

      // Remove existing database
      if (fs.existsSync(DB_PATH)) {
        fs.unlinkSync(DB_PATH);
      }
      // Also remove WAL and SHM files if they exist
      cleanupWalFiles(DB_PATH);

      // Move downloaded file to database location
      fs.renameSync(TEMP_DOWNLOAD_PATH, DB_PATH);

      // Mark as synced - stores current local hash (the downloaded file) and timestamp
      SyncConfigManager.markSynced();

      return NextResponse.json({
        success: true,
        lastSyncedAt: new Date().toISOString(),
        backupPath: backupPath || undefined,
      });
    } catch (replaceError) {
      // Restore from backup if replacement failed
      if (backupPath && fs.existsSync(backupPath)) {
        fs.copyFileSync(backupPath, DB_PATH);
      }
      throw replaceError;
    }
  } catch (error) {
    console.error('Pull error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to download database' },
      { status: 500 }
    );
  }
}

