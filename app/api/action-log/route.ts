// API routes for the import action log (browser dev path)
//
// The log is a JSONL file beside the database rather than a table: sync uploads
// and replaces the whole puffin.db, so a table would be pushed to Drive and
// wiped on every pull. All format decisions live in lib/action-log-file.ts,
// shared with the Tauri handler.
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { requireAuth } from '@/lib/auth';
import { appendActionLogEntry, parseActionLog } from '@/lib/action-log-file';
import {
  ACTION_LOG_DATA_DIR,
  ACTION_LOG_PATH,
  readActionLogFile,
} from '@/lib/action-log-server';
import type { ActionLogEntry } from '@/types/action-log';

/**
 * Upper bound on a single entry. The 1000-entry cap bounds the number of
 * records but not their size, so one pathological header row could still bloat
 * the file.
 */
const MAX_ENTRY_BYTES = 8 * 1024;

// GET /api/action-log - Read all entries
export async function GET() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    return NextResponse.json({ entries: parseActionLog(readActionLogFile()) });
  } catch (error) {
    console.error('Error reading action log:', error);
    return NextResponse.json({ error: 'Failed to read action log' }, { status: 500 });
  }
}

// POST /api/action-log - Append one entry
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const entry = (await request.json()) as ActionLogEntry;

    if (!entry || typeof entry.id !== 'string' || typeof entry.timestamp !== 'string') {
      return NextResponse.json({ error: 'Invalid action log entry' }, { status: 400 });
    }

    if (JSON.stringify(entry).length > MAX_ENTRY_BYTES) {
      return NextResponse.json({ error: 'Action log entry too large' }, { status: 413 });
    }

    fs.mkdirSync(ACTION_LOG_DATA_DIR, { recursive: true });
    fs.writeFileSync(ACTION_LOG_PATH, appendActionLogEntry(readActionLogFile(), entry), 'utf-8');

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error writing action log:', error);
    return NextResponse.json({ error: 'Failed to write action log' }, { status: 500 });
  }
}

// DELETE /api/action-log - Clear the log
export async function DELETE() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    if (fs.existsSync(ACTION_LOG_PATH)) fs.unlinkSync(ACTION_LOG_PATH);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing action log:', error);
    return NextResponse.json({ error: 'Failed to clear action log' }, { status: 500 });
  }
}
