// Database connection and utilities for Puffin
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { SCHEMA_SQL, SEED_SQL } from './schema';

// Database file path - stored in user data directory
const DB_DIR = process.env.PUFFIN_DB_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'puffin.db');
const BACKUP_DIR = path.join(DB_DIR, 'backups');

let db: Database.Database | null = null;
let isInitialized = false;

/**
 * Get or create the database connection
 */
export function getDatabase(): Database.Database {
  if (db) return db;
  
  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  
  // Create and configure database
  db = new Database(DB_PATH);
  
  // Enable foreign keys and WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  
  return db;
}

/**
 * Initialize the database schema and seed data
 * Uses singleton pattern to avoid redundant initialization calls
 */
export function initializeDatabase(): void {
  if (isInitialized) return;
  
  const database = getDatabase();
  
  // Run schema creation
  database.exec(SCHEMA_SQL);
  
  // Seed default data
  database.exec(SEED_SQL);
  
  isInitialized = true;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Create a backup of the database
 * @returns The backup file path
 */
export function createBackup(): string {
  const database = getDatabase();
  
  // Ensure backup directory exists
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `puffin-backup-${timestamp}.db`);
  
  // Use SQLite's backup API
  database.backup(backupPath);
  
  return backupPath;
}

/**
 * Restore database from a backup file
 * @param backupPath Path to the backup file
 */
export function restoreFromBackup(backupPath: string): void {
  if (!fs.existsSync(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }
  
  // Close current connection
  closeDatabase();
  
  // Copy backup to main database path
  fs.copyFileSync(backupPath, DB_PATH);
  
  // Reinitialize connection
  getDatabase();
}

/**
 * List available backups
 * @returns Array of backup file info
 */
export function listBackups(): { path: string; name: string; size: number; created: Date }[] {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }
  
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map(name => {
      const filePath = path.join(BACKUP_DIR, name);
      const stats = fs.statSync(filePath);
      return {
        path: filePath,
        name,
        size: stats.size,
        created: stats.birthtime,
      };
    })
    .sort((a, b) => b.created.getTime() - a.created.getTime());
  
  return files;
}

/**
 * Get database file path
 */
export function getDatabasePath(): string {
  return DB_PATH;
}

/**
 * Get database file size in bytes
 */
export function getDatabaseSize(): number {
  if (!fs.existsSync(DB_PATH)) {
    return 0;
  }
  return fs.statSync(DB_PATH).size;
}

/**
 * Check if database exists and is initialized
 */
export function isDatabaseInitialized(): boolean {
  if (!fs.existsSync(DB_PATH)) {
    return false;
  }
  
  try {
    const database = getDatabase();
    const result = database.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='local_user'"
    ).get();
    return !!result;
  } catch {
    return false;
  }
}

/**
 * Check if a user has been set up (password created)
 */
export function isUserSetup(): boolean {
  try {
    const database = getDatabase();
    const result = database.prepare('SELECT COUNT(*) as count FROM local_user').get() as { count: number };
    return result.count > 0;
  } catch {
    return false;
  }
}

// Export database instance getter for direct queries
export { Database };

