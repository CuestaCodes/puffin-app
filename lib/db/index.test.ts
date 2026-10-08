import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { SCHEMA_SQL, SEED_SQL } from './schema';

// lib/db/index.ts reads its data directory at import time, so each test points it at a
// fresh temp directory and re-imports the module.
type DbModule = typeof import('./index');

const CURRENT_VERSION = 6;

describe('initializeDatabase schema versioning', () => {
  let dir: string;
  let dbModule: DbModule;

  const dbPath = () => path.join(dir, 'puffin.db');

  /** Simulates an app restart: drops the connection and the in-process initialized flag. */
  const reopen = () => {
    dbModule.resetDatabaseConnection();
    dbModule.initializeDatabase();
  };

  const version = () =>
    (dbModule.getDatabase().prepare('SELECT version FROM schema_version WHERE id = 1').get() as { version: number }).version;

  const isActiveColumns = () =>
    dbModule.getDatabase().prepare("SELECT name FROM pragma_table_info('upper_category') WHERE name = 'is_active'").all().length;

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'puffin-schema-'));
    process.env.PUFFIN_DATA_DIR = dir;
    vi.resetModules();
    dbModule = await import('./index');
  });

  afterEach(() => {
    dbModule.resetDatabaseConnection();
    delete process.env.PUFFIN_DATA_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('records the current version on a fresh install', () => {
    dbModule.initializeDatabase();
    expect(version()).toBe(CURRENT_VERSION);
  });

  it('reopens a fresh install without replaying migrations', () => {
    dbModule.initializeDatabase();
    expect(() => reopen()).not.toThrow();
    expect(version()).toBe(CURRENT_VERSION);
    expect(isActiveColumns()).toBe(1);
  });

  it('opens a fresh install created before the version was recorded', () => {
    // What a v2.2.1 fresh install left behind: the full schema and no schema_version table
    const legacy = new Database(dbPath());
    legacy.exec(SCHEMA_SQL);
    legacy.exec(SEED_SQL);
    legacy.close();

    expect(() => dbModule.initializeDatabase()).not.toThrow();
    expect(version()).toBe(CURRENT_VERSION);
    expect(isActiveColumns()).toBe(1);
  });

  it('still adds is_active to a database that predates it', () => {
    const legacy = new Database(dbPath());
    legacy.exec(SCHEMA_SQL);
    legacy.exec(SEED_SQL);
    legacy.exec('ALTER TABLE upper_category DROP COLUMN is_active');
    legacy.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    legacy.exec('INSERT INTO schema_version (id, version) VALUES (1, 5)');
    legacy.close();

    dbModule.initializeDatabase();
    expect(version()).toBe(CURRENT_VERSION);
    expect(isActiveColumns()).toBe(1);
    const inactive = dbModule.getDatabase().prepare('SELECT COUNT(*) as count FROM upper_category WHERE is_active = 0').get() as { count: number };
    expect(inactive.count).toBe(0);
  });
});
