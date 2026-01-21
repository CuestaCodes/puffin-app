// Notes database operations

import { getDatabase } from './index';
import type { Note, NoteParsed, CreateNoteInput, UpdateNoteInput } from '@/types/database';

/**
 * Parse a raw note from DB into NoteParsed with tags as array
 */
function parseNote(note: Note): NoteParsed {
  let tags: string[] = [];
  if (note.tags) {
    try {
      tags = JSON.parse(note.tags);
    } catch {
      tags = [];
    }
  }
  return {
    ...note,
    tags,
  };
}

/**
 * Get all notes (excluding deleted), sorted by updated_at descending
 */
export function getAllNotes(search?: string): NoteParsed[] {
  const db = getDatabase();

  let sql = `
    SELECT * FROM note
    WHERE is_deleted = 0
  `;
  const params: string[] = [];

  if (search) {
    sql += ` AND (title LIKE ? OR content LIKE ?)`;
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern);
  }

  sql += ` ORDER BY updated_at DESC`;

  const notes = db.prepare(sql).all(...params) as Note[];
  return notes.map(parseNote);
}

/**
 * Get a single note by ID
 */
export function getNoteById(id: string): NoteParsed | null {
  const db = getDatabase();

  const note = db.prepare(`
    SELECT * FROM note WHERE id = ? AND is_deleted = 0
  `).get(id) as Note | undefined;

  if (!note) return null;
  return parseNote(note);
}

/**
 * Create a new note
 */
export function createNote(input: CreateNoteInput): NoteParsed {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const tags = input.tags ? JSON.stringify(input.tags) : null;

  db.prepare(`
    INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(id, input.title, input.content || null, tags, now, now);

  const created = getNoteById(id);
  if (!created) {
    throw new Error(`Failed to retrieve newly created note: ${id}`);
  }
  return created;
}

/**
 * Update an existing note
 */
export function updateNote(id: string, input: UpdateNoteInput): NoteParsed | null {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Get existing note
  const existing = getNoteById(id);
  if (!existing) return null;

  // Build update query dynamically
  const updates: string[] = [];
  const params: (string | null)[] = [];

  if (input.title !== undefined) {
    updates.push('title = ?');
    params.push(input.title);
  }

  if (input.content !== undefined) {
    updates.push('content = ?');
    params.push(input.content || null);
  }

  if (input.tags !== undefined) {
    updates.push('tags = ?');
    params.push(input.tags ? JSON.stringify(input.tags) : null);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push('updated_at = ?');
  params.push(now);
  params.push(id);

  db.prepare(`
    UPDATE note SET ${updates.join(', ')} WHERE id = ?
  `).run(...params);

  return getNoteById(id);
}

/**
 * Soft delete a note
 */
export function deleteNote(id: string): boolean {
  const db = getDatabase();
  const now = new Date().toISOString();

  const result = db.prepare(`
    UPDATE note SET is_deleted = 1, updated_at = ? WHERE id = ? AND is_deleted = 0
  `).run(now, id);

  return result.changes > 0;
}

/**
 * Get all unique tags from notes (for tag filtering UI)
 */
export function getAllTags(): string[] {
  const db = getDatabase();

  const notes = db.prepare(`
    SELECT tags FROM note WHERE is_deleted = 0 AND tags IS NOT NULL
  `).all() as { tags: string }[];

  const tagSet = new Set<string>();
  for (const note of notes) {
    try {
      const tags = JSON.parse(note.tags) as string[];
      for (const tag of tags) {
        tagSet.add(tag);
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return Array.from(tagSet).sort();
}
