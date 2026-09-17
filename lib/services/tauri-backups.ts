/**
 * Local backup file I/O for the Tauri handlers.
 *
 * Mirrors lib/backup-retention-server.ts, which the dev API routes use. Both
 * supply only directory and file operations; retention decisions live in
 * lib/backup-retention.ts so the two paths cannot drift again.
 *
 * Reading sizes needs `fs:allow-stat` in src-tauri/capabilities/default.json —
 * `fs:default` grants read_dir and exists but not stat.
 */

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

async function getDataDir(): Promise<string> {
  const { appDataDir } = await import('@tauri-apps/api/path');
  return appDataDir();
}

export async function getBackupsDir(): Promise<string> {
  const { join } = await import('@tauri-apps/api/path');
  return join(await getDataDir(), 'backups');
}

const backupDirectory: BackupDirectoryIO = {
  async list(): Promise<BackupFileEntry[]> {
    const { exists, readDir, stat } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');
    const dir = await getBackupsDir();
    if (!(await exists(dir))) return [];

    const entries = (await readDir(dir)).filter(entry => entry.isFile);
    return Promise.all(entries.map(async entry => {
      try {
        const info = await stat(await join(dir, entry.name));
        return { filename: entry.name, size: info.size, mtimeMs: info.mtime ? info.mtime.getTime() : null };
      } catch {
        // Removed between listing and stat — keep the name, it has no metadata
        return { filename: entry.name, size: 0, mtimeMs: null };
      }
    }));
  },

  async remove(filename: string): Promise<void> {
    const { remove } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');
    await remove(await join(await getBackupsDir(), filename));
  },
};

async function getSettingsPath(): Promise<string> {
  const { join } = await import('@tauri-apps/api/path');
  return join(await getDataDir(), BACKUP_SETTINGS_FILENAME);
}

export async function readBackupSettings(): Promise<BackupSettings> {
  try {
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
    const settingsPath = await getSettingsPath();
    return parseBackupSettings((await exists(settingsPath)) ? await readTextFile(settingsPath) : null);
  } catch (err) {
    console.warn('Failed to read backup settings, keeping the maximum:', err);
    return UNREADABLE_SETTINGS;
  }
}

export async function writeBackupSettings(keep: number): Promise<BackupSettings> {
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  const settings = { keep: clampBackupsToKeep(keep) };
  await writeTextFile(await getSettingsPath(), serializeBackupSettings(settings));
  return settings;
}

/** Ensures the backups directory exists and returns where a new backup of `kind` goes. */
export async function prepareBackupPath(kind: BackupKind): Promise<{ filename: string; path: string }> {
  const { exists, mkdir } = await import('@tauri-apps/plugin-fs');
  const { join } = await import('@tauri-apps/api/path');
  const dir = await getBackupsDir();
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  const filename = buildBackupFilename(kind);
  return { filename, path: await join(dir, filename) };
}

export function listLocalBackups(): Promise<LocalBackup[]> {
  return listBackups(backupDirectory);
}

/**
 * Prune to the configured limit. Never throws — see pruneBackups.
 * Pass the backup just created as `protect`.
 */
export async function pruneLocalBackups(protect?: string, keep?: number): Promise<number> {
  return pruneBackups(backupDirectory, keep ?? (await readBackupSettings()).keep, protect);
}
