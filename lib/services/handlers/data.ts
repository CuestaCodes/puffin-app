/**
 * Tauri Handler: Data Management
 *
 * Handles data operations (stats, backups, export, import, clear, reset)
 * in Tauri mode using native SQLite and file system APIs.
 */

import { getDatabase, getDatabasePath, backup as vacuumBackup } from '../tauri-db';
import {
  MAX_BACKUPS_TO_KEEP,
  MIN_BACKUPS_TO_KEEP,
  parseBackupSettingsUpdate,
} from '@/lib/backup-retention';
import {
  listLocalBackups,
  prepareBackupPath,
  pruneLocalBackups,
  readBackupSettings,
  writeBackupSettings,
} from '../tauri-backups';
import type {
  BackupListResponse,
  BackupSettingsResponse,
  BackupSettingsUpdateResponse,
} from '@/types/backups';

interface HandlerContext {
  method: string;
  body?: unknown;
  params: Record<string, string>;
  path: string;
}

/**
 * Database stats handler - /api/data/stats
 */
export async function handleStats(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'GET') {
    throw new Error(`Method ${method} not allowed`);
  }

  const db = await getDatabase();

  // Get transaction count
  const transactionResult = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM "transaction" WHERE is_deleted = 0'
  );
  const transactionCount = transactionResult[0]?.count ?? 0;

  // Get category count
  const categoryResult = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM sub_category WHERE is_deleted = 0'
  );
  const categoryCount = categoryResult[0]?.count ?? 0;

  // Get rule count
  const ruleResult = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM auto_category_rule WHERE is_active = 1'
  );
  const ruleCount = ruleResult[0]?.count ?? 0;

  // Get source count
  const sourceResult = await db.select<{ count: number }>(
    'SELECT COUNT(*) as count FROM source'
  );
  const sourceCount = sourceResult[0]?.count ?? 0;

  // Get date range
  const dateRangeResult = await db.select<{ earliest: string | null; latest: string | null }>(
    `SELECT
      MIN(date) as earliest,
      MAX(date) as latest
    FROM "transaction"
    WHERE is_deleted = 0`
  );
  const dateRange = dateRangeResult[0] ?? { earliest: null, latest: null };

  // Get file size (approximation based on page count)
  const pageSizeResult = await db.select<{ page_size: number }>('PRAGMA page_size');
  const pageCountResult = await db.select<{ page_count: number }>('PRAGMA page_count');
  const pageSize = pageSizeResult[0]?.page_size ?? 4096;
  const pageCount = pageCountResult[0]?.page_count ?? 0;
  const fileSize = pageSize * pageCount;

  return {
    fileSize,
    transactionCount,
    categoryCount,
    ruleCount,
    sourceCount,
    earliestTransaction: dateRange.earliest,
    latestTransaction: dateRange.latest,
  };
}

/**
 * Clear transactions handler - /api/data/clear
 */
export async function handleClear(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  const db = await getDatabase();

  // Create a backup before clearing (using VACUUM INTO)
  try {
    const backup = await prepareBackupPath('pre-clear');
    await vacuumBackup(backup.path);
    await pruneLocalBackups(backup.filename);
  } catch (err) {
    console.warn('Failed to create pre-clear backup:', err);
    // Continue with clear even if backup fails
  }

  // Delete all transactions (hard delete since we're clearing everything)
  await db.execute('DELETE FROM "transaction"');

  // Reset auto-increment (only if table exists)
  try {
    await db.execute('DELETE FROM sqlite_sequence WHERE name = "transaction"');
  } catch {
    // sqlite_sequence doesn't exist if AUTOINCREMENT isn't used
  }

  return { success: true };
}

/**
 * Full reset handler - /api/data/reset
 * Matches API behavior: deletes database file, all backups, and clears sync config
 */
