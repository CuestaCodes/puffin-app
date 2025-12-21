// Source database operations
import { getDatabase } from './index';
import { generateId } from '../uuid';
import type { Source } from '@/types/database';

/**
 * Get all sources
 */
export function getSources(): Source[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM source ORDER BY sort_order ASC, name ASC
  `).all() as Source[];
}

/**
 * Get a source by ID
 */
export function getSourceById(id: string): Source | null {
  const db = getDatabase();
  const result = db.prepare('SELECT * FROM source WHERE id = ?').get(id) as Source | undefined;
  return result || null;
}

/**
 * Get a source by name
 */
export function getSourceByName(name: string): Source | null {
  const db = getDatabase();
  const result = db.prepare('SELECT * FROM source WHERE name = ?').get(name) as Source | undefined;
  return result || null;
}

/**
 * Create a new source
 */
export function createSource(name: string): Source {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  
  // Get max sort order
  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) as max_order FROM source
  `).get() as { max_order: number };
  
  const sortOrder = maxOrder.max_order + 1;
  
  db.prepare(`
    INSERT INTO source (id, name, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name.trim(), sortOrder, now, now);
  
  return {
    id,
    name: name.trim(),
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Update a source
 */
export function updateSource(id: string, data: {
  name?: string;
  sort_order?: number;
}): Source | null {
  const db = getDatabase();
  
  // SAFETY: The `updates` array only contains hard-coded column names ('name = ?', 'sort_order = ?', 'updated_at = ?').
  // User input is always passed via parameterized queries (?), never interpolated into the SQL string.
  const updates: string[] = [];
  const params: (string | number)[] = [];
  
  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name.trim());
  }
  if (data.sort_order !== undefined) {
    updates.push('sort_order = ?');
    params.push(data.sort_order);
  }
  
  if (updates.length === 0) {
    return getSourceById(id);
  }
  
  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);
  
  db.prepare(`UPDATE source SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  
  return getSourceById(id);
}

/**
 * Delete a source
 */
export function deleteSource(id: string): boolean {
  const db = getDatabase();
  
  // First, set source_id to null for all transactions using this source
  db.prepare(`
    UPDATE "transaction" SET source_id = NULL, updated_at = ? WHERE source_id = ?
  `).run(new Date().toISOString(), id);
  
  // Then delete the source
  const result = db.prepare('DELETE FROM source WHERE id = ?').run(id);
  
  return result.changes > 0;
}

/**
 * Check if a source has any transactions
 */
export function sourceHasTransactions(sourceId: string): number {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM "transaction" 
    WHERE source_id = ? AND is_deleted = 0
  `).get(sourceId) as { count: number };
  return result.count;
}

/**
 * Reorder sources
 */
export function reorderSources(orderedIds: string[]): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const updateStmt = db.prepare(`
    UPDATE source SET sort_order = ?, updated_at = ? WHERE id = ?
  `);
  
  const reorder = db.transaction((ids: string[]) => {
    ids.forEach((id, index) => {
      updateStmt.run(index + 1, now, id);
    });
  });
  
  reorder(orderedIds);
}
