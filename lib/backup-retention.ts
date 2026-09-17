/**
 * Local backup retention — naming, settings and the prune decision.
 *
 * Shared by BOTH storage paths: the dev API routes (`lib/backup-retention-server.ts`,
 * Node fs) and the Tauri handlers (`lib/services/tauri-backups.ts`, plugin-fs).
 * Each supplies only list-directory, stat and remove; every decision about which
 * backups exist, how old they are and which to delete lives here.
 *
 * Retention used to be written separately in each path, and the Tauri path never
 * got it: desktop backups accumulated without limit while dev kept five.
 */

import type { LocalBackup } from '@/types/backups';

export const BACKUP_SETTINGS_FILENAME = 'backup-settings.json';

export const DEFAULT_BACKUPS_TO_KEEP = 10;
export const MIN_BACKUPS_TO_KEEP = 1;
export const MAX_BACKUPS_TO_KEEP = 50;

/** Choices offered in Settings. Every value must sit within MIN..MAX. */
export const BACKUPS_TO_KEEP_OPTIONS = [1, 3, 5, 10, 20, 30, 50] as const;

/**
 * Why a backup was taken. The prefix is only a label — every kind shares one
 * retention budget, so the newest N backups survive whatever made them.
 */
export type BackupKind = 'pre-sync' | 'pre-pull' | 'pre-clear' | 'pre-restore' | 'manual';

const BACKUP_PREFIXES: Record<BackupKind, string> = {
  'pre-sync': 'pre-sync-',
  'pre-pull': 'pre-pull-',
  'pre-clear': 'pre-clear-',
  'pre-restore': 'pre-restore-',
  manual: 'puffin-backup-',
};

/** Same rule the restore/delete routes use to reject path traversal. */
const BACKUP_FILENAME_PATTERN = /^[a-zA-Z0-9_-]+\.db$/;

/**
 * `2026-09-17_10-30-00-123Z` (current) or `2026-09-17T10-30-00-123Z` (older dev
 * builds, which skipped the `T` → `_` swap).
 */
const TIMESTAMP_PATTERN = /(\d{4})-(\d{2})-(\d{2})[T_](\d{2})-(\d{2})-(\d{2})-(\d{3})Z/;

export interface BackupSettings {
  keep: number;
}

/** A directory entry as an adapter reports it, before any decision is made. */
export interface BackupFileEntry {
  filename: string;
  size: number;
  /** Last-modified time in ms, or null when the platform could not stat the file. */
  mtimeMs: number | null;
}

/** File operations each storage path provides. */
export interface BackupDirectoryIO {
  /** Every entry in the backups directory; an empty array when it does not exist. */
  list(): Promise<BackupFileEntry[]>;
  remove(filename: string): Promise<void>;
}

export function isBackupFilename(filename: string): boolean {
  return BACKUP_FILENAME_PATTERN.test(filename);
}

/** Filename-safe UTC timestamp, e.g. `2026-09-17_10-30-00-123Z`. */
export function formatBackupTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-').replace('T', '_');
}

export function buildBackupFilename(kind: BackupKind, date: Date = new Date()): string {
  return `${BACKUP_PREFIXES[kind]}${formatBackupTimestamp(date)}.db`;
}

/** The creation time encoded in a backup filename, or null when there is none. */
export function parseBackupTimestamp(filename: string): number | null {
  const match = TIMESTAMP_PATTERN.exec(filename);
  if (!match) return null;

  const [, year, month, day, hour, minute, second, ms] = match.map(Number);
  const time = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  return Number.isNaN(time) ? null : time;
}

/**
 * When a backup was made. The filename is preferred over file metadata: a
 * backup copied or restored between machines keeps its name but not its mtime.
 */
export function resolveBackupTime(entry: BackupFileEntry): number {
  return parseBackupTimestamp(entry.filename) ?? entry.mtimeMs ?? 0;
}

/** Any value → a whole number within MIN..MAX; anything unusable → the default. */
export function clampBackupsToKeep(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_BACKUPS_TO_KEEP;
  return Math.min(MAX_BACKUPS_TO_KEEP, Math.max(MIN_BACKUPS_TO_KEEP, Math.round(value)));
}