export async function handleReset(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  try {
    const { remove, exists, readDir } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');
    const { resetDatabaseConnection } = await import('../tauri-db');

    const dataDir = await appDataDir();
    const dbPath = await join(dataDir, 'puffin.db');
    const backupsDir = await join(dataDir, 'backups');

    // Close database connection and reset initialization flag
    await resetDatabaseConnection();

    // Delete the database file
    if (await exists(dbPath)) {
      await remove(dbPath);
    }

    // Delete WAL files
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (await exists(walPath)) {
      try { await remove(walPath); } catch { /* ignore */ }
    }
    if (await exists(shmPath)) {
      try { await remove(shmPath); } catch { /* ignore */ }
    }

    // Delete all local backups (full reset means starting completely fresh)
    if (await exists(backupsDir)) {
      try {
        const entries = await readDir(backupsDir);
        for (const entry of entries) {
          if (entry.name?.endsWith('.db')) {
            try {
              await remove(await join(backupsDir, entry.name));
            } catch (err) {
              console.warn(`Failed to delete backup ${entry.name}:`, err);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to clear backups directory:', err);
      }
    }

    // Clear sync-related localStorage
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('puffin_sync_config');
      localStorage.removeItem('puffin_sync_credentials');
      localStorage.removeItem('puffin_oauth_tokens');
      localStorage.removeItem('puffin_oauth_authenticated');
      localStorage.removeItem('puffin_oauth_extended_scope');
      localStorage.removeItem('puffin_session');
    }

    return {
      success: true,
      message: 'App reset successfully. Please refresh and set up your PIN again.',
    };
  } catch (error) {
    console.error('Reset error:', error);
    throw new Error('Failed to reset app');
  }
}

/**
 * List backups handler - /api/data/backups (GET)
 * Note: In Tauri mode, we can only list backups if fs plugin is available
 */
export async function handleBackups(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method === 'GET') {
    // Newest first, dated from the filename timestamp — see lib/backup-retention.ts
    try {
      const response: BackupListResponse = { backups: await listLocalBackups() };
      return response;
    } catch (err) {
      console.error('Failed to list backups:', err);
      throw new Error('Failed to list backups');
    }
  }

  if (method === 'POST') {
    // Create a new backup
    try {
      const backup = await prepareBackupPath('manual');

      // Use VACUUM INTO to create backup
      await vacuumBackup(backup.path);

      const { stat } = await import('@tauri-apps/plugin-fs');
      const { size } = await stat(backup.path);

      // Enforce the shared retention limit
      await pruneLocalBackups(backup.filename);

      return {
        success: true,
        backup: {
          filename: backup.filename,
          size,
          createdAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      console.error('Failed to create backup:', err);
      throw new Error('Failed to create backup');
    }
  }

  throw new Error(`Method ${method} not allowed`);
}

/**
 * Backup retention setting - /api/data/backup-settings
 * GET = read, PATCH = change and prune immediately. Mirrors app/api/data/backup-settings/route.ts.
 */
export async function handleBackupSettings(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  if (method === 'GET') {
    const response: BackupSettingsResponse = { keep: (await readBackupSettings()).keep };
    return response;
  }

  if (method === 'PATCH') {
    const keep = parseBackupSettingsUpdate(body);
    if (keep === null) {
      throw new Error(`keep must be a whole number from ${MIN_BACKUPS_TO_KEEP} to ${MAX_BACKUPS_TO_KEEP}`);
    }

    const settings = await writeBackupSettings(keep);
    const pruned = await pruneLocalBackups(undefined, settings.keep);

    const response: BackupSettingsUpdateResponse = { keep: settings.keep, pruned };
    return response;
  }

  throw new Error(`Method ${method} not allowed`);
}

/**
 * Single backup handler - /api/data/backups/[filename]
 * POST = restore, DELETE = delete
 */
export async function handleBackup(ctx: HandlerContext): Promise<unknown> {
  const { method, params } = ctx;
  const filename = params.filename || params.id;

  if (!filename) {
    throw new Error('Backup filename required');
  }

  if (method === 'POST') {
    // Restore from local backup
    try {
      const { copyFile, exists, remove } = await import('@tauri-apps/plugin-fs');
      const { appDataDir, join } = await import('@tauri-apps/api/path');
      const { resetDatabaseConnection, closeDatabase } = await import('../tauri-db');

      const dataDir = await appDataDir();
      const backupPath = await join(dataDir, 'backups', filename);
      const dbPath = await join(dataDir, 'puffin.db');

      // Verify backup exists
      if (!(await exists(backupPath))) {
        throw new Error(`Backup file not found: ${filename}`);
      }

      // Create a pre-restore backup of current database
      let preRestoreFilename: string | undefined;

      try {
        if (await exists(dbPath)) {
          const preRestoreBackup = await prepareBackupPath('pre-restore');
          await copyFile(dbPath, preRestoreBackup.path);
          preRestoreFilename = preRestoreBackup.filename;
          console.log('[Restore] Created pre-restore backup:', preRestoreBackup.path);
        }
      } catch (err) {
        console.warn('[Restore] Failed to create pre-restore backup:', err);
      }

      // Close database connection
      console.log('[Restore] Closing database connection...');
      await closeDatabase();
      await resetDatabaseConnection();

      // Remove WAL files
      try {
        const walPath = dbPath + '-wal';
        const shmPath = dbPath + '-shm';
        if (await exists(walPath)) await remove(walPath);
        if (await exists(shmPath)) await remove(shmPath);
      } catch (walErr) {
        console.warn('[Restore] WAL cleanup error:', walErr);
      }

      // Remove current database
      if (await exists(dbPath)) {
        await remove(dbPath);
      }

      // Copy backup to database location
      console.log('[Restore] Copying backup file...');
      await copyFile(backupPath, dbPath);

      // Verify copy worked
      if (!(await exists(dbPath))) {
        throw new Error('Database file was not created after copy');
      }

      console.log('[Restore] SUCCESS - Restore complete');

      // Prune only after the copy, so the backup being restored from is still there to copy
      await pruneLocalBackups(preRestoreFilename);

      // Force page reload
      if (typeof window !== 'undefined') {
        setTimeout(() => window.location.reload(), 500);
      }

      return { success: true, restoredFrom: filename };
    } catch (err) {
      console.error('[Restore] Restore failed:', err);
      throw new Error(`Failed to restore backup: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  if (method === 'DELETE') {
    // Delete backup
    try {
      const { remove } = await import('@tauri-apps/plugin-fs');
      const { appDataDir, join } = await import('@tauri-apps/api/path');

      const dataDir = await appDataDir();
      const backupPath = await join(dataDir, 'backups', filename);

      await remove(backupPath);
      return { success: true };
    } catch (err) {
      console.error('Failed to delete backup:', err);
      throw new Error('Failed to delete backup. File system access not available.');
    }
  }

  throw new Error(`Method ${method} not allowed`);
}

/**
 * Export transactions as CSV - /api/data/export/transactions
 */
export async function handleExportTransactions(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'GET') {
    throw new Error(`Method ${method} not allowed`);
  }

  const db = await getDatabase();

  // Get all transactions with category and source info
  const transactions = await db.select<{
    id: number;
    date: string;
    description: string;
    amount: number;
    category_name: string | null;
    upper_category_name: string | null;
    source_name: string | null;
    notes: string | null;
  }>(`
    SELECT
      t.id,
      t.date,
      t.description,
      t.amount,
      sc.name as category_name,
      uc.name as upper_category_name,
      s.name as source_name,
      t.notes
    FROM "transaction" t
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
    LEFT JOIN source s ON t.source_id = s.id
    WHERE t.is_deleted = 0 AND t.is_split = 0
    ORDER BY t.date DESC, t.id DESC
  `);

  // Build CSV
  const headers = ['Date', 'Description', 'Amount', 'Category', 'Type', 'Source', 'Notes'];
  const rows = transactions.map(t => [
    t.date,
    `"${(t.description || '').replace(/"/g, '""')}"`,
    t.amount.toFixed(2),
    `"${(t.category_name || 'Uncategorized').replace(/"/g, '""')}"`,
    `"${(t.upper_category_name || '').replace(/"/g, '""')}"`,
    `"${(t.source_name || '').replace(/"/g, '""')}"`,
    `"${(t.notes || '').replace(/"/g, '""')}"`,
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  const defaultName = `puffin-transactions-${new Date().toISOString().split('T')[0]}.csv`;

  // Open a save dialog rather than returning a blob for the browser to download.
  // A blob download does work in the webview, but WebView2 drops the file into
  // Downloads with no prompt and no path, so the export reads as having done
  // nothing at all. Matches handleExportBackup and handleActionLogExport.
  // Only plugin *availability* falls back to a blob download. A real write
  // failure must surface, not silently redirect the file to Downloads while the
  // UI reports the path the user chose.
  let save: typeof import('@tauri-apps/plugin-dialog').save;
  let writeTextFile: typeof import('@tauri-apps/plugin-fs').writeTextFile;
  try {
    ({ save } = await import('@tauri-apps/plugin-dialog'));
    ({ writeTextFile } = await import('@tauri-apps/plugin-fs'));
  } catch {
    return { csv, filename: defaultName, mimeType: 'text/csv' };
  }

  const savePath = await save({
    defaultPath: defaultName,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });

  if (!savePath) {
    return { success: false, cancelled: true };
  }

  await writeTextFile(savePath, csv);

  return { success: true, path: savePath, count: transactions.length };
}

/**
 * Export database backup - /api/data/export/backup
 */
export async function handleExportBackup(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'GET') {
    throw new Error(`Method ${method} not allowed`);
  }

  // In Tauri mode, we need to use the save dialog to let user choose location
  try {
    const { save } = await import('@tauri-apps/plugin-dialog');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
    const defaultName = `puffin-backup-${timestamp}.db`;

    // Open save dialog
    const savePath = await save({
      defaultPath: defaultName,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });

    if (savePath) {
      await vacuumBackup(savePath);
      return { success: true, path: savePath };
    }

    return { success: false, cancelled: true };
  } catch {
    // Dialog plugin not available, provide alternative instructions
    throw new Error(
      'Export not available in desktop mode. ' +
      'Your database is located at: %APPDATA%/Puffin/puffin.db'
    );
  }
}

/**
 * Import backup - /api/data/import/backup
 */
export async function handleImportBackup(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const { copyFile, exists, remove } = await import('@tauri-apps/plugin-fs');
    const { resetDatabaseConnection, closeDatabase } = await import('../tauri-db');

    console.log('[Import] Opening file picker...');

    // Open file picker to select backup
    const selectedPath = await open({
      title: 'Select Backup to Restore',
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      multiple: false,
    });

    console.log('[Import] Selected path:', selectedPath);

    if (!selectedPath || typeof selectedPath !== 'string') {
      console.log('[Import] No file selected, cancelled');
      return { success: false, cancelled: true };
    }

    // Verify source file exists and is readable
    const sourceExists = await exists(selectedPath);
    console.log('[Import] Source file exists:', sourceExists);
    if (!sourceExists) {
      throw new Error(`Source backup file does not exist: ${selectedPath}`);
    }

    // Get current database path
    const dbPath = await getDatabasePath();
    console.log('[Import] Target database path:', dbPath);

    // Create a backup of current database before replacing. It goes in backups/
    // like every other backup — it used to sit beside puffin.db, where it was
    // neither listed nor pruned.
    let preRestoreFilename: string | undefined;

    try {
      // Check if current db exists before backing up
      const dbExists = await exists(dbPath);
      console.log('[Import] Current DB exists:', dbExists);
      if (dbExists) {
        const preRestoreBackup = await prepareBackupPath('pre-restore');
        await copyFile(dbPath, preRestoreBackup.path);
        preRestoreFilename = preRestoreBackup.filename;
        console.log('[Import] Created pre-restore backup:', preRestoreBackup.path);
      }
    } catch (err) {
      console.warn('[Import] Failed to create pre-restore backup:', err);
      // Continue with restore anyway
    }

    // Close current database connection properly
    console.log('[Import] Closing database connection...');
    await closeDatabase();
    await resetDatabaseConnection();
    console.log('[Import] Database connection closed and reset');

    // Remove WAL files if they exist
    try {
      const walPath = dbPath + '-wal';
      const shmPath = dbPath + '-shm';
      if (await exists(walPath)) {
        await remove(walPath);
        console.log('[Import] Removed WAL file');
      }
      if (await exists(shmPath)) {
        await remove(shmPath);
        console.log('[Import] Removed SHM file');
      }
    } catch (walErr) {
      console.warn('[Import] WAL cleanup error:', walErr);
    }

    // Remove current database file before copying
    try {
      if (await exists(dbPath)) {
        await remove(dbPath);
        console.log('[Import] Removed current database');
      }
    } catch (removeErr) {
      console.error('[Import] Failed to remove current database:', removeErr);
      throw new Error(`Failed to remove current database: ${removeErr}`);
    }

    // Copy backup to database location
    console.log('[Import] Copying backup file...');
    await copyFile(selectedPath, dbPath);
    console.log('[Import] Copy complete');

    // Verify the copy worked
    const newDbExists = await exists(dbPath);
    console.log('[Import] New database exists:', newDbExists);
    if (!newDbExists) {
      throw new Error('Database file was not created after copy');
    }

    console.log('[Import] SUCCESS - Restore complete');

    await pruneLocalBackups(preRestoreFilename);

    // Force page reload to pick up new database
    if (typeof window !== 'undefined') {
      console.log('[Import] Reloading page...');
      setTimeout(() => window.location.reload(), 500);
    }

    return { success: true, restoredFrom: selectedPath };
  } catch (err) {
    console.error('[Import] Import backup failed:', err);
    throw new Error(
      `Failed to import backup: ${err instanceof Error ? err.message : 'Unknown error'}`
    );
  }
}
