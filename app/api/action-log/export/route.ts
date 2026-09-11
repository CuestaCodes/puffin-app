// GET /api/action-log/export - Export the import action log as JSONL
//
// Browser dev has no save dialog, so this returns the serialized log for the
// caller to download as a blob. The Tauri handler opens a real save dialog and
// returns the chosen path instead — see lib/services/handlers/action-log.ts.
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '@/lib/auth';
import {
  ACTION_LOG_FILENAME,
  parseActionLog,
  serializeActionLog,
} from '@/lib/action-log-file';

const DATA_DIR = process.env.PUFFIN_DATA_DIR || path.join(process.cwd(), 'data');
const LOG_PATH = path.join(DATA_DIR, ACTION_LOG_FILENAME);

export async function GET() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const contents = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, 'utf-8') : '';
    const entries = parseActionLog(contents);

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
