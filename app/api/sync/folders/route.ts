// GET /api/sync/folders - Drive folders this account can offer as a sync target
//
// At the standard `drive.file` scope Google returns only folders Puffin
// created, so this list is empty on a fresh account until one is made. With
// full access it returns everything, and the appProperties marker distinguishes
// Puffin's own folders. Mirrors handleSyncFolders in lib/services/handlers/sync.ts.
import { NextRequest, NextResponse } from 'next/server';
import { GoogleDriveService } from '@/lib/sync/google-drive';
import type { DriveFolderListResponse } from '@/types/sync';

export async function GET(request: NextRequest) {
  try {
    const name = request.nextUrl.searchParams.get('name') ?? undefined;

    const drive = new GoogleDriveService();
    if (!(await drive.initialize())) {
      const response: DriveFolderListResponse = { folders: [], error: 'Not authenticated with Google' };
      return NextResponse.json(response, { status: 401 });
    }

    const response: DriveFolderListResponse = { folders: await drive.listFolders(name) };
    return NextResponse.json(response);
  } catch (error) {
    console.error('List Drive folders error:', error);
    const response: DriveFolderListResponse = { folders: [], error: 'Failed to list folders' };
    return NextResponse.json(response, { status: 500 });
  }
}
