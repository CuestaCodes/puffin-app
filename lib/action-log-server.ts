/**
 * Action log file location for the browser-dev API routes.
 *
 * Node-only — imported by app/api/action-log/**, never by client code. The
 * Tauri handler resolves its own path via appDataDir() instead.
 */

import fs from 'fs';
import path from 'path';
import { ACTION_LOG_FILENAME } from '@/lib/action-log-file';

export const ACTION_LOG_DATA_DIR =
  process.env.PUFFIN_DATA_DIR || path.join(process.cwd(), 'data');

export const ACTION_LOG_PATH = path.join(ACTION_LOG_DATA_DIR, ACTION_LOG_FILENAME);

/** Returns the raw file contents, or empty string when no log exists yet. */
export function readActionLogFile(): string {
  if (!fs.existsSync(ACTION_LOG_PATH)) return '';
  return fs.readFileSync(ACTION_LOG_PATH, 'utf-8');
}
