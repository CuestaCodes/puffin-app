/**
 * Sync Check API
 * GET - Check sync status and detect conflicts
 * 
 * Returns one of these scenarios:
 * 1. not_configured - Sync not set up, allow editing
 * 2. no_cloud_backup - Cloud empty, user should upload first
 * 3. never_synced - First time, user should download from cloud
 * 4. in_sync - All good, no changes anywhere
 * 5. local_only - Only local changes, safe to upload
 * 6. cloud_only - Only cloud changes, safe to download
 * 7. conflict - Both local and cloud have changes, user must decide
 */

import { NextResponse } from 'next/server';
import { SyncConfigManager } from '@/lib/sync/config';
import { GoogleDriveService } from '@/lib/sync/google-drive';
import type { SyncCheckResponse } from '@/types/sync';

// Buffer for clock differences between local machine and Google servers
const CLOCK_SKEW_BUFFER_MS = 60000; // 1 minute

// Re-export for backward compatibility
export type { SyncCheckResponse } from '@/types/sync';

export async function GET() {
  try {
    const config = SyncConfigManager.getConfig();

    // Check configuration - need either folder-based or file-based sync
    const hasValidConfig = config.isFileBasedSync
      ? !!config.backupFileId
      : !!config.folderId;

    // If not configured, no sync required - allow editing
    if (!config.isConfigured || !hasValidConfig) {
      return NextResponse.json<SyncCheckResponse>({
        syncRequired: false,
        reason: 'not_configured',
        canEdit: true,
      });
    }

    // Detect local changes by comparing current hash vs synced hash
    const hasLocalChanges = SyncConfigManager.hasLocalChanges();

    // Get cloud backup info
    const driveService = new GoogleDriveService();
    let cloudInfo: { exists: boolean; modifiedTime?: Date; error?: string };

    if (config.isFileBasedSync && config.backupFileId) {
      // File-based sync: get info by file ID directly
      cloudInfo = await driveService.getRemoteBackupInfoByFileId(config.backupFileId);
    } else {
      // Folder-based sync: search for backup file in folder
      cloudInfo = await driveService.getRemoteBackupInfo(config.folderId!);
    }

    // If no cloud backup exists
    if (!cloudInfo.exists) {
      return NextResponse.json<SyncCheckResponse>({
        syncRequired: true,
        reason: 'no_cloud_backup',
        message: 'No backup found in cloud. Upload your data to start syncing.',
        canEdit: true, // Allow editing - they need to upload first
        hasLocalChanges,
      });
    }

    // If we have never synced
    if (!config.lastSyncedAt) {
      return NextResponse.json<SyncCheckResponse>({
        syncRequired: true,
        reason: 'never_synced',
        message: 'A backup exists in the cloud. Download it to start, or upload to replace it.',
        canEdit: false, // Block editing until they sync
        hasLocalChanges,
        cloudModifiedAt: cloudInfo.modifiedTime?.toISOString(),
      });
    }

    // Try to get cloud hash from file metadata for more reliable comparison
    let cloudDbHash: string | null = null;
    const fileId = config.backupFileId || null;
    if (fileId) {
      const metadata = await driveService.getFileMetadata(fileId);
      if (metadata?.description) {
        try {
          const parsed = JSON.parse(metadata.description);
          cloudDbHash = parsed.dbHash || null;
        } catch {
          // Legacy file without hash metadata
        }
      }
    }

    // Detect cloud changes - prefer hash comparison, fall back to timestamp
    let hasCloudChanges = false;
    const lastSyncTime = new Date(config.lastSyncedAt).getTime();
    const cloudModifiedTime = cloudInfo.modifiedTime ? cloudInfo.modifiedTime.getTime() : 0;

    if (cloudDbHash && config.syncedDbHash) {
      // Hash-based comparison (more reliable)
      hasCloudChanges = cloudDbHash !== config.syncedDbHash;

      // Also check timestamp as secondary signal for mixed-version compatibility
      // (v1.0 may push new data without updating the hash in description)
      if (!hasCloudChanges && cloudModifiedTime > lastSyncTime + CLOCK_SKEW_BUFFER_MS) {
        hasCloudChanges = true;
      }
    } else if (cloudModifiedTime) {
      // Timestamp-based fallback for legacy files without hash metadata
      hasCloudChanges = cloudModifiedTime > lastSyncTime + CLOCK_SKEW_BUFFER_MS;
    }

    // Determine scenario based on local and cloud changes
    if (!hasLocalChanges && !hasCloudChanges) {
      // Scenario: Everything in sync
      return NextResponse.json<SyncCheckResponse>({
        syncRequired: false,
        reason: 'in_sync',
        canEdit: true,
        hasLocalChanges: false,
        hasCloudChanges: false,
        lastSyncedAt: config.lastSyncedAt,
      });
    }

    if (hasLocalChanges && !hasCloudChanges) {
      // Scenario: Local changes only (worked offline) - safe to upload
      return NextResponse.json<SyncCheckResponse>({
        syncRequired: true,
        reason: 'local_only',
        message: 'You have local changes that haven\'t been uploaded yet.',
        canEdit: true, // Allow editing - they can keep working
        hasLocalChanges: true,
        hasCloudChanges: false,
        lastSyncedAt: config.lastSyncedAt,
      });
    }

    if (!hasLocalChanges && hasCloudChanges) {
      // Scenario: Cloud changes only - safe to download
      return NextResponse.json<SyncCheckResponse>({
        syncRequired: true,
        reason: 'cloud_only',
        message: 'A newer version is available in the cloud.',
        canEdit: false, // Block editing until they download
        hasLocalChanges: false,
        hasCloudChanges: true,
        cloudModifiedAt: cloudInfo.modifiedTime?.toISOString(),
        lastSyncedAt: config.lastSyncedAt,
      });
    }

    // Scenario: Both have changes - CONFLICT
    return NextResponse.json<SyncCheckResponse>({
      syncRequired: true,
      reason: 'conflict',
      message: 'Both local and cloud have changes. Choose which version to keep.',
      canEdit: false, // Block editing until conflict resolved
      hasLocalChanges: true,
      hasCloudChanges: true,
      cloudModifiedAt: cloudInfo.modifiedTime?.toISOString(),
      lastSyncedAt: config.lastSyncedAt,
    });

  } catch (error) {
    console.error('Sync check error:', error);
    // On error, allow editing but warn the user
    return NextResponse.json<SyncCheckResponse>({
      syncRequired: false,
      reason: 'check_failed',
      canEdit: true,
      warning: 'Could not verify sync status. Proceed with caution.',
    });
  }
}

