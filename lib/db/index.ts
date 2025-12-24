// Database connection and utilities for Puffin
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { SCHEMA_SQL, SEED_SQL } from './schema';

// Database file path - stored in user data directory
// Support both PUFFIN_DATA_DIR (preferred) and PUFFIN_DB_DIR (legacy) for consistency
const DB_DIR = process.env.PUFFIN_DATA_DIR || process.env.PUFFIN_DB_DIR || path.join(process.cwd(), 'data');
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
 * Checks if tables actually exist before skipping (more robust than in-memory flag)
 */
export function initializeDatabase(): void {
  // Fast path: if we've already initialized in this process
  if (isInitialized) return;

  const database = getDatabase();

  // Check if tables actually exist (handles cold starts and process restarts)
  // Note: table is named "transaction" (singular) in the schema
  const tableExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='transaction'"
  ).get();

  if (!tableExists) {
    // Run schema creation
    database.exec(SCHEMA_SQL);

    // Seed default data
    database.exec(SEED_SQL);
  } else {
    // Run migrations for existing databases
    runMigrations(database);
  }

  isInitialized = true;
}

/** Current schema version - increment when adding new migrations */
const _CURRENT_SCHEMA_VERSION = 3;

/**
 * Get the current schema version from the database
 */
function getSchemaVersion(database: Database.Database): number {
  // Check if schema_version table exists
  const tableExists = database.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
  ).get();

  if (!tableExists) {
    // Create schema_version table
    database.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    // Insert initial version (0 = no migrations applied yet)
    database.exec(`INSERT INTO schema_version (id, version) VALUES (1, 0)`);
    return 0;
  }

  const result = database.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number } | undefined;
  return result?.version ?? 0;
}

/**
 * Update the schema version in the database
 */
function setSchemaVersion(database: Database.Database, version: number): void {
  database.prepare(`
    UPDATE schema_version SET version = ?, updated_at = datetime('now') WHERE id = 1
  `).run(version);
}

/**
 * Run database migrations for schema updates.
 * Uses a schema_version table to track which migrations have been applied.
 * Each migration is idempotent and only runs if the current version is less than required.
 */
function runMigrations(database: Database.Database): void {
  const currentVersion = getSchemaVersion(database);

  // Migration 1: Add source table and source_id column to transactions
  if (currentVersion < 1) {
    // Create source table
    database.exec(`
      CREATE TABLE IF NOT EXISTS source (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Add source_id column to transaction table if it doesn't exist
    const columnExists = database.prepare(
      "SELECT * FROM pragma_table_info('transaction') WHERE name='source_id'"
    ).get();

    if (!columnExists) {
      database.exec(`
        ALTER TABLE "transaction" ADD COLUMN source_id TEXT REFERENCES source(id)
      `);

      // Create index for source_id
      database.exec(`
        CREATE INDEX IF NOT EXISTS idx_transaction_source ON "transaction"(source_id)
      `);
    }

    setSchemaVersion(database, 1);
  }

  // Migration 2: Add Sinking Funds upper category
  // Note: SQLite CHECK constraints cannot be altered, so we must recreate the table
  // We need to disable foreign keys temporarily to allow dropping the table
  if (currentVersion < 2) {
    // Check if sinking category already exists (handles if migration was partially applied)
    const sinkingExists = database.prepare(
      "SELECT id FROM upper_category WHERE id = 'sinking'"
    ).get();

    if (!sinkingExists) {
      // Check if upper_category_new exists from a failed previous attempt
      const tempTableExists = database.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='upper_category_new'"
      ).get();

      // Disable foreign keys temporarily for table recreation
      database.pragma('foreign_keys = OFF');

      try {
        if (tempTableExists) {
          // Clean up from failed previous attempt
          database.exec(`DROP TABLE IF EXISTS upper_category_new`);
        }

        // Recreate upper_category table with updated CHECK constraint
        database.exec(`
          -- Create new table with updated CHECK constraint
          CREATE TABLE upper_category_new (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'saving', 'bill', 'debt', 'sinking', 'transfer')),
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          );

          -- Copy existing data
          INSERT INTO upper_category_new SELECT * FROM upper_category;

          -- Update Transfer's sort_order to make room for Sinking Funds
          UPDATE upper_category_new SET sort_order = 7 WHERE id = 'transfer';

          -- Drop old table
          DROP TABLE upper_category;

          -- Rename new table
          ALTER TABLE upper_category_new RENAME TO upper_category;
        `);

        // Insert Sinking Funds category
        const now = new Date().toISOString();
        database.prepare(`
          INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
          VALUES ('sinking', 'Sinking Funds', 'sinking', 6, ?, ?)
        `).run(now, now);
      } finally {
        // Re-enable foreign keys
        database.pragma('foreign_keys = ON');
      }
    }

    setSchemaVersion(database, 2);
  }

  // Migration 3: Add net_worth_entry table for Net Worth tracking
  if (currentVersion < 3) {
    // Create net_worth_entry table if it doesn't exist
    database.exec(`
      CREATE TABLE IF NOT EXISTS net_worth_entry (
        id TEXT PRIMARY KEY,
        recorded_at TEXT NOT NULL,
        assets_data TEXT NOT NULL,
        liabilities_data TEXT NOT NULL,
        total_assets REAL NOT NULL,
        total_liabilities REAL NOT NULL,
        net_worth REAL NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_net_worth_recorded_at ON net_worth_entry(recorded_at);
    `);

    setSchemaVersion(database, 3);
  }

  // Future migrations go here:
  // if (currentVersion < 4) { ... setSchemaVersion(database, 4); }
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
 * Reset the database connection and initialization state.
 * Call this after the database file has been replaced (e.g., after sync pull).
 * This forces the next getDatabase() call to open a fresh connection.
 */
export function resetDatabaseConnection(): void {
  if (db) {
    try {
      db.close();
    } catch {
      // Ignore close errors - file may have been replaced
    }
  }
  db = null;
  isInitialized = false;
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

