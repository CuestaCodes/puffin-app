/**
 * Local backup file I/O for the browser-dev API routes.
 *
 * Node-only — imported by app/api/**, never by client code. The Tauri handlers
 * use lib/services/tauri-backups.ts instead. Both supply only directory and file
 * operations; retention decisions live in lib/backup-retention.ts.
 */

import fs from 'fs';
import path from 'path';
import { getDatabasePath } from '@/lib/db';
import { getBackupsDir } from '@/lib/data/utils';
import {
  BACKUP_SETTINGS_FILENAME,
  UNREADABLE_SETTINGS,
  buildBackupFilename,
  clampBackupsToKeep,
  listBackups,
  parseBackupSettings,
  pruneBackups,
  serializeBackupSettings,
  type BackupDirectoryIO,
  type BackupFileEntry,
  type BackupKind,
  type BackupSettings,
} from '@/lib/backup-retention';
import type { LocalBackup } from '@/types/backups';

function getDataDir(): string {
  return path.dirname(getDatabasePath());
}

const backupDirectory: BackupDirectoryIO = {
  async list(): Promise<BackupFileEntry[]> {
    const dir = getBackupsDir();
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => {
        try {
          const stats = fs.statSync(path.join(dir, entry.name));
          return { filename: entry.name, size: stats.size, mtimeMs: stats.mtimeMs };
        } catch {
          // Removed between listing and stat — keep the name, it has no metadata
          return { filename: entry.name, size: 0, mtimeMs: null };
        }
      });
  },

  async remove(filename: string): Promise<void> {
    fs.unlinkSync(path.join(getBackupsDir(), filename));
  },
};

export function readBackupSettings(): BackupSettings {
  const settingsPath = path.join(getDataDir(), BACKUP_SETTINGS_FILENAME);
  try {
    return parseBackupSettings(fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, 'utf-8') : null);
  } catch (err) {
    console.warn('Failed to read backup settings, keeping the maximum:', err);
    return UNREADABLE_SETTINGS;
  }
}

export function writeBackupSettings(keep: number): BackupSettings {
  const settings = { keep: clampBackupsToKeep(keep) };
  fs.writeFileSync(path.join(getDataDir(), BACKUP_SETTINGS_FILENAME), serializeBackupSettings(settings));
  return settings;
}

/** Ensures the backups directory exists and returns where a new backup of `kind` goes. */
export function prepareBackupPath(kind: BackupKind): { filename: string; path: string } {
  const dir = getBackupsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const filename = buildBackupFilename(kind);
  return { filename, path: path.join(dir, filename) };
}

export function listLocalBackups(): Promise<LocalBackup[]> {
  return listBackups(backupDirectory);
}

/**
 * Prune to the configured limit. Never throws — see pruneBackups.
 * Pass the backup just created as `protect`.
 */
export function pruneLocalBackups(protect?: string, keep: number = readBackupSettings().keep): Promise<number> {
  return pruneBackups(backupDirectory, keep, protect);
}
