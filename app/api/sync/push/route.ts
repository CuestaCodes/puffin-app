/**
 * Sync Push API
 * POST - Upload local database to Google Drive
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { GoogleDriveService } from '@/lib/sync/google-drive';
import { SyncConfigManager } from '@/lib/sync/config';

// Database paths
const DATA_DIR = process.env.PUFFIN_DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'puffin.db');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

/**
 * Create a local backup before sync
 */
function createLocalBackup(): string {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `puffin-backup-${timestamp}.db`);
  
  fs.copyFileSync(DB_PATH, backupPath);
  
  // Keep only last 5 backups
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('puffin-backup-') && f.endsWith('.db'))
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
    
    if (!config.isConfigured || !config.folderId) {
      return NextResponse.json(
        { success: false, error: 'Sync not configured' },
        { status: 400 }
      );
    }

    // Check if database exists
    if (!fs.existsSync(DB_PATH)) {
      return NextResponse.json(
        { success: false, error: 'Local database not found' },
        { status: 404 }
      );
    }

    // Create local backup before push
    createLocalBackup();

    // Upload to Google Drive
    const driveService = new GoogleDriveService();
    const result = await driveService.uploadDatabase(DB_PATH, config.folderId);

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        lastSyncedAt: new Date().toISOString() 
      });
    } else {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Push error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to upload database' },
      { status: 500 }
    );
  }
}

