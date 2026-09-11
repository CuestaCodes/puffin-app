// API routes for the import action log (browser dev path)
//
// The log is a JSONL file beside the database rather than a table: sync uploads
// and replaces the whole puffin.db, so a table would be pushed to Drive and
// wiped on every pull. All format decisions live in lib/action-log-file.ts,
// shared with the Tauri handler.
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '@/lib/auth';
import {
  ACTION_LOG_FILENAME,
  appendActionLogEntry,
  parseActionLog,
} from '@/lib/action-log-file';
import type { ActionLogEntry } from '@/types/action-log';

const DATA_DIR = process.env.PUFFIN_DATA_DIR || path.join(process.cwd(), 'data');
const LOG_PATH = path.join(DATA_DIR, ACTION_LOG_FILENAME);

function readLogFile(): string {
  if (!fs.existsSync(LOG_PATH)) return '';
  return fs.readFileSync(LOG_PATH, 'utf-8');
}

// GET /api/action-log - Read all entries
export async function GET() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    return NextResponse.json({ entries: parseActionLog(readLogFile()) });
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

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(LOG_PATH, appendActionLogEntry(readLogFile(), entry), 'utf-8');

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
    if (fs.existsSync(LOG_PATH)) fs.unlinkSync(LOG_PATH);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error clearing action log:', error);
    return NextResponse.json({ error: 'Failed to clear action log' }, { status: 500 });
  }
}
