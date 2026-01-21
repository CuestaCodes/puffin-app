/**
 * Tauri Handler: Notes
 *
 * Handles note-related operations in Tauri mode.
 * Mirrors the functionality of /api/notes/* routes.
 */

import * as db from '../tauri-db';
import type { NoteParsed, CreateNoteInput, UpdateNoteInput } from '@/types/database';

interface NoteRow {
  id: string;
  title: string;
  content: string | null;
  tags: string | null;
  is_deleted: number;
  created_at: string;
  updated_at: string;
}

interface HandlerContext {
  method: string;
  body?: unknown;
  params: Record<string, string>;
  path: string;
}

/**
 * Parse a raw note row into NoteParsed with tags as array
 */
function parseNote(row: NoteRow): NoteParsed {
  let tags: string[] = [];
  if (row.tags) {
    try {
      tags = JSON.parse(row.tags);
    } catch {
      tags = [];
    }
  }
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    tags,
    is_deleted: row.is_deleted === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Main notes handler - /api/notes
 */
export async function handleNotes(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;

  switch (method) {
    case 'GET': {
      if (params.tagsOnly === 'true') {
        const tags = await getAllTags();
        return { tags };
      }
      const notes = await getAllNotes(params.search);
      return { notes };
    }
    case 'POST': {
      const input = body as CreateNoteInput;
      if (!input.title || typeof input.title !== 'string' || !input.title.trim()) {
        throw new Error('Title is required');
      }
      const note = await createNote({
        title: input.title.trim(),
        content: input.content || null,
        tags: input.tags || [],
      });
      return { note };
    }
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Single note handler - /api/notes/[id]
 */
export async function handleNote(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;
  const id = params.id;

  if (!id) {
    throw new Error('Note ID required');
  }

  switch (method) {
    case 'GET': {
      const note = await getNoteById(id);
      if (!note) {
        throw new Error('Note not found');
      }
      return { note };
    }
    case 'PATCH': {
      const input = body as UpdateNoteInput;
      if (input.title !== undefined && (!input.title || typeof input.title !== 'string' || !input.title.trim())) {
        throw new Error('Title cannot be empty');
      }
      const note = await updateNote(id, {
        title: input.title?.trim(),
        content: input.content,
        tags: input.tags,
      });
      if (!note) {
        throw new Error('Note not found');
      }
      return { note };
    }
    case 'DELETE': {
      const success = await deleteNote(id);
      if (!success) {
        throw new Error('Note not found');
      }
      return { success: true };
    }
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Get all notes, optionally filtered by search
 */
async function getAllNotes(search?: string): Promise<NoteParsed[]> {
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

  const rows = await db.query<NoteRow>(sql, params);
  return rows.map(parseNote);
}

/**
 * Get a single note by ID
 */
async function getNoteById(id: string): Promise<NoteParsed | null> {
  const rows = await db.query<NoteRow>(
    'SELECT * FROM note WHERE id = ? AND is_deleted = 0',
    [id]
  );

  if (rows.length === 0) return null;
  return parseNote(rows[0]);
}

/**
 * Create a new note
 */
async function createNote(input: CreateNoteInput): Promise<NoteParsed> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const tags = input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null;

  await db.execute(
    `INSERT INTO note (id, title, content, tags, is_deleted, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    [id, input.title, input.content || null, tags, now, now]
  );

  const created = await getNoteById(id);
  if (!created) {
    throw new Error(`Failed to retrieve newly created note: ${id}`);
  }
  return created;
}

/**
 * Update an existing note
 */
async function updateNote(id: string, input: UpdateNoteInput): Promise<NoteParsed | null> {
  const existing = await getNoteById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
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
    params.push(input.tags && input.tags.length > 0 ? JSON.stringify(input.tags) : null);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push('updated_at = ?');
  params.push(now);
  params.push(id);

  await db.execute(
    `UPDATE note SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  return getNoteById(id);
}

/**
 * Soft delete a note
 */
async function deleteNote(id: string): Promise<boolean> {
  const now = new Date().toISOString();

  const result = await db.execute(
    'UPDATE note SET is_deleted = 1, updated_at = ? WHERE id = ? AND is_deleted = 0',
    [now, id]
  );

  return result.changes > 0;
}

/**
 * Get all unique tags from notes
 */
async function getAllTags(): Promise<string[]> {
  const rows = await db.query<{ tags: string }>(
    'SELECT tags FROM note WHERE is_deleted = 0 AND tags IS NOT NULL'
  );

  const tagSet = new Set<string>();
  for (const row of rows) {
    try {
      const tags = JSON.parse(row.tags) as string[];
      for (const tag of tags) {
        tagSet.add(tag);
      }
    } catch {
      // Skip invalid JSON
    }
  }

  return Array.from(tagSet).sort();
}
