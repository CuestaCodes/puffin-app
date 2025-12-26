/**
 * Database Abstraction Layer for Puffin
 * 
 * Provides a unified interface for database operations that works with both:
 * - better-sqlite3 (development mode - synchronous)
 * - tauri-plugin-sql (packaged app mode - asynchronous)
 * 
 * The interface is async-first to support both implementations.
 */

// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Result of a database query (SELECT)
 */
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

/**
 * Result of a database mutation (INSERT/UPDATE/DELETE)
 */
export interface MutationResult {
  changes: number;
  lastInsertRowId?: number | bigint;
}

/**
 * Database connection configuration
 */
export interface DatabaseConfig {
  path: string;
  enableWAL?: boolean;
  enableForeignKeys?: boolean;
}

/**
 * Transaction callback type
 */
export type TransactionCallback<T> = (executor: DatabaseExecutor) => T | Promise<T>;

/**
 * Database executor interface - the core abstraction
 */
export interface DatabaseExecutor {
  /**
   * Execute a query and return all matching rows
   */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  
  /**
   * Execute a query and return the first matching row
   */
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
  
  /**
   * Execute a mutation (INSERT/UPDATE/DELETE)
   */
  execute(sql: string, params?: unknown[]): Promise<MutationResult>;
  
  /**
   * Execute raw SQL (for schema operations)
   */
  exec(sql: string): Promise<void>;
}

/**
 * Full database interface with connection management
 */
export interface DatabaseAdapter extends DatabaseExecutor {
  /**
   * Initialize the database (create tables if needed)
   */
  initialize(schemaSQL: string, seedSQL?: string): Promise<void>;
  
  /**
   * Check if a table exists
   */
  tableExists(tableName: string): Promise<boolean>;
  
  /**
   * Run operations in a transaction
   */
  transaction<T>(callback: TransactionCallback<T>): Promise<T>;
  
  /**
   * Close the database connection
   */
  close(): Promise<void>;
  
  /**
   * Create a backup of the database
   */
  backup(targetPath: string): Promise<void>;
  
  /**
   * Get the database file path
   */
  getPath(): string;
}

// ============================================================================
// Runtime Detection
// ============================================================================

/**
 * Check if we're running in a Tauri context (packaged app)
 */
export function isTauriContext(): boolean {
  if (typeof window === 'undefined') {
    // Server-side or Node.js context - use better-sqlite3
    return false;
  }
  
  // Check for Tauri globals
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).__TAURI__;
}

/**
 * Get the runtime environment name
 */
export function getRuntimeEnvironment(): 'tauri' | 'node' | 'browser' {
  if (typeof window === 'undefined') {
    return 'node';
  }
  return isTauriContext() ? 'tauri' : 'browser';
}

// ============================================================================
// Better-SQLite3 Implementation (Development Mode)
// ============================================================================

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

/**
 * Better-SQLite3 adapter for development mode
 */
export class BetterSqlite3Adapter implements DatabaseAdapter {
  private db: Database.Database | null = null;
  private dbPath: string;
  private config: DatabaseConfig;
  
  constructor(config: DatabaseConfig) {
    this.config = config;
    this.dbPath = config.path;
  }
  
  private getDb(): Database.Database {
    if (!this.db) {
      // Ensure directory exists
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      this.db = new Database(this.dbPath);
      
      // Configure database
      if (this.config.enableWAL !== false) {
        this.db.pragma('journal_mode = WAL');
      }
      if (this.config.enableForeignKeys !== false) {
        this.db.pragma('foreign_keys = ON');
      }
    }
    return this.db;
  }
  
  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = this.getDb();
    const stmt = db.prepare(sql);
    return stmt.all(...params) as T[];
  }
  
  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const db = this.getDb();
    const stmt = db.prepare(sql);
    const result = stmt.get(...params) as T | undefined;
    return result ?? null;
  }
  
  async execute(sql: string, params: unknown[] = []): Promise<MutationResult> {
    const db = this.getDb();
    const stmt = db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: result.changes,
      lastInsertRowId: result.lastInsertRowid,
    };
  }
  
  async exec(sql: string): Promise<void> {
    const db = this.getDb();
    db.exec(sql);
  }
  
  async initialize(schemaSQL: string, seedSQL?: string): Promise<void> {
    const exists = await this.tableExists('transaction');
    if (!exists) {
      await this.exec(schemaSQL);
      if (seedSQL) {
        await this.exec(seedSQL);
      }
    }
  }
  
  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [tableName]
    );
    return result !== null;
  }
  
  /**
   * Run operations in a transaction.
   * 
   * IMPORTANT: For better-sqlite3, the callback must be synchronous.
   * Async callbacks are only supported in the Tauri implementation.
   * While the interface accepts Promise returns for compatibility,
   * using async operations here will cause errors.
   */
  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    const db = this.getDb();
    const txn = db.transaction(() => {
      return callback(this);
    });
    
    // Handle both sync and async callbacks
    const result = txn();
    if (result instanceof Promise) {
      return result;
    }
    return result;
  }
  
  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
  
  async backup(targetPath: string): Promise<void> {
    const db = this.getDb();
    
    // Ensure target directory exists
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    await db.backup(targetPath);
  }
  
  getPath(): string {
    return this.dbPath;
  }
}