/**
 * Validate an update request body. Returns the requested count, or null when
 * the body is not `{ keep: <whole number within MIN..MAX> }`. Stricter than
 * clampBackupsToKeep on purpose: a file is repaired silently, a request is refused.
 */
export function parseBackupSettingsUpdate(body: unknown): number | null {
  const keep = body && typeof body === 'object' ? (body as { keep?: unknown }).keep : undefined;
  if (typeof keep !== 'number' || !Number.isInteger(keep)) return null;
  if (keep < MIN_BACKUPS_TO_KEEP || keep > MAX_BACKUPS_TO_KEEP) return null;
  return keep;
}

/**
 * Parse settings file contents. A missing or corrupt file yields the default
 * rather than an error — a bad settings file must never stop a backup being made.
 */
export function parseBackupSettings(contents: string | null): BackupSettings {
  if (!contents) return { keep: DEFAULT_BACKUPS_TO_KEEP };

  try {
    const parsed: unknown = JSON.parse(contents);
    const keep = parsed && typeof parsed === 'object' ? (parsed as { keep?: unknown }).keep : undefined;
    return { keep: clampBackupsToKeep(keep) };
  } catch {
    return { keep: DEFAULT_BACKUPS_TO_KEEP };
  }
}

export function serializeBackupSettings(settings: BackupSettings): string {
  return JSON.stringify({ keep: clampBackupsToKeep(settings.keep) }, null, 2) + '\n';
}

/** Backups only — non-backup files are dropped — newest first. */
function sortBackups(entries: BackupFileEntry[]): BackupFileEntry[] {
  return entries
    .filter(entry => isBackupFilename(entry.filename))
    .sort((a, b) => resolveBackupTime(b) - resolveBackupTime(a) || b.filename.localeCompare(a.filename));
}

/**
 * Which backups to delete so that `keep` remain.
 *
 * Files that are not backups are never selected. `protect` names a backup that
 * must survive regardless of its apparent age — the one just created, which a
 * clock set backwards could otherwise make look like the oldest.
 */
export function selectBackupsToPrune(
  entries: BackupFileEntry[],
  keep: number,
  protect?: string
): string[] {
  const limit = clampBackupsToKeep(keep);
  const sorted = sortBackups(entries);
  const protectedEntry = protect ? sorted.find(entry => entry.filename === protect) : undefined;

  const kept = new Set<string>();
  if (protectedEntry) kept.add(protectedEntry.filename);
  for (const entry of sorted) {
    if (kept.size >= limit) break;
    kept.add(entry.filename);
  }

  return sorted.filter(entry => !kept.has(entry.filename)).map(entry => entry.filename);
}

/** Directory entries → the listing the UI shows, newest first. */
export function toBackupListing(entries: BackupFileEntry[]): LocalBackup[] {
  return sortBackups(entries).map(entry => ({
    filename: entry.filename,
    size: entry.size,
    createdAt: new Date(resolveBackupTime(entry)).toISOString(),
  }));
}

export async function listBackups(io: BackupDirectoryIO): Promise<LocalBackup[]> {
  return toBackupListing(await io.list());
}

/**
 * Delete backups beyond the limit. Returns how many were deleted.
 *
 * Never throws: pruning always runs after the operation that needed the backup,
 * and a locked file or a listing failure must not turn a successful sync into a
 * reported error. Failures are logged and the next prune retries them.
 */
export async function pruneBackups(
  io: BackupDirectoryIO,
  keep: number,
  protect?: string
): Promise<number> {
  let doomed: string[];
  try {
    doomed = selectBackupsToPrune(await io.list(), keep, protect);
  } catch (err) {
    console.warn('Failed to list backups for pruning:', err);
    return 0;
  }

  let deleted = 0;
  for (const filename of doomed) {
    try {
      await io.remove(filename);
      deleted++;
    } catch (err) {
      console.warn(`Failed to delete old backup ${filename}:`, err);
    }
  }
  return deleted;
}
