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
  const { method, body, params } = ctx;

  switch (method) {
    case 'GET':
      // Handle action-based queries
      if (params.action === 'test') {
        if (!params.matchText) {
          throw new Error('matchText is required for testing');
        }
        const limit = parseInt(params.limit || '10');
        return { matches: await testRule(params.matchText, limit) };
      }
      if (params.action === 'count') {
        if (!params.matchText) {
          throw new Error('matchText is required for counting');
        }
        const includeAlreadyCategorized = params.includeAlreadyCategorized === 'true';
        return await countMatchingTransactions(params.matchText, includeAlreadyCategorized);
      }
      if (params.action === 'current-counts') {
        return { counts: await getAllRuleCurrentCounts() };
      }
      return getAllRules();
    case 'POST':
      return createRule(body as { match_text: string; sub_category_id: string; add_to_top?: boolean });
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
    case 'POST': {
      // Apply rule to existing transactions
      const applyBody = body as { includeAlreadyCategorized?: boolean } | undefined;
      const includeAlreadyCategorized = applyBody?.includeAlreadyCategorized ?? false;
      return applyRuleToExistingTransactions(id, includeAlreadyCategorized);
    }
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
 * @param data.add_to_top - If true, adds rule at top (priority 0) and shifts others down
 */
async function createRule(data: { match_text: string; sub_category_id: string; add_to_top?: boolean }): Promise<AutoCategoryRule> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  let priority: number;

  if (data.add_to_top) {
    // Shift all existing rules down and add at top
    await db.execute('UPDATE auto_category_rule SET priority = priority + 1');
    priority = 0;
  } else {
    // Add to end of list (default behavior)
    const maxPriority = await db.queryOne<{ max_priority: number }>(
      'SELECT COALESCE(MAX(priority), -1) as max_priority FROM auto_category_rule'
    );
    priority = (maxPriority?.max_priority ?? -1) + 1;
  }

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

/**
 * Test a rule against existing uncategorized transactions.
 */
async function testRule(
  matchText: string,
  limit: number = 10
): Promise<Array<{ id: string; description: string; date: string; amount: number }>> {
  return db.query<{ id: string; description: string; date: string; amount: number }>(`
    SELECT id, description, date, amount
    FROM "transaction"
    WHERE is_deleted = 0
      AND is_split = 0
      AND sub_category_id IS NULL
      AND LOWER(description) LIKE '%' || LOWER(?) || '%'
    ORDER BY date DESC
    LIMIT ?
  `, [matchText.trim(), limit]);
}

/**
 * Count transactions matching a pattern.
 * @param matchText - Text to match against transaction descriptions
 * @param includeAlreadyCategorized - If true, counts ALL matching transactions; if false, only uncategorized
 */
async function countMatchingTransactions(
  matchText: string,
  includeAlreadyCategorized: boolean = false
): Promise<{ uncategorized: number; alreadyCategorized: number; total: number }> {
  const uncategorizedResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM "transaction"
    WHERE is_deleted = 0
      AND is_split = 0
      AND sub_category_id IS NULL
      AND LOWER(description) LIKE '%' || LOWER(?) || '%'
  `, [matchText.trim()]);

  const uncategorized = uncategorizedResult?.count ?? 0;

  if (!includeAlreadyCategorized) {
    return {
      uncategorized,
      alreadyCategorized: 0,
      total: uncategorized,
    };
  }

  const categorizedResult = await db.queryOne<{ count: number }>(`
    SELECT COUNT(*) as count
    FROM "transaction"
    WHERE is_deleted = 0
      AND is_split = 0
      AND sub_category_id IS NOT NULL
      AND LOWER(description) LIKE '%' || LOWER(?) || '%'
  `, [matchText.trim()]);

  const alreadyCategorized = categorizedResult?.count ?? 0;

  return {
    uncategorized,
    alreadyCategorized,
    total: uncategorized + alreadyCategorized,
  };
}

/**
 * Apply a rule to existing transactions.
 * @param ruleId - ID of the rule to apply
 * @param includeAlreadyCategorized - If true, updates ALL matching transactions; if false, only uncategorized
 */
async function applyRuleToExistingTransactions(
  ruleId: string,
  includeAlreadyCategorized: boolean = false
): Promise<{
  success: boolean;
  updatedCount: number;
  message: string;
}> {
  const now = new Date().toISOString();

  // Get the rule
  const rule = await db.queryOne<{ match_text: string; sub_category_id: string }>(
    'SELECT match_text, sub_category_id FROM auto_category_rule WHERE id = ?',
    [ruleId]
  );

  if (!rule) {
    throw new Error('Rule not found');
  }

  // Build the WHERE clause based on whether to include already categorized
  const categoryCondition = includeAlreadyCategorized
    ? '' // No category filter - update all matching
    : 'AND sub_category_id IS NULL'; // Only uncategorized

  // Update matching transactions
  const result = await db.execute(`
    UPDATE "transaction"
    SET sub_category_id = ?, updated_at = ?
    WHERE is_deleted = 0
      AND is_split = 0
      ${categoryCondition}
      AND LOWER(description) LIKE '%' || LOWER(?) || '%'
  `, [rule.sub_category_id, now, rule.match_text]);

  const updatedCount = result.changes;

  // Update the rule's match count
  if (updatedCount > 0) {
    await db.execute(
      'UPDATE auto_category_rule SET match_count = match_count + ?, updated_at = ? WHERE id = ?',
      [updatedCount, now, ruleId]
    );
  }

  return {
    success: true,
    updatedCount,
    message: `Applied rule to ${updatedCount} transaction${updatedCount !== 1 ? 's' : ''}`,
  };
}

/**
 * Get current match counts for all rules in a single batch operation.
 * Returns a record of rule ID to current transaction count.
 */
async function getAllRuleCurrentCounts(): Promise<Record<string, number>> {
  // Get all rules
  const rules = await db.query<{ id: string; match_text: string }>(`
    SELECT id, match_text
    FROM auto_category_rule
  `);

  if (rules.length === 0) {
    return {};
  }

  // Get all non-deleted, non-split transactions
  const transactions = await db.query<{ description_lower: string }>(`
    SELECT LOWER(description) as description_lower
    FROM "transaction"
    WHERE is_deleted = 0
      AND is_split = 0
  `);

  // Count matches for each rule in memory (more efficient than N queries)
  const counts: Record<string, number> = {};

  for (const rule of rules) {
    const matchTextLower = rule.match_text.toLowerCase();
    let count = 0;

    for (const tx of transactions) {
      if (tx.description_lower.includes(matchTextLower)) {
        count++;
      }
    }

    counts[rule.id] = count;
  }

  return counts;
}
