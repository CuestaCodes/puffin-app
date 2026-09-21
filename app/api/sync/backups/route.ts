// GET /api/sync/backups - database files this account can connect to
//
// Used by multi-account sync, where the database belongs to someone else and
// was shared with this account. Those files are invisible at the standard
// `drive.file` scope, so this list is empty until full access is granted.
// Mirrors handleSyncBackups in lib/services/handlers/sync.ts.
import { NextResponse } from 'next/server';
import { GoogleDriveService } from '@/lib/sync/google-drive';
import type { DriveBackupListResponse } from '@/types/sync';

export async function GET() {
  try {
    const drive = new GoogleDriveService();
    if (!(await drive.initialize())) {
      const response: DriveBackupListResponse = { files: [], error: 'Not authenticated with Google' };
      return NextResponse.json(response, { status: 401 });
    }

    const response: DriveBackupListResponse = { files: await drive.listBackupFiles() };
    return NextResponse.json(response);
  } catch (error) {
    console.error('List Drive backups error:', error);
    const response: DriveBackupListResponse = { files: [], error: 'Failed to list backup files' };
    return NextResponse.json(response, { status: 500 });
  }
}
