/**
 * Tauri Handler: Sources
 *
 * Handles source-related operations in Tauri mode.
 * Mirrors the functionality of /api/sources/* routes.
 */

import * as db from '../tauri-db';

interface Source {
  id: string;
  name: string;
  sort_order: number;
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
 * Main sources handler - /api/sources
 */
export async function handleSources(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  switch (method) {
    case 'GET':
      return getSources();
    case 'POST':
      return createSource(body as { name: string });
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Single source handler - /api/sources/[id]
 */
export async function handleSource(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;
  const id = params.id;

  if (!id) {
    throw new Error('Source ID required');
  }

  switch (method) {
    case 'GET':
      return getSourceById(id);
    case 'PUT':
    case 'PATCH':
      return updateSource(id, body as Partial<Source>);
    case 'DELETE':
      return deleteSource(id);
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Get all sources.
 */
async function getSources(): Promise<{ sources: Source[] }> {
  const sources = await db.query<Source>('SELECT * FROM source ORDER BY sort_order');
  return { sources };
}

/**
 * Get a single source by ID.
 */
async function getSourceById(id: string): Promise<Source | null> {
  return db.queryOne<Source>('SELECT * FROM source WHERE id = ?', [id]);
}

/**
 * Create a new source.
 */
async function createSource(data: { name: string }): Promise<{ source: Source }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Get max sort_order
  const maxOrder = await db.queryOne<{ max_order: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM source'
  );

  await db.execute(
    'INSERT INTO source (id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, data.name, (maxOrder?.max_order || 0) + 1, now, now]
  );

  const source = await getSourceById(id);
  if (!source) {
    throw new Error('Failed to create source');
  }
  return { source };
}

/**
 * Update a source.
 */
async function updateSource(id: string, data: Partial<Source>): Promise<Source> {
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.sort_order !== undefined) {
    updates.push('sort_order = ?');
    params.push(data.sort_order);
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  await db.execute(`UPDATE source SET ${updates.join(', ')} WHERE id = ?`, params);

  const source = await getSourceById(id);
  if (!source) {
    throw new Error('Source not found');
  }
  return source;
}

/**
 * Delete a source.
 */
async function deleteSource(id: string): Promise<{ success: boolean }> {
  // Set source_id to NULL for transactions using this source
  await db.execute(
    'UPDATE "transaction" SET source_id = NULL, updated_at = ? WHERE source_id = ?',
    [new Date().toISOString(), id]
  );

  // Delete the source
  await db.execute('DELETE FROM source WHERE id = ?', [id]);

  return { success: true };
}
