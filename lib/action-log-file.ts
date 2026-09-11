/**
 * Action log file format — parse, serialize, append.
 *
 * Shared by BOTH storage paths: the dev API route (`app/api/action-log/route.ts`,
 * Node fs) and the Tauri handler (`lib/services/handlers/action-log.ts`,
 * plugin-fs). Each of those supplies only read-file and write-file; every
 * decision about the format lives here, so the two paths cannot drift the way
 * duplicated handler/route logic otherwise does.
 */

import type { ActionLogEntry } from '@/types/action-log';

export const ACTION_LOG_FILENAME = 'action-log.jsonl';

/**
 * Entries kept before the oldest are dropped.
 *
 * One event per import means this is years of history in well under a
 * megabyte, and the whole file is read on every append anyway.
 */
export const ACTION_LOG_MAX_ENTRIES = 1000;

function isEntry(value: unknown): value is ActionLogEntry {
  if (!value || typeof value !== 'object') return false;
  const raw = value as Record<string, unknown>;
  return typeof raw.id === 'string' && typeof raw.timestamp === 'string';
}

/**
 * Parse JSONL file contents into entries.
 *
 * Unparseable lines are skipped rather than thrown on. A log is diagnostic
 * data, so a single truncated line — a half-written append after a crash —
 * must not make the rest of the history unreadable or block new writes.
 */
export function parseActionLog(contents: string): ActionLogEntry[] {
  const entries: ActionLogEntry[] = [];

  for (const line of contents.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isEntry(parsed)) entries.push(parsed);
    } catch {
      // Skip corrupt line, keep the rest of the log readable
    }
  }

  return entries;
}

/** Serialize entries to JSONL. Always ends with a newline so a later append starts clean. */
export function serializeActionLog(entries: ActionLogEntry[]): string {
  if (entries.length === 0) return '';
  return entries.map(entry => JSON.stringify(entry)).join('\n') + '\n';
}

/**
 * Append an entry to existing file contents, returning the new contents.
 *
 * Read-modify-write rather than a raw append because the cap has to be applied,
 * and because it repairs a corrupt trailing line in passing.
 */
export function appendActionLogEntry(
  contents: string,
  entry: ActionLogEntry,
  maxEntries: number = ACTION_LOG_MAX_ENTRIES
): string {
  const entries = [...parseActionLog(contents), entry];
  const trimmed = entries.length > maxEntries ? entries.slice(entries.length - maxEntries) : entries;
  return serializeActionLog(trimmed);
}
