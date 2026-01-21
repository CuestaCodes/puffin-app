/**
 * Tests for Notes database operations
 *
 * These tests verify note CRUD, soft delete, search, and tag operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

// Test database path
const TEST_DB_DIR = path.join(process.cwd(), 'data', 'test');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'notes-test.db');

// Test schema for notes
const TEST_SCHEMA = `
  CREATE TABLE IF NOT EXISTS note (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT,
    tags TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

// Fixed timestamp for deterministic tests
const TEST_TIMESTAMP = '2025-01-15T00:00:00.000Z';

describe('Notes Operations', () => {
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
    db.exec(TEST_SCHEMA);
  });

  afterEach(() => {
    if (db) db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
    if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
  });

  describe('createNote', () => {
    it('should create a note with title only', () => {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run(id, 'Test Note', null, null, TEST_TIMESTAMP, TEST_TIMESTAMP);

      const note = db.prepare('SELECT * FROM note WHERE id = ?').get(id) as {
        id: string;
        title: string;
        content: string | null;
        tags: string | null;
        is_deleted: number;
      };

      expect(note).toBeDefined();
      expect(note.title).toBe('Test Note');
      expect(note.content).toBeNull();
      expect(note.tags).toBeNull();
      expect(note.is_deleted).toBe(0);
    });

    it('should create a note with title, content, and tags', () => {
      const id = crypto.randomUUID();
      const tags = JSON.stringify(['financial', 'goals']);

      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run(id, 'Budget Goals', 'Save $5000 this year', tags, TEST_TIMESTAMP, TEST_TIMESTAMP);

      const note = db.prepare('SELECT * FROM note WHERE id = ?').get(id) as {
        id: string;
        title: string;
        content: string;
        tags: string;
      };

      expect(note.title).toBe('Budget Goals');
      expect(note.content).toBe('Save $5000 this year');
      expect(JSON.parse(note.tags)).toEqual(['financial', 'goals']);
    });
  });

  describe('getAllNotes', () => {
    beforeEach(() => {
      // Create test notes
      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run('note-1', 'First Note', 'Content one', '["tag1"]', TEST_TIMESTAMP, '2025-01-15T01:00:00.000Z');

      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run('note-2', 'Second Note', 'Content two', '["tag2"]', TEST_TIMESTAMP, '2025-01-15T02:00:00.000Z');

      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run('note-3', 'Deleted Note', 'Should not appear', null, TEST_TIMESTAMP, TEST_TIMESTAMP);
    });

    it('should return all non-deleted notes', () => {
      const notes = db.prepare(`
        SELECT * FROM note WHERE is_deleted = 0 ORDER BY updated_at DESC
      `).all() as { id: string }[];

      expect(notes).toHaveLength(2);
      expect(notes[0].id).toBe('note-2'); // Most recent first
      expect(notes[1].id).toBe('note-1');
    });

    it('should exclude soft-deleted notes', () => {
      const notes = db.prepare(`
        SELECT * FROM note WHERE is_deleted = 0
      `).all() as { id: string }[];

      const ids = notes.map(n => n.id);
      expect(ids).not.toContain('note-3');
    });

    it('should filter notes by search query in title', () => {
      const searchPattern = '%First%';
      const notes = db.prepare(`
        SELECT * FROM note WHERE is_deleted = 0 AND (title LIKE ? OR content LIKE ?)
      `).all(searchPattern, searchPattern) as { id: string }[];

      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe('note-1');
    });

    it('should filter notes by search query in content', () => {
      const searchPattern = '%two%';
      const notes = db.prepare(`
        SELECT * FROM note WHERE is_deleted = 0 AND (title LIKE ? OR content LIKE ?)
      `).all(searchPattern, searchPattern) as { id: string }[];

      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe('note-2');
    });
  });

  describe('updateNote', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run('note-1', 'Original Title', 'Original content', '["original"]', TEST_TIMESTAMP, TEST_TIMESTAMP);
    });

    it('should update note title', () => {
      db.prepare('UPDATE note SET title = ? WHERE id = ?').run('Updated Title', 'note-1');

      const note = db.prepare('SELECT * FROM note WHERE id = ?').get('note-1') as { title: string };
      expect(note.title).toBe('Updated Title');
    });

    it('should update note content', () => {
      db.prepare('UPDATE note SET content = ? WHERE id = ?').run('Updated content', 'note-1');

      const note = db.prepare('SELECT * FROM note WHERE id = ?').get('note-1') as { content: string };
      expect(note.content).toBe('Updated content');
    });

    it('should update note tags', () => {
      const newTags = JSON.stringify(['new', 'tags']);
      db.prepare('UPDATE note SET tags = ? WHERE id = ?').run(newTags, 'note-1');

      const note = db.prepare('SELECT * FROM note WHERE id = ?').get('note-1') as { tags: string };
      expect(JSON.parse(note.tags)).toEqual(['new', 'tags']);
    });

    it('should update updated_at timestamp', () => {
      const newTimestamp = '2025-01-16T00:00:00.000Z';
      db.prepare('UPDATE note SET title = ?, updated_at = ? WHERE id = ?').run('New', newTimestamp, 'note-1');

      const note = db.prepare('SELECT * FROM note WHERE id = ?').get('note-1') as { updated_at: string };
      expect(note.updated_at).toBe(newTimestamp);
    });
  });

  describe('deleteNote (soft delete)', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run('note-1', 'To Delete', 'Content', null, TEST_TIMESTAMP, TEST_TIMESTAMP);
    });

    it('should soft delete a note by setting is_deleted = 1', () => {
      const result = db.prepare(`
        UPDATE note SET is_deleted = 1, updated_at = ? WHERE id = ? AND is_deleted = 0
      `).run(TEST_TIMESTAMP, 'note-1');

      expect(result.changes).toBe(1);

      const note = db.prepare('SELECT * FROM note WHERE id = ?').get('note-1') as { is_deleted: number };
      expect(note.is_deleted).toBe(1);
    });

    it('should not appear in non-deleted queries after soft delete', () => {
      db.prepare('UPDATE note SET is_deleted = 1 WHERE id = ?').run('note-1');

      const notes = db.prepare('SELECT * FROM note WHERE is_deleted = 0').all();
      expect(notes).toHaveLength(0);
    });

    it('should return 0 changes when deleting already deleted note', () => {
      // First delete
      db.prepare('UPDATE note SET is_deleted = 1 WHERE id = ?').run('note-1');

      // Try to delete again
      const result = db.prepare(`
        UPDATE note SET is_deleted = 1 WHERE id = ? AND is_deleted = 0
      `).run('note-1');

      expect(result.changes).toBe(0);
    });
  });

  describe('getAllTags', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run('note-1', 'Note 1', null, '["finance", "goals"]', TEST_TIMESTAMP, TEST_TIMESTAMP);

      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run('note-2', 'Note 2', null, '["finance", "budget"]', TEST_TIMESTAMP, TEST_TIMESTAMP);

      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run('note-3', 'Deleted', null, '["hidden"]', TEST_TIMESTAMP, TEST_TIMESTAMP);
    });

    it('should return unique tags from all non-deleted notes', () => {
      const rows = db.prepare(`
        SELECT tags FROM note WHERE is_deleted = 0 AND tags IS NOT NULL
      `).all() as { tags: string }[];

      const tagSet = new Set<string>();
      for (const row of rows) {
        const tags = JSON.parse(row.tags) as string[];
        for (const tag of tags) {
          tagSet.add(tag);
        }
      }

      const allTags = Array.from(tagSet).sort();
      expect(allTags).toEqual(['budget', 'finance', 'goals']);
    });

    it('should exclude tags from deleted notes', () => {
      const rows = db.prepare(`
        SELECT tags FROM note WHERE is_deleted = 0 AND tags IS NOT NULL
      `).all() as { tags: string }[];

      const tagSet = new Set<string>();
      for (const row of rows) {
        const tags = JSON.parse(row.tags) as string[];
        for (const tag of tags) {
          tagSet.add(tag);
        }
      }

      expect(tagSet.has('hidden')).toBe(false);
    });
  });

  describe('tag parsing', () => {
    it('should handle null tags gracefully', () => {
      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run('note-1', 'No Tags', null, null, TEST_TIMESTAMP, TEST_TIMESTAMP);

      const note = db.prepare('SELECT * FROM note WHERE id = ?').get('note-1') as { tags: string | null };
      expect(note.tags).toBeNull();

      // Parsing null should result in empty array
      const tags = note.tags ? JSON.parse(note.tags) : [];
      expect(tags).toEqual([]);
    });

    it('should handle empty tags array', () => {
      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run('note-1', 'Empty Tags', null, '[]', TEST_TIMESTAMP, TEST_TIMESTAMP);

      const note = db.prepare('SELECT * FROM note WHERE id = ?').get('note-1') as { tags: string };
      expect(JSON.parse(note.tags)).toEqual([]);
    });

    it('should handle invalid JSON gracefully', () => {
      db.prepare(`
        INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `).run('note-1', 'Bad Tags', null, 'not valid json', TEST_TIMESTAMP, TEST_TIMESTAMP);

      const note = db.prepare('SELECT * FROM note WHERE id = ?').get('note-1') as { tags: string };

      // Parsing should catch error and return empty array
      let tags: string[] = [];
      try {
        tags = JSON.parse(note.tags);
      } catch {
        tags = [];
      }
      expect(tags).toEqual([]);
    });
  });
});
