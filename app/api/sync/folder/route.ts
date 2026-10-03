// POST /api/sync/folder - create, reuse, or select the Drive folder to sync with
//
// Replaces the Google Picker, which cannot run inside the desktop webview.
// Creating a folder is the only selection path that works at the standard
// `drive.file` scope, because Google shows the app only what it created —
// which is also why a folder Puffin made can be reused on another device.
// Mirrors handleSyncFolder in lib/services/handlers/sync.ts.
import { NextRequest, NextResponse } from 'next/server';
import { GoogleDriveService } from '@/lib/sync/google-drive';
import { SyncConfigManager } from '@/lib/sync/config';
import { chooseSyncFolder, DEFAULT_SYNC_FOLDER_NAME } from '@/lib/sync/drive-selection';
import type { DriveFolderCandidate, SyncFolderSelectionResponse } from '@/types/sync';

/** Save a chosen folder, clearing anything that belonged to the previous target. */
function saveFolder(folder: DriveFolderCandidate): void {
  const isNewTarget = SyncConfigManager.getConfig().folderId !== folder.id;
  SyncConfigManager.saveConfig({
    folderId: folder.id,
    folderName: folder.name,
    isFileBasedSync: false,
    // A different folder holds a different database, so the previous target's
    // baseline would make an unrelated one look already in sync
    ...(isNewTarget ? { syncedDbHash: null, lastSyncedAt: null, backupFileId: null } : {}),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const requestedName = typeof body.name === 'string' && body.name.trim()
      ? body.name.trim()
      : DEFAULT_SYNC_FOLDER_NAME;
    const folderId = typeof body.folderId === 'string' ? body.folderId.trim() : '';
    const forceCreate = body.create === true;

    const drive = new GoogleDriveService();
    if (!(await drive.initialize())) {
      const response: SyncFolderSelectionResponse = {
        success: false,
        error: drive.hasRefreshFailed()
          ? 'Google rejected the refresh token. Please reconnect Google Drive.'
          : 'Not authenticated with Google',
        errorCode: drive.hasRefreshFailed() ? 'REFRESH_FAILED' : 'AUTH_REQUIRED',
      };
      return NextResponse.json(response, { status: 401 });
    }

    // Picking one of the candidates offered earlier
    if (folderId) {
      const chosen = await drive.getFolder(folderId);
      if (!chosen) {
        const response: SyncFolderSelectionResponse = {
          success: false,
          error: 'That folder is no longer available',
          errorCode: 'NOT_FOUND',
        };
        return NextResponse.json(response, { status: 404 });
      }
      saveFolder(chosen);
      const response: SyncFolderSelectionResponse = {
        success: true,
        folderId: chosen.id,
        folderName: chosen.name,
        created: false,
        shared: chosen.shared ?? false,
      };
      return NextResponse.json(response);
    }

    const decision = forceCreate
      ? ({ action: 'create' } as const)
      : chooseSyncFolder(requestedName, await drive.listFolders(requestedName));

    if (decision.action === 'confirm') {
      const response: SyncFolderSelectionResponse = {
        success: false,
        needsConfirmation: true,
        candidates: decision.candidates,
      };
      return NextResponse.json(response);
    }

    const folder = decision.action === 'reuse'
      ? decision.folder
      : await drive.createSyncFolder(requestedName);

    saveFolder(folder);

    const response: SyncFolderSelectionResponse = {
      success: true,
      folderId: folder.id,
      folderName: folder.name,
      created: decision.action === 'create',
      shared: folder.shared ?? false,
    };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Sync folder selection error:', error);
    const response: SyncFolderSelectionResponse = {
      success: false,
      error: 'Failed to set the sync folder',
    };
    return NextResponse.json(response, { status: 500 });
  }
}
