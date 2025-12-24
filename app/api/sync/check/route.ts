/**
 * Sync Check API
 * GET - Check if sync is required before editing
 */

import { NextResponse } from 'next/server';
import { SyncConfigManager } from '@/lib/sync/config';
import { GoogleDriveService } from '@/lib/sync/google-drive';

export async function GET() {
  try {
    const config = SyncConfigManager.getConfig();

    // If not configured, no sync required
    if (!config.isConfigured || !config.folderId) {
      return NextResponse.json({
        syncRequired: false,
        reason: 'not_configured',
      });
    }

    // Get current local database hash
    const localHash = SyncConfigManager.computeDbHash();

    // Get cloud backup info
    const driveService = new GoogleDriveService();
    const cloudInfo = await driveService.getRemoteBackupInfo(config.folderId);

    // If no cloud backup exists, sync is required (first sync)
    if (!cloudInfo.exists) {
      return NextResponse.json({
        syncRequired: true,
        reason: 'no_cloud_backup',
        message: 'No backup found in cloud. Please upload your data first.',
        canEdit: true, // Allow editing if no cloud backup - they need to upload first
      });
    }

    // If we have never synced, sync is required
    if (!config.lastSyncedAt) {
      return NextResponse.json({
        syncRequired: true,
        reason: 'never_synced',
        message: 'Please sync with the cloud before making changes.',
        canEdit: false,
      });
    }

    // If cloud backup is newer than our last sync, sync is required
    if (cloudInfo.modifiedTime) {
      const lastSyncTime = new Date(config.lastSyncedAt).getTime();
      const cloudModifiedTime = cloudInfo.modifiedTime.getTime();

      if (cloudModifiedTime > lastSyncTime + 60000) { // 1 minute buffer for clock differences
        return NextResponse.json({
          syncRequired: true,
          reason: 'cloud_newer',
          message: 'A newer version exists in the cloud. Please download before editing.',
          canEdit: false,
          cloudModifiedAt: cloudInfo.modifiedTime.toISOString(),
          lastSyncedAt: config.lastSyncedAt,
        });
      }
    }

    // All good - no sync required
    return NextResponse.json({
      syncRequired: false,
      reason: 'in_sync',
      localHash,
      lastSyncedAt: config.lastSyncedAt,
      canEdit: true,
    });
  } catch (error) {
    console.error('Sync check error:', error);
    // On error, allow editing but warn the user
    return NextResponse.json({
      syncRequired: false,
      reason: 'check_failed',
      canEdit: true,
      warning: 'Could not verify sync status. Proceed with caution.',
    });
  }
}

