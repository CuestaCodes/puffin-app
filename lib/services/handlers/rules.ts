/**
 * Tauri Handler: Auto-Categorization Rules
 *
 * Handles rule-related operations in Tauri mode.
 * Mirrors the functionality of /api/rules/* routes.
 */

import * as db from '../tauri-db';

interface AutoCategoryRule {
  id: string;
  match_text: string;
  sub_category_id: string;
  priority: number;
  is_active: boolean;
  match_count: number;
  created_at: string;
  updated_at: string;
}

interface RuleWithCategory extends AutoCategoryRule {
  sub_category_name: string;
  upper_category_name: string;
  upper_category_type: string;
}

interface HandlerContext {
  method: string;
  body?: unknown;
  params: Record<string, string>;
  path: string;
}

/**
 * Main rules handler - /api/rules
 */
export async function handleRules(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  switch (method) {
    case 'GET':
      return getAllRules();
    case 'POST':
      return createRule(body as { match_text: string; sub_category_id: string });
    case 'PUT':
      return updateRulePriorities(body as { ruleIds: string[] });
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Single rule handler - /api/rules/[id]
 */
export async function handleRule(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;
  const id = params.id;

  if (!id) {
    throw new Error('Rule ID required');
  }

  switch (method) {
    case 'GET':
      return getRuleById(id);
    case 'PUT':
    case 'PATCH':
      return updateRule(id, body as { match_text?: string; sub_category_id?: string; is_active?: boolean });
    case 'DELETE':
      return deleteRule(id);
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Get all rules with category info.
 */
async function getAllRules(): Promise<RuleWithCategory[]> {
  const results = await db.query<{
    id: string;
    match_text: string;
    sub_category_id: string;
    priority: number;
    is_active: number;
    match_count: number;
    created_at: string;
    updated_at: string;
    sub_category_name: string;
    upper_category_name: string;
    upper_category_type: string;
  }>(`
    SELECT
      r.*,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM auto_category_rule r
    JOIN sub_category sc ON r.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    ORDER BY r.priority ASC, r.created_at ASC
  `);

  return results.map(row => ({
    ...row,
    is_active: Boolean(row.is_active),
  }));
}

/**
 * Get a single rule by ID.
 */
async function getRuleById(id: string): Promise<RuleWithCategory | null> {
  const result = await db.queryOne<{
    id: string;
    match_text: string;
    sub_category_id: string;
    priority: number;
    is_active: number;
    match_count: number;
    created_at: string;
    updated_at: string;
    sub_category_name: string;
    upper_category_name: string;
    upper_category_type: string;
  }>(`
    SELECT
      r.*,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM auto_category_rule r
    JOIN sub_category sc ON r.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE r.id = ?
  `, [id]);

  if (!result) return null;

  return {
    ...result,
    is_active: Boolean(result.is_active),
  };
}

/**
 * Create a new rule.
 */
async function createRule(data: { match_text: string; sub_category_id: string }): Promise<AutoCategoryRule> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Get the next priority
  const maxPriority = await db.queryOne<{ max_priority: number }>(
    'SELECT COALESCE(MAX(priority), -1) as max_priority FROM auto_category_rule'
  );

  const priority = (maxPriority?.max_priority ?? -1) + 1;

  await db.execute(`
    INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 0, ?, ?)
  `, [id, data.match_text.trim(), data.sub_category_id, priority, now, now]);

  return {
    id,
    match_text: data.match_text.trim(),
    sub_category_id: data.sub_category_id,
    priority,
    is_active: true,
    match_count: 0,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Update a rule.
 */
async function updateRule(
  id: string,
  updates: { match_text?: string; sub_category_id?: string; is_active?: boolean }
): Promise<AutoCategoryRule | null> {
  const now = new Date().toISOString();
  const setClauses: string[] = ['updated_at = ?'];
  const params: (string | number)[] = [now];

  if (updates.match_text !== undefined) {
    setClauses.push('match_text = ?');
    params.push(updates.match_text.trim());
  }

  if (updates.sub_category_id !== undefined) {
    setClauses.push('sub_category_id = ?');
    params.push(updates.sub_category_id);
  }

  if (updates.is_active !== undefined) {
    setClauses.push('is_active = ?');
    params.push(updates.is_active ? 1 : 0);
  }

  params.push(id);

  const result = await db.execute(
    `UPDATE auto_category_rule SET ${setClauses.join(', ')} WHERE id = ?`,
    params
  );

  if (result.changes === 0) return null;

  const updated = await db.queryOne<{
    id: string;
    match_text: string;
    sub_category_id: string;
    priority: number;
    is_active: number;
    match_count: number;
    created_at: string;
    updated_at: string;
  }>('SELECT * FROM auto_category_rule WHERE id = ?', [id]);

  if (!updated) return null;

  return {
    ...updated,
    is_active: Boolean(updated.is_active),
  };
}

/**
 * Delete a rule.
 */
async function deleteRule(id: string): Promise<{ success: boolean }> {
  const result = await db.execute('DELETE FROM auto_category_rule WHERE id = ?', [id]);
  return { success: result.changes > 0 };
}

/**
 * Update rule priorities (for drag-and-drop reordering).
 */
async function updateRulePriorities(data: { ruleIds: string[] }): Promise<{ success: boolean }> {
  const now = new Date().toISOString();

  for (let i = 0; i < data.ruleIds.length; i++) {
    await db.execute(
      'UPDATE auto_category_rule SET priority = ?, updated_at = ? WHERE id = ?',
      [i, now, data.ruleIds[i]]
    );
  }

  return { success: true };
}

/**
 * Match a description against active rules.
 */
export async function findMatchingRule(description: string): Promise<string | null> {
  const rules = await db.query<{ match_text: string; sub_category_id: string }>(`
    SELECT match_text, sub_category_id
    FROM auto_category_rule
    WHERE is_active = 1
    ORDER BY priority ASC
  `);

  const descLower = description.toLowerCase();

  for (const rule of rules) {
    if (descLower.includes(rule.match_text.toLowerCase())) {
      return rule.sub_category_id;
    }
  }

  return null;
}
