/**
 * Tests for Database Abstraction Layer
 * 
 * These tests verify the BetterSqlite3Adapter works correctly
 * and the abstraction interface is properly defined.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import {
  BetterSqlite3Adapter,
  isTauriContext,
  getRuntimeEnvironment,
  createDatabaseAdapter,
  clearDatabaseAdapter,
  type DatabaseAdapter,
  type MutationResult,
} from './abstraction';

// Test database path
const TEST_DB_DIR = path.join(process.cwd(), 'data', 'test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'abstraction-test.db');

describe('Database Abstraction Layer', () => {
  describe('Runtime Detection', () => {
    it('should detect non-Tauri context in Node.js', () => {
      expect(isTauriContext()).toBe(false);
    });

    it('should return "node" as runtime environment in Node.js', () => {
      expect(getRuntimeEnvironment()).toBe('node');
    });
  });

  describe('BetterSqlite3Adapter', () => {
    let adapter: DatabaseAdapter;

    beforeEach(() => {
      // Clean up any existing test database
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
      
      adapter = new BetterSqlite3Adapter({
        path: TEST_DB_PATH,
        enableWAL: true,
        enableForeignKeys: true,
      });
    });

    afterEach(async () => {
      await adapter.close();
      
      // Clean up test database
      if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
      }
      // Clean up WAL files
      if (fs.existsSync(TEST_DB_PATH + '-wal')) {
        fs.unlinkSync(TEST_DB_PATH + '-wal');
      }
      if (fs.existsSync(TEST_DB_PATH + '-shm')) {
        fs.unlinkSync(TEST_DB_PATH + '-shm');
      }
    });

    it('should create database file on first access', async () => {
      // Execute a simple query to initialize the connection
      await adapter.exec('CREATE TABLE IF NOT EXISTS test (id INTEGER PRIMARY KEY)');
      
      expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
    });

    it('should execute raw SQL statements', async () => {
      await adapter.exec(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL
        )
      `);

      const exists = await adapter.tableExists('test_table');
      expect(exists).toBe(true);
    });

    it('should check if tables exist correctly', async () => {
      expect(await adapter.tableExists('nonexistent_table')).toBe(false);
      
      await adapter.exec('CREATE TABLE existing_table (id INTEGER PRIMARY KEY)');
      expect(await adapter.tableExists('existing_table')).toBe(true);
    });

    it('should execute INSERT and return mutation result', async () => {
      await adapter.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE
        )
      `);

      const result: MutationResult = await adapter.execute(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        ['John Doe', 'john@example.com']
      );

      expect(result.changes).toBe(1);
      expect(result.lastInsertRowId).toBeDefined();
    });

    it('should query all rows', async () => {
      await adapter.exec(`
        CREATE TABLE items (id INTEGER PRIMARY KEY, value TEXT);
        INSERT INTO items (value) VALUES ('a'), ('b'), ('c');
      `);

      const rows = await adapter.query<{ id: number; value: string }>(
        'SELECT * FROM items ORDER BY id'
      );

      expect(rows).toHaveLength(3);
      expect(rows[0].value).toBe('a');
      expect(rows[1].value).toBe('b');
      expect(rows[2].value).toBe('c');
    });

    it('should query one row', async () => {
      await adapter.exec(`
        CREATE TABLE singles (id INTEGER PRIMARY KEY, data TEXT);
        INSERT INTO singles (data) VALUES ('target');
      `);

      const row = await adapter.queryOne<{ id: number; data: string }>(
        'SELECT * FROM singles WHERE id = ?',
        [1]
      );

      expect(row).not.toBeNull();
      expect(row?.data).toBe('target');
    });

    it('should return null when queryOne finds nothing', async () => {
      await adapter.exec('CREATE TABLE empty (id INTEGER PRIMARY KEY)');

      const row = await adapter.queryOne('SELECT * FROM empty WHERE id = ?', [999]);

      expect(row).toBeNull();
    });

    it('should execute UPDATE correctly', async () => {
      await adapter.exec(`
        CREATE TABLE updates (id INTEGER PRIMARY KEY, count INTEGER);
        INSERT INTO updates (count) VALUES (0), (0), (0);
      `);

      const result = await adapter.execute(
        'UPDATE updates SET count = count + 1'
      );

      expect(result.changes).toBe(3);

      const rows = await adapter.query<{ count: number }>('SELECT count FROM updates');
      expect(rows.every(r => r.count === 1)).toBe(true);
    });

    it('should execute DELETE correctly', async () => {
      await adapter.exec(`
        CREATE TABLE deletable (id INTEGER PRIMARY KEY);
        INSERT INTO deletable (id) VALUES (1), (2), (3);
      `);

      const result = await adapter.execute('DELETE FROM deletable WHERE id > ?', [1]);

      expect(result.changes).toBe(2);

      const remaining = await adapter.query('SELECT * FROM deletable');
      expect(remaining).toHaveLength(1);
    });

    it('should handle parameterized queries correctly', async () => {
      await adapter.exec(`
        CREATE TABLE search (id INTEGER PRIMARY KEY, term TEXT);
        INSERT INTO search (term) VALUES ('apple'), ('banana'), ('apricot');
      `);

      const rows = await adapter.query<{ term: string }>(
        'SELECT term FROM search WHERE term LIKE ? ORDER BY term',
        ['ap%']
      );

      expect(rows).toHaveLength(2);
      expect(rows[0].term).toBe('apple');
      expect(rows[1].term).toBe('apricot');
    });

    it('should support transactions (sync callback)', async () => {
      await adapter.exec(`
        CREATE TABLE transactional (id INTEGER PRIMARY KEY, value INTEGER);
        INSERT INTO transactional (value) VALUES (100);
      `);

      // Note: better-sqlite3 requires synchronous transaction callbacks
      // The abstraction layer wraps sync results in Promises
      await adapter.transaction((executor) => {
        // These are sync operations wrapped in async interface
        // For better-sqlite3, we use the sync pattern
        executor.execute('UPDATE transactional SET value = value - 50 WHERE id = 1');
        executor.execute('INSERT INTO transactional (value) VALUES (50)');
        return 'success';
      });

      const rows = await adapter.query<{ value: number }>(
        'SELECT value FROM transactional ORDER BY id'
      );

      expect(rows).toHaveLength(2);
      expect(rows[0].value).toBe(50);  // Original reduced by 50
      expect(rows[1].value).toBe(50);  // New row with 50
    });

    it('should initialize database with schema', async () => {
      // Note: "transaction" is a reserved keyword in SQLite, must be quoted
      const schemaSQL = `
        CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT);
        CREATE TABLE "transaction" (id TEXT PRIMARY KEY, amount REAL);
      `;
      const seedSQL = `
        INSERT INTO users (id, name) VALUES ('u1', 'Admin');
      `;

      await adapter.initialize(schemaSQL, seedSQL);

      expect(await adapter.tableExists('users')).toBe(true);
      expect(await adapter.tableExists('transaction')).toBe(true);

      const users = await adapter.query<{ name: string }>('SELECT name FROM users');
      expect(users[0].name).toBe('Admin');
    });

    it('should not reinitialize if tables already exist', async () => {
      // Note: "transaction" is a reserved keyword in SQLite, must be quoted
      // String literals in SQL use single quotes, identifiers use double quotes
      // First initialization
      await adapter.initialize(
        'CREATE TABLE "transaction" (id TEXT PRIMARY KEY)',
        "INSERT INTO \"transaction\" (id) VALUES ('first')"
      );

      // Try to initialize again - should skip
      await adapter.initialize(
        'CREATE TABLE "transaction" (id TEXT PRIMARY KEY)',
        "INSERT INTO \"transaction\" (id) VALUES ('second')"
      );

      // Should only have the first insert
      const rows = await adapter.query<{ id: string }>('SELECT id FROM "transaction"');
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('first');
    });

    it('should create backups', async () => {
      await adapter.exec('CREATE TABLE backup_test (id INTEGER PRIMARY KEY)');
      await adapter.execute('INSERT INTO backup_test (id) VALUES (?)', [42]);

      const backupPath = path.join(TEST_DB_DIR, 'test-backup.db');
      
      await adapter.backup(backupPath);

      expect(fs.existsSync(backupPath)).toBe(true);

      // Clean up backup
      fs.unlinkSync(backupPath);
    });

    it('should return correct database path', () => {
      expect(adapter.getPath()).toBe(TEST_DB_PATH);
    });
  });

  describe('Factory Function', () => {
    afterEach(() => {
      clearDatabaseAdapter();
    });

    it('should create BetterSqlite3Adapter in Node.js environment', () => {
      const adapter = createDatabaseAdapter({
        path: TEST_DB_PATH,
      });

      expect(adapter).toBeInstanceOf(BetterSqlite3Adapter);
    });

    it('should return cached adapter on subsequent calls', () => {
      const adapter1 = createDatabaseAdapter({ path: TEST_DB_PATH });
      const adapter2 = createDatabaseAdapter({ path: TEST_DB_PATH });

      expect(adapter1).toBe(adapter2);
    });

    it('should clear adapter correctly', async () => {
      const adapter1 = createDatabaseAdapter({ path: TEST_DB_PATH });
      await clearDatabaseAdapter();
      const adapter2 = createDatabaseAdapter({ path: TEST_DB_PATH });

      expect(adapter1).not.toBe(adapter2);
    });
  });
});

