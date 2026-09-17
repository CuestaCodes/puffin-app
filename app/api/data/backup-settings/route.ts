// GET /api/data/backup-settings - How many local backups are kept
// PATCH /api/data/backup-settings - Change it, pruning immediately if lowered
//
// Stored in backup-settings.json beside the database rather than in it: sync
// replaces the whole puffin.db, and a per-device disk budget should not follow
// the data to another machine. Mirrors handleBackupSettings in
// lib/services/handlers/data.ts.
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { MAX_BACKUPS_TO_KEEP, MIN_BACKUPS_TO_KEEP, parseBackupSettingsUpdate } from '@/lib/backup-retention';
import {
  pruneLocalBackups,
  readBackupSettings,
  writeBackupSettings,
} from '@/lib/backup-retention-server';
import type { BackupSettingsResponse, BackupSettingsUpdateResponse } from '@/types/backups';

export async function GET() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const response: BackupSettingsResponse = { keep: readBackupSettings().keep };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Read backup settings error:', error);
    return NextResponse.json({ error: 'Failed to read backup settings' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const keep = parseBackupSettingsUpdate(await request.json().catch(() => null));
    if (keep === null) {
      return NextResponse.json(
        { error: `keep must be a whole number from ${MIN_BACKUPS_TO_KEEP} to ${MAX_BACKUPS_TO_KEEP}` },
        { status: 400 }
      );
    }

    const settings = writeBackupSettings(keep);
    const pruned = await pruneLocalBackups(undefined, settings.keep);

    const response: BackupSettingsUpdateResponse = { keep: settings.keep, pruned };
    return NextResponse.json(response);
  } catch (error) {
    console.error('Update backup settings error:', error);
    return NextResponse.json({ error: 'Failed to update backup settings' }, { status: 500 });
  }
}
