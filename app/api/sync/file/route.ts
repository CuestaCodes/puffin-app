// POST /api/sync/file - connect sync to one database file (multi-account sync)
//
// The file-based counterpart of /api/sync/validate: takes a Drive file id or
// URL, confirms this account can see it, and switches sync to it. Mirrors
// handleSyncFile in lib/services/handlers/sync.ts.
import { NextRequest, NextResponse } from 'next/server';
import { GoogleDriveService } from '@/lib/sync/google-drive';
import { SyncConfigManager } from '@/lib/sync/config';
import { DRIVE_FOLDER_MIME_TYPE, extractDriveId } from '@/lib/sync/drive-selection';
import type { SyncFileSelectionResponse } from '@/types/sync';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const fileUrl = typeof body.fileUrl === 'string' ? body.fileUrl : '';

    const fileId = extractDriveId(fileUrl);
    if (!fileId) {
      const response: SyncFileSelectionResponse = {
        success: false,
        error: 'Enter a Google Drive file link or ID',
        errorCode: 'INVALID_URL',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const drive = new GoogleDriveService();
    if (!(await drive.initialize())) {
      const response: SyncFileSelectionResponse = {
        success: false,
        error: drive.hasRefreshFailed()
          ? 'Google rejected the refresh token. Please reconnect Google Drive.'
          : 'Not authenticated with Google',
        errorCode: drive.hasRefreshFailed() ? 'REFRESH_FAILED' : 'AUTH_REQUIRED',
      };
      return NextResponse.json(response, { status: 401 });
    }

    const file = await drive.getFileIdentity(fileId);
    if (!file) {
      // A file shared from another account is invisible at the standard scope,
      // so "not found" here usually means full access has not been granted
      const response: SyncFileSelectionResponse = {
        success: false,
        error: 'File not found. Connecting to a database shared by someone else needs full Drive access.',
        errorCode: 'NOT_FOUND',
      };
      return NextResponse.json(response, { status: 404 });
    }

    if (file.mimeType === DRIVE_FOLDER_MIME_TYPE) {
      const response: SyncFileSelectionResponse = {
        success: false,
        error: 'That link points to a folder. Use "Use an existing folder" instead.',
        errorCode: 'NOT_FOUND',
      };
      return NextResponse.json(response, { status: 400 });
    }

    const isNewTarget = SyncConfigManager.getConfig().backupFileId !== file.id;
    SyncConfigManager.saveConfig({
      backupFileId: file.id,
      folderName: file.name,
      // File-based sync replaces folder-based: leaving the folder id set would
      // keep push/pull pointed at the folder while the UI showed this file
      folderId: null,
      isFileBasedSync: true,
      ...(isNewTarget ? { syncedDbHash: null, lastSyncedAt: null } : {}),
    });

    const response: SyncFileSelectionResponse = {
      success: true,
      fileId: file.id,
      fileName: file.name,
      sharedWithMe: !file.ownedByMe,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Sync file selection error:', error);
    const response: SyncFileSelectionResponse = {
      success: false,
      error: 'Failed to connect to that file',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
