// Shared utilities for data management operations
import { getDatabasePath } from '@/lib/db';
import path from 'path';

// Maximum backup file size (100MB)
export const MAX_BACKUP_SIZE = 100 * 1024 * 1024;

/**
 * Get the backups directory path relative to the database path
 */
export function getBackupsDir(): string {
  return path.join(path.dirname(getDatabasePath()), 'backups');
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
