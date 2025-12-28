/**
 * Sync Status API
 * GET - Get remote backup status for conflict detection
 */

import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { GoogleDriveService } from '@/lib/sync/google-drive';
import { SyncConfigManager } from '@/lib/sync/config';

// Database path
const DATA_DIR = process.env.PUFFIN_DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'puffin.db');

export async function GET() {
  try {
    const config = SyncConfigManager.getConfig();
    
    if (!config.isConfigured || !config.folderId) {
      return NextResponse.json({
        configured: false,
      });
    }

    // Get local database modified time
    let localModifiedTime: Date | null = null;
    if (fs.existsSync(DB_PATH)) {
      const stats = fs.statSync(DB_PATH);
      localModifiedTime = stats.mtime;
    }

    // Get remote backup info
    const driveService = new GoogleDriveService();
    const remoteInfo = await driveService.getRemoteBackupInfo(config.folderId);

    return NextResponse.json({
      configured: true,
      folderId: config.folderId,
      folderName: config.folderName,
      lastSyncedAt: config.lastSyncedAt,
      local: {
        exists: !!localModifiedTime,
        modifiedTime: localModifiedTime?.toISOString(),
      },
      remote: {
        exists: remoteInfo.exists,
        modifiedTime: remoteInfo.modifiedTime?.toISOString(),
        error: remoteInfo.error,
      },
    });
  } catch (error) {
    console.error('Status error:', error);
    return NextResponse.json(
      { error: 'Failed to get sync status' },
      { status: 500 }
    );
  }
}