// ============================================================================
// Tauri Plugin SQL Implementation
// ============================================================================

/**
 * Interface for Tauri SQL Database connection.
 * Provides type safety for the dynamic import of @tauri-apps/plugin-sql.
 */
interface TauriDatabase {
  select<T>(sql: string, params?: unknown[]): Promise<T>;
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number; lastInsertId: number }>;
  close(): Promise<boolean>;
}

/**
 * Tauri Plugin SQL adapter for packaged app mode
 *
 * Uses @tauri-apps/plugin-sql for native SQLite access in the desktop app.
 * The database is stored in the app's data directory (%APPDATA%/Puffin on Windows).
 */
export class TauriSqlAdapter implements DatabaseAdapter {
  private dbPath: string;
  private db: TauriDatabase | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
    this.dbPath = config.path;
  }

  /**
   * Get or create the database connection
   */
  private async getDb(): Promise<TauriDatabase> {
    if (this.db) {
      return this.db;
    }

    // Dynamic import to avoid bundling issues in non-Tauri contexts
    const { default: Database } = await import('@tauri-apps/plugin-sql');

    // Load SQLite database from the app's data directory
    // The path format for tauri-plugin-sql is: sqlite:path/to/db.sqlite
    this.db = await Database.load(`sqlite:${this.dbPath}`) as TauriDatabase;

    // Configure database
    if (this.config.enableWAL !== false) {
      await this.db.execute('PRAGMA journal_mode = WAL');
    }
    if (this.config.enableForeignKeys !== false) {
      await this.db.execute('PRAGMA foreign_keys = ON');
    }

    return this.db;
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = await this.getDb();
    return await db.select<T[]>(sql, params);
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows[0] ?? null;
  }

  async execute(sql: string, params: unknown[] = []): Promise<MutationResult> {
    const db = await this.getDb();
    const result = await db.execute(sql, params);
    return {
      changes: result.rowsAffected,
      lastInsertRowId: result.lastInsertId,
    };
  }

  async exec(sql: string): Promise<void> {
    const db = await this.getDb();
    // Execute multiple statements by splitting on semicolons.
    // WARNING: This naive splitting does not handle semicolons inside SQL string
    // literals. Only use for schema DDL statements, not user-provided SQL.
    const statements = sql.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        await db.execute(stmt);
      }
    }
  }

  async initialize(schemaSQL: string, seedSQL?: string): Promise<void> {
    const exists = await this.tableExists('transaction');
    if (!exists) {
      await this.exec(schemaSQL);
      if (seedSQL) {
        await this.exec(seedSQL);
      }
    }
  }

  async tableExists(tableName: string): Promise<boolean> {
    const result = await this.queryOne<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      [tableName]
    );
    return result !== null;
  }

  /**
   * Run operations in a transaction.
   *
   * Note: Tauri plugin-sql supports true async transactions.
   */
  async transaction<T>(callback: TransactionCallback<T>): Promise<T> {
    const db = await this.getDb();

    await db.execute('BEGIN TRANSACTION');
    try {
      const result = await callback(this);
      await db.execute('COMMIT');
      return result;
    } catch (error) {
      await db.execute('ROLLBACK');
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  async backup(targetPath: string): Promise<void> {
    const db = await this.getDb();
    // SQLite backup using VACUUM INTO (SQLite 3.27+)
    // Escape single quotes to prevent SQL injection
    const safePath = targetPath.replace(/'/g, "''");
    await db.execute(`VACUUM INTO '${safePath}'`);
  }

  getPath(): string {
    return this.dbPath;
  }
}

// ============================================================================
// Factory Function
// ============================================================================

let cachedAdapter: DatabaseAdapter | null = null;

/**
 * Create a database adapter based on the current runtime environment
 */
export function createDatabaseAdapter(config: DatabaseConfig): DatabaseAdapter {
  // Use cached adapter if available (singleton pattern)
  if (cachedAdapter) {
    return cachedAdapter;
  }
  
  const environment = getRuntimeEnvironment();
  
  if (environment === 'tauri') {
    cachedAdapter = new TauriSqlAdapter(config);
  } else {
    // Both 'node' and 'browser' (development) use better-sqlite3
    cachedAdapter = new BetterSqlite3Adapter(config);
  }
  
  return cachedAdapter;
}

/**
 * Get the current database adapter (must be created first)
 */
export function getDatabaseAdapter(): DatabaseAdapter | null {
  return cachedAdapter;
}

/**
 * Clear the cached adapter (useful for testing)
 */
export function clearDatabaseAdapter(): void {
  if (cachedAdapter) {
    cachedAdapter.close();
    cachedAdapter = null;
  }
}

