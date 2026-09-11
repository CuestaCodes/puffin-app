// GET /api/action-log/export - Export the import action log as JSONL
//
// Browser dev has no save dialog, so this returns the serialized log for the
// caller to download as a blob. The Tauri handler opens a real save dialog and
// returns the chosen path instead — see lib/services/handlers/action-log.ts.
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { parseActionLog, serializeActionLog } from '@/lib/action-log-file';
import { readActionLogFile } from '@/lib/action-log-server';

export async function GET() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const entries = parseActionLog(readActionLogFile());

    if (entries.length === 0) {
      return NextResponse.json({ success: false, empty: true });
    }

    return NextResponse.json({
      success: true,
      jsonl: serializeActionLog(entries),
      filename: `puffin-import-log-${new Date().toISOString().split('T')[0]}.jsonl`,
      count: entries.length,
    });
  } catch (error) {
    console.error('Error exporting action log:', error);
    return NextResponse.json({ error: 'Failed to export action log' }, { status: 500 });
  }
}
