/**
 * Client-side Database Service for Tauri
 *
 * This module provides direct database access in Tauri static export mode.
 * It uses @tauri-apps/plugin-sql which is only available in Tauri context.
 *
 * IMPORTANT: This module should only be imported in Tauri context.
 * Use dynamic imports to avoid bundling issues in non-Tauri builds.
 */

import { SCHEMA_SQL, SEED_SQL } from '@/lib/db/schema';

// Type definitions for Tauri SQL plugin
interface TauriDatabase {
  select<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
  close(): Promise<void>;
}

let db: TauriDatabase | null = null;
let dbPromise: Promise<TauriDatabase> | null = null;
let isInitialized = false;

// Current schema version - increment when adding new migrations
const CURRENT_SCHEMA_VERSION = 3;

/**
 * Get the database path based on environment.
 * Uses Tauri's app data directory (%APPDATA%/Puffin/ on Windows).
 */
async function getDatabasePath(): Promise<string> {
  // Dynamic import to avoid bundling issues
  const { appDataDir } = await import('@tauri-apps/api/path');
  const dataDir = await appDataDir();
  return `${dataDir}puffin.db`;
}

/**
 * Get or create the database connection.
 * Uses singleton pattern with lazy initialization.
 * Automatically initializes schema if needed.
 */
export async function getDatabase(): Promise<TauriDatabase> {
  if (db) return db;

  // Prevent multiple concurrent initializations
  if (dbPromise) return dbPromise;

  dbPromise = (async () => {
    const { default: Database } = await import('@tauri-apps/plugin-sql');
    const dbPath = await getDatabasePath();

    // Load SQLite database (creates file if it doesn't exist)
    db = await Database.load(`sqlite:${dbPath}`) as TauriDatabase;

    // Configure database
    await db.execute('PRAGMA journal_mode = WAL');
    await db.execute('PRAGMA foreign_keys = ON');

    // Initialize schema if needed
    await initializeSchema(db);

    return db;
  })();

  return dbPromise;
}

/**
 * Initialize the database schema and seed data.
 * Runs migrations for existing databases.
 */
async function initializeSchema(database: TauriDatabase): Promise<void> {
  if (isInitialized) return;

  // Check if tables exist
  const tables = await database.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='transaction'"
  );

  if (tables.length === 0) {
    // Fresh database - run schema creation
    await execMultiple(database, SCHEMA_SQL);
    await execMultiple(database, SEED_SQL);
  } else {
    // Existing database - run migrations
    await runMigrations(database);
  }

  isInitialized = true;
}

/**
 * Execute multiple SQL statements separated by semicolons.
 */
async function execMultiple(database: TauriDatabase, sql: string): Promise<void> {
  const statements = sql.split(';').filter(s => s.trim());
  for (const stmt of statements) {
    if (stmt.trim()) {
      await database.execute(stmt);
    }
  }
}

/**
 * Get the current schema version from the database.
 */
async function getSchemaVersion(database: TauriDatabase): Promise<number> {
  // Check if schema_version table exists
  const tables = await database.select<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'"
  );

  if (tables.length === 0) {
    // Create schema_version table
    await database.execute(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    await database.execute(`INSERT INTO schema_version (id, version) VALUES (1, 0)`);
    return 0;
  }

  const result = await database.select<{ version: number }>('SELECT version FROM schema_version WHERE id = 1');
  return result[0]?.version ?? 0;
}

/**
 * Update the schema version in the database.
 */
async function setSchemaVersion(database: TauriDatabase, version: number): Promise<void> {
  await database.execute(
    `UPDATE schema_version SET version = ?, updated_at = datetime('now') WHERE id = 1`,
    [version]
  );
}

/**
 * Run database migrations for schema updates.
 * Mirrors the migrations in lib/db/index.ts.
 */
