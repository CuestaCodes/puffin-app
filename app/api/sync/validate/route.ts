/**
 * Folder Validation API
 * POST - Validate a Google Drive folder URL/ID
 */

import { NextResponse } from 'next/server';
import { GoogleDriveService } from '@/lib/sync/google-drive';
import { SyncConfigManager } from '@/lib/sync/config';
import { extractFolderIdFromUrl } from '@/types/sync';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { folderUrl } = body;

    if (!folderUrl) {
      return NextResponse.json(
        { success: false, error: 'Folder URL is required', errorCode: 'INVALID_URL' },
        { status: 400 }
      );
    }

    // Extract folder ID from URL
    const folderId = extractFolderIdFromUrl(folderUrl);
    if (!folderId) {
      return NextResponse.json(
        { success: false, error: 'Invalid Google Drive folder URL', errorCode: 'INVALID_URL' },
        { status: 400 }
      );
    }

    // Validate the folder
    const driveService = new GoogleDriveService();
    const result = await driveService.validateFolder(folderId);

    if (result.success) {
      // Save the validated folder to config. isFileBasedSync must be cleared:
      // choosing a folder switches away from multi-account file sync, and
      // leaving it set would keep push/pull pointed at the old backup file
      // while the UI showed the newly chosen folder.
      SyncConfigManager.saveConfig({
        folderId: result.folderId!,
        folderName: result.folderName!,
        isFileBasedSync: false,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Folder validation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to validate folder' },
      { status: 500 }
    );
  }
}



