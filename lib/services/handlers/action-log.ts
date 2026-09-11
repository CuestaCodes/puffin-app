/**
 * Tauri Handler: Import Action Log
 *
 * Mirrors /api/action-log. Reads and writes a JSONL file in the app data
 * directory, beside puffin.db but deliberately outside it — sync uploads and
 * replaces the whole database file, so a table would be pushed to Drive and
 * wiped on every pull.
 *
 * Format decisions (parsing, the entry cap, serialization) live in
 * lib/action-log-file.ts and are shared with the API route; this file supplies
 * only the file I/O.
 */

import {
  ACTION_LOG_FILENAME,
  appendActionLogEntry,
  parseActionLog,
  serializeActionLog,
} from '@/lib/action-log-file';
import type { ActionLogEntry } from '@/types/action-log';

interface HandlerContext {
  method: string;
  body?: unknown;
  params: Record<string, string>;
  path: string;
}

async function getLogPath(): Promise<string> {
  const { appDataDir, join } = await import('@tauri-apps/api/path');
  return join(await appDataDir(), ACTION_LOG_FILENAME);
}

async function readLogFile(): Promise<string> {
  const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
  const logPath = await getLogPath();

  if (!(await exists(logPath))) return '';
  return readTextFile(logPath);
}

/**
 * Action log handler - /api/action-log
 */
export async function handleActionLog(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  switch (method) {
    case 'GET':
      return { entries: parseActionLog(await readLogFile()) };
    case 'POST':
      return appendEntry(body as ActionLogEntry);
    case 'DELETE':
      return clearLog();
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

async function appendEntry(entry: ActionLogEntry): Promise<{ success: boolean }> {
  if (!entry || typeof entry.id !== 'string' || typeof entry.timestamp !== 'string') {
    throw new Error('Invalid action log entry');
  }

  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  const logPath = await getLogPath();

  await writeTextFile(logPath, appendActionLogEntry(await readLogFile(), entry));

  return { success: true };
}

async function clearLog(): Promise<{ success: boolean }> {
  const { exists, remove } = await import('@tauri-apps/plugin-fs');
  const logPath = await getLogPath();

  if (await exists(logPath)) {
    await remove(logPath);
  }

  return { success: true };
}

/**
 * Export handler - /api/action-log/export
 *
 * Opens a save dialog rather than handing the browser a blob to download. A
 * blob download works in the webview, but WebView2 drops the file into the
 * Downloads folder silently — no prompt, no path — so the user is told the
 * export succeeded without being told where it went. The dialog returns a path
 * the UI can actually report, which is what handleExportBackup does too.
 */
export async function handleActionLogExport(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'GET') {
    throw new Error(`Method ${method} not allowed`);
  }

  const entries = parseActionLog(await readLogFile());
  if (entries.length === 0) {
    return { success: false, empty: true };
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');

  const defaultName = `puffin-import-log-${new Date().toISOString().split('T')[0]}.jsonl`;

  const savePath = await save({
    defaultPath: defaultName,
    filters: [{ name: 'JSON Lines', extensions: ['jsonl'] }],
  });

  if (!savePath) {
    return { success: false, cancelled: true };
  }

  await writeTextFile(savePath, serializeActionLog(entries));

  return { success: true, path: savePath, count: entries.length };
}
