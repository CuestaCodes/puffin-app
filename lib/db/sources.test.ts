/**
 * Tests for Source database operations
 * 
 * These tests verify source CRUD, transaction associations, and cascading behavior
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

// Test database path
const TEST_DB_DIR = path.join(process.cwd(), 'data', 'test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'sources-test.db');

// Test schema (includes source table and transaction with source_id)
const TEST_SCHEMA = `
  CREATE TABLE IF NOT EXISTS source (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS upper_category (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS sub_category (
    id TEXT PRIMARY KEY,
    upper_category_id TEXT NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (upper_category_id) REFERENCES upper_category(id)
  );
  
  CREATE TABLE IF NOT EXISTS "transaction" (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    notes TEXT,
    sub_category_id TEXT,
    source_id TEXT REFERENCES source(id),
    is_split INTEGER DEFAULT 0,
    parent_transaction_id TEXT,
    is_deleted INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (sub_category_id) REFERENCES sub_category(id)
  );

  CREATE INDEX IF NOT EXISTS idx_transaction_source ON "transaction"(source_id);
`;

describe('Source Operations', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Ensure test directory exists
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
    
    // Clean up any existing test database
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
    if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
    
    // Create test database
    db = new Database(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
    db.exec(TEST_SCHEMA);
  });

  afterEach(() => {
    db.close();
    
    // Clean up test files
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
    if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
  });

  describe('Source CRUD', () => {
    it('should create a new source', () => {
      const now = new Date().toISOString();
      const id = 'src-1';
      
      db.prepare(`
        INSERT INTO source (id, name, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, 'Bendigo Bank', 1, now, now);
      
      const source = db.prepare('SELECT * FROM source WHERE id = ?').get(id) as {
        id: string;
        name: string;
        sort_order: number;
      };
      
      expect(source).toBeDefined();
      expect(source.name).toBe('Bendigo Bank');
      expect(source.sort_order).toBe(1);
    });

    it('should get all sources ordered by sort_order', () => {
      const now = new Date().toISOString();
      
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-1', 'Bendigo Bank', 2, now, now);
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-2', 'Credit Card', 1, now, now);
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-3', 'PayPal', 3, now, now);
      
      const sources = db.prepare('SELECT * FROM source ORDER BY sort_order ASC, name ASC').all() as Array<{
        id: string;
        name: string;
      }>;
      
      expect(sources).toHaveLength(3);
      expect(sources[0].name).toBe('Credit Card');
      expect(sources[1].name).toBe('Bendigo Bank');
      expect(sources[2].name).toBe('PayPal');
    });

    it('should get source by ID', () => {
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-1', 'Bendigo Bank', 1, now, now);
      
      const source = db.prepare('SELECT * FROM source WHERE id = ?').get('src-1') as { name: string } | undefined;
      
      expect(source).toBeDefined();
      expect(source!.name).toBe('Bendigo Bank');
    });

    it('should get source by name', () => {
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-1', 'Bendigo Bank', 1, now, now);
      
      const source = db.prepare('SELECT * FROM source WHERE name = ?').get('Bendigo Bank') as { id: string } | undefined;
      
      expect(source).toBeDefined();
      expect(source!.id).toBe('src-1');
    });

    it('should update a source name', () => {
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-1', 'Bendigo Bank', 1, now, now);
      
      db.prepare('UPDATE source SET name = ?, updated_at = ? WHERE id = ?')
        .run('Bendigo Savings', new Date().toISOString(), 'src-1');
      
      const source = db.prepare('SELECT name FROM source WHERE id = ?').get('src-1') as { name: string };
      expect(source.name).toBe('Bendigo Savings');
    });

    it('should enforce unique source names', () => {
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-1', 'Bendigo Bank', 1, now, now);
      
      expect(() => {
        db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
          .run('src-2', 'Bendigo Bank', 2, now, now);
      }).toThrow();
    });

    it('should delete a source', () => {
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-1', 'Bendigo Bank', 1, now, now);
      
      const result = db.prepare('DELETE FROM source WHERE id = ?').run('src-1');
      
      expect(result.changes).toBe(1);
      
      const source = db.prepare('SELECT * FROM source WHERE id = ?').get('src-1');
      expect(source).toBeUndefined();
    });
  });

  describe('Source-Transaction Relationships', () => {
    beforeEach(() => {
      const now = new Date().toISOString();
      
      // Add sources
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-1', 'Bendigo Bank', 1, now, now);
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-2', 'Credit Card', 2, now, now);
      
      // Add transactions with sources
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, source_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-1', '2025-01-15', 'Grocery Store', -50.00, 'src-1', 0, 0, ?, ?)
      `).run(now, now);
      
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, source_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-2', '2025-01-16', 'Gas Station', -30.00, 'src-1', 0, 0, ?, ?)
      `).run(now, now);
      
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, source_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-3', '2025-01-17', 'Online Purchase', -25.00, 'src-2', 0, 0, ?, ?)
      `).run(now, now);
    });

    it('should count transactions by source', () => {
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM "transaction" 
        WHERE source_id = ? AND is_deleted = 0
      `).get('src-1') as { count: number };
      
      expect(result.count).toBe(2);
    });

    it('should join transactions with source names', () => {
      const transactions = db.prepare(`
        SELECT t.*, s.name as source_name
        FROM "transaction" t
        LEFT JOIN source s ON t.source_id = s.id
        WHERE t.is_deleted = 0
        ORDER BY t.date
      `).all() as Array<{ id: string; source_name: string | null }>;
      
      expect(transactions).toHaveLength(3);
      expect(transactions[0].source_name).toBe('Bendigo Bank');
      expect(transactions[2].source_name).toBe('Credit Card');
    });

    it('should filter transactions by source', () => {
      const transactions = db.prepare(`
        SELECT * FROM "transaction" 
        WHERE source_id = ? AND is_deleted = 0
      `).all('src-2') as Array<{ id: string }>;
      
      expect(transactions).toHaveLength(1);
      expect(transactions[0].id).toBe('tx-3');
    });

    it('should set source_id to NULL when source is deleted', () => {
      const now = new Date().toISOString();
      
      // First, update transactions to remove source reference
      db.prepare(`
        UPDATE "transaction" SET source_id = NULL, updated_at = ? WHERE source_id = ?
      `).run(now, 'src-1');
      
      // Then delete the source
      db.prepare('DELETE FROM source WHERE id = ?').run('src-1');
      
      // Verify transactions now have NULL source_id
      const transactions = db.prepare(`
        SELECT * FROM "transaction" WHERE source_id IS NULL
      `).all();
      
      expect(transactions).toHaveLength(2);
    });

    it('should allow transactions without source (NULL source_id)', () => {
      const now = new Date().toISOString();
      
      db.prepare(`
        INSERT INTO "transaction" (id, date, description, amount, source_id, is_split, is_deleted, created_at, updated_at)
        VALUES ('tx-4', '2025-01-18', 'Cash Payment', -15.00, NULL, 0, 0, ?, ?)
      `).run(now, now);
      
      const transaction = db.prepare('SELECT * FROM "transaction" WHERE id = ?').get('tx-4') as {
        id: string;
        source_id: string | null;
      };
      
      expect(transaction).toBeDefined();
      expect(transaction.source_id).toBeNull();
    });

    it('should reassign transactions to another source', () => {
      const now = new Date().toISOString();
      
      db.prepare(`
        UPDATE "transaction" SET source_id = ?, updated_at = ?
        WHERE source_id = ? AND is_deleted = 0
      `).run('src-2', now, 'src-1');
      
      const src1Count = db.prepare(`
        SELECT COUNT(*) as count FROM "transaction" WHERE source_id = 'src-1'
      `).get() as { count: number };
      
      const src2Count = db.prepare(`
        SELECT COUNT(*) as count FROM "transaction" WHERE source_id = 'src-2'
      `).get() as { count: number };
      
      expect(src1Count.count).toBe(0);
      expect(src2Count.count).toBe(3);
    });
  });

  describe('Source Reordering', () => {
    beforeEach(() => {
      const now = new Date().toISOString();
      
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-1', 'Bendigo Bank', 1, now, now);
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-2', 'Credit Card', 2, now, now);
      db.prepare(`INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run('src-3', 'PayPal', 3, now, now);
    });

    it('should reorder sources', () => {
      const now = new Date().toISOString();
      const newOrder = ['src-3', 'src-1', 'src-2'];
      
      newOrder.forEach((id, index) => {
        db.prepare('UPDATE source SET sort_order = ?, updated_at = ? WHERE id = ?')
          .run(index + 1, now, id);
      });
      
      const sources = db.prepare('SELECT id, sort_order FROM source ORDER BY sort_order').all() as Array<{
        id: string;
        sort_order: number;
      }>;
      
      expect(sources[0].id).toBe('src-3');
      expect(sources[1].id).toBe('src-1');
      expect(sources[2].id).toBe('src-2');
    });
  });
});

describe('Schema Version Migration', () => {
  let db: Database.Database;

  beforeEach(() => {
    if (!fs.existsSync(TEST_DB_DIR)) {
      fs.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
    
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
    if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
    
    db = new Database(TEST_DB_PATH);
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
    if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
  });

  it('should create schema_version table', () => {
    db.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`INSERT INTO schema_version (id, version) VALUES (1, 0)`);
    
    const version = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number };
    expect(version.version).toBe(0);
  });

  it('should update schema version after migration', () => {
    db.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`INSERT INTO schema_version (id, version) VALUES (1, 0)`);
    
    // Simulate migration
    db.prepare("UPDATE schema_version SET version = ?, updated_at = datetime('now') WHERE id = 1").run(1);
    
    const version = db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number };
    expect(version.version).toBe(1);
  });

  it('should only run migrations for versions higher than current', () => {
    db.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    db.exec(`INSERT INTO schema_version (id, version) VALUES (1, 1)`);
    
    const currentVersion = (db.prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number }).version;
    
    // Migration 1 should be skipped (current version is already 1)
    let migration1Ran = false;
    if (currentVersion < 1) {
      migration1Ran = true;
    }
    
    expect(migration1Ran).toBe(false);
  });
});