async function runMigrations(database: TauriDatabase): Promise<void> {
  const currentVersion = await getSchemaVersion(database);

  // Migration 1: Add source table and source_id column to transactions
  if (currentVersion < 1) {
    await database.execute(`
      CREATE TABLE IF NOT EXISTS source (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const columns = await database.select<{ name: string }>(
      "SELECT name FROM pragma_table_info('transaction') WHERE name='source_id'"
    );

    if (columns.length === 0) {
      await database.execute(`
        ALTER TABLE "transaction" ADD COLUMN source_id TEXT REFERENCES source(id)
      `);
      await database.execute(`
        CREATE INDEX IF NOT EXISTS idx_transaction_source ON "transaction"(source_id)
      `);
    }

    await setSchemaVersion(database, 1);
  }

  // Migration 2: Add Sinking Funds upper category
  if (currentVersion < 2) {
    const sinkingExists = await database.select<{ id: string }>(
      "SELECT id FROM upper_category WHERE id = 'sinking'"
    );

    if (sinkingExists.length === 0) {
      // Check for temp table from failed previous attempt
      const tempTable = await database.select<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='upper_category_new'"
      );

      await database.execute('PRAGMA foreign_keys = OFF');

      try {
        if (tempTable.length > 0) {
          await database.execute(`DROP TABLE IF EXISTS upper_category_new`);
        }

        await database.execute(`
          CREATE TABLE upper_category_new (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'saving', 'bill', 'debt', 'sinking', 'transfer')),
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
          )
        `);

        await database.execute(`INSERT INTO upper_category_new SELECT * FROM upper_category`);
        await database.execute(`UPDATE upper_category_new SET sort_order = 7 WHERE id = 'transfer'`);
        await database.execute(`DROP TABLE upper_category`);
        await database.execute(`ALTER TABLE upper_category_new RENAME TO upper_category`);

        const now = new Date().toISOString();
        await database.execute(
          `INSERT INTO upper_category (id, name, type, sort_order, created_at, updated_at)
           VALUES ('sinking', 'Sinking Funds', 'sinking', 6, ?, ?)`,
          [now, now]
        );
      } finally {
        await database.execute('PRAGMA foreign_keys = ON');
      }
    }

    await setSchemaVersion(database, 2);
  }

  // Migration 3: Add net_worth_entry table
  if (currentVersion < 3) {
    await database.execute(`
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
      )
    `);
    await database.execute(`
      CREATE INDEX IF NOT EXISTS idx_net_worth_recorded_at ON net_worth_entry(recorded_at)
    `);

    await setSchemaVersion(database, 3);
  }

  // Verify migrations completed successfully
  const finalVersion = await getSchemaVersion(database);
  if (finalVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Database migration incomplete: expected version ${CURRENT_SCHEMA_VERSION}, got ${finalVersion}`
    );
  }
}

/**
 * Execute a SELECT query and return results.
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const database = await getDatabase();
  return database.select<T>(sql, params);
}

/**
 * Execute a SELECT query and return the first result.
 */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const results = await query<T>(sql, params);
  return results[0] ?? null;
}

/**
 * Execute an INSERT/UPDATE/DELETE statement.
 */
export async function execute(
  sql: string,
  params: unknown[] = []
): Promise<{ changes: number; lastInsertRowId: number }> {
  const database = await getDatabase();
  const result = await database.execute(sql, params);
  return {
    changes: result.rowsAffected,
    lastInsertRowId: result.lastInsertId,
  };
}

/**
 * Execute raw SQL (for schema operations).
 * WARNING: Does not handle semicolons in string literals.
 */
export async function exec(sql: string): Promise<void> {
  const database = await getDatabase();
  const statements = sql.split(';').filter(s => s.trim());
  for (const stmt of statements) {
    if (stmt.trim()) {
      await database.execute(stmt);
    }
  }
}

/**
 * Check if a table exists.
 */
export async function tableExists(tableName: string): Promise<boolean> {
  const result = await queryOne<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
    [tableName]
  );
  return result !== null;
}

/**
 * Close the database connection.
 */
export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    dbPromise = null;
  }
}

/**
 * Create a backup of the database using VACUUM INTO.
 */
export async function backup(targetPath: string): Promise<void> {
  const database = await getDatabase();
  // Escape single quotes to prevent SQL injection
  const safePath = targetPath.replace(/'/g, "''");
  await database.execute(`VACUUM INTO '${safePath}'`);
}

/**
 * Reset the database connection and initialization state.
 * Call this after the database file has been replaced (e.g., after sync pull).
 */
export async function resetDatabaseConnection(): Promise<void> {
  if (db) {
    try {
      await db.close();
    } catch {
      // Ignore close errors - file may have been replaced
    }
  }
  db = null;
  dbPromise = null;
  isInitialized = false;
}

/**
 * Get the database file path.
 * Useful for backup/restore operations.
 */
export { getDatabasePath };

/**
 * Check if the database has been initialized with schema.
 */
export function isDatabaseInitialized(): boolean {
  return isInitialized;
}
