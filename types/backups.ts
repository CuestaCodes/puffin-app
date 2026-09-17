/**
 * Local backup types, shared by the dev API routes, the Tauri handlers and the
 * Settings UI.
 */

export interface LocalBackup {
  filename: string;
  size: number;
  createdAt: string;
}

export interface BackupListResponse {
  backups: LocalBackup[];
  message?: string;
}

/** GET /api/data/backup-settings */
export interface BackupSettingsResponse {
  keep: number;
}

/** PATCH /api/data/backup-settings — `pruned` is how many backups the new limit deleted. */
export interface BackupSettingsUpdateResponse {
  keep: number;
  pruned: number;
}
