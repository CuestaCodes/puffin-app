// Auto-categorisation rules database operations

import { getDatabase } from './index';
import type { AutoCategoryRule, CreateAutoRuleInput } from '@/types/database';

export interface AutoCategoryRuleWithCategory extends AutoCategoryRule {
  sub_category_name: string;
  upper_category_name: string;
  upper_category_type: string;
}

/**
 * Get all auto-categorisation rules ordered by priority
 */
export function getAllRules(): AutoCategoryRuleWithCategory[] {
  const db = getDatabase();

  const query = `
    SELECT
      r.*,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM auto_category_rule r
    JOIN sub_category sc ON r.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    ORDER BY r.priority ASC, r.created_at ASC
  `;

  const results = db.prepare(query).all() as Array<{
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
  }>;

  return results.map(row => ({
    ...row,
    is_active: Boolean(row.is_active),
  }));
}

/**
 * Get a single rule by ID
 */
export function getRuleById(id: string): AutoCategoryRuleWithCategory | null {
  const db = getDatabase();

  const query = `
    SELECT
      r.*,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM auto_category_rule r
    JOIN sub_category sc ON r.sub_category_id = sc.id
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE r.id = ?
  `;

  const result = db.prepare(query).get(id) as {
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
  } | undefined;

  if (!result) return null;

  return {
    ...result,
    is_active: Boolean(result.is_active),
  };
}

/**
 * Create a new auto-categorisation rule
 */
export function createRule(input: CreateAutoRuleInput): AutoCategoryRule {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Get the next priority (add to end of list)
  const maxPriority = db.prepare(
    'SELECT COALESCE(MAX(priority), -1) as max_priority FROM auto_category_rule'
  ).get() as { max_priority: number };

  const priority = maxPriority.max_priority + 1;

  db.prepare(`
    INSERT INTO auto_category_rule (id, match_text, sub_category_id, priority, is_active, match_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 0, ?, ?)
  `).run(id, input.match_text.trim(), input.sub_category_id, priority, now, now);

  return {
    id,
    match_text: input.match_text.trim(),
    sub_category_id: input.sub_category_id,
    priority,
    is_active: true,
    match_count: 0,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Update a rule's match text and/or category
 */
export function updateRule(
  id: string,
  updates: { match_text?: string; sub_category_id?: string; is_active?: boolean }
): AutoCategoryRule | null {
  const db = getDatabase();
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

  const result = db.prepare(`
    UPDATE auto_category_rule
    SET ${setClauses.join(', ')}
    WHERE id = ?
  `).run(...params);

  if (result.changes === 0) return null;

  return db.prepare('SELECT * FROM auto_category_rule WHERE id = ?').get(id) as AutoCategoryRule;
}

/**
 * Delete a rule
 */
export function deleteRule(id: string): boolean {
  const db = getDatabase();

  const result = db.prepare('DELETE FROM auto_category_rule WHERE id = ?').run(id);

  return result.changes > 0;
}

/**
 * Update rule priorities (for drag-and-drop reordering)
 * Takes an array of rule IDs in the new order
 */
export function updateRulePriorities(ruleIds: string[]): void {
  const db = getDatabase();
  const now = new Date().toISOString();

  const updateStmt = db.prepare(`
    UPDATE auto_category_rule
    SET priority = ?, updated_at = ?
    WHERE id = ?
  `);

  const transaction = db.transaction(() => {
    ruleIds.forEach((id, index) => {
      updateStmt.run(index, now, id);
    });
  });

  transaction();
}

/**
 * Apply rules to a transaction description
 * Returns the matching sub_category_id or null if no match
 * Uses "contains exact text" matching (case-insensitive)
 */
export function applyRulesToDescription(description: string): string | null {
  const db = getDatabase();

  // Get all active rules in priority order
  const rules = db.prepare(`
    SELECT id, match_text, sub_category_id
    FROM auto_category_rule
    WHERE is_active = 1
    ORDER BY priority ASC
  `).all() as Array<{ id: string; match_text: string; sub_category_id: string }>;

  const descLower = description.toLowerCase();

  for (const rule of rules) {
    if (descLower.includes(rule.match_text.toLowerCase())) {
      // Increment match count
      db.prepare(`
        UPDATE auto_category_rule
        SET match_count = match_count + 1, updated_at = ?
        WHERE id = ?
      `).run(new Date().toISOString(), rule.id);

      return rule.sub_category_id;
    }
  }

  return null;
}

/**
 * Apply rules to multiple transactions (batch processing)
 * Returns a map of transaction IDs to their matched sub_category_ids
 */
export function applyRulesToTransactions(
  transactions: Array<{ id: string; description: string }>
): Map<string, string> {
  const db = getDatabase();
  const matches = new Map<string, string>();

  // Get all active rules in priority order
  const rules = db.prepare(`
    SELECT id, match_text, sub_category_id
    FROM auto_category_rule
    WHERE is_active = 1
    ORDER BY priority ASC
  `).all() as Array<{ id: string; match_text: string; sub_category_id: string }>;

  if (rules.length === 0) return matches;

  // Track which rules matched and how many times
  const ruleCounts = new Map<string, number>();

  for (const tx of transactions) {
    const descLower = tx.description.toLowerCase();

    for (const rule of rules) {
      if (descLower.includes(rule.match_text.toLowerCase())) {
        matches.set(tx.id, rule.sub_category_id);
        ruleCounts.set(rule.id, (ruleCounts.get(rule.id) || 0) + 1);
        break; // First match wins
      }
    }
  }

  // Update match counts in a single transaction
  if (ruleCounts.size > 0) {
    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE auto_category_rule
      SET match_count = match_count + ?, updated_at = ?
      WHERE id = ?
    `);

    const transaction = db.transaction(() => {
      for (const [ruleId, count] of ruleCounts) {
        updateStmt.run(count, now, ruleId);
      }
    });

    transaction();
  }

  return matches;
}

/**
 * Test a rule against existing transactions
 * Returns transactions that would match
 */
export function testRule(
  matchText: string,
  limit: number = 10
): Array<{ id: string; description: string; date: string; amount: number }> {
  const db = getDatabase();

  // Get uncategorized transactions that match
  const query = `
    SELECT id, description, date, amount
    FROM "transaction"
    WHERE is_deleted = 0
      AND is_split = 0
      AND sub_category_id IS NULL
      AND LOWER(description) LIKE '%' || LOWER(?) || '%'
    ORDER BY date DESC
    LIMIT ?
  `;

  return db.prepare(query).all(matchText.trim(), limit) as Array<{
    id: string;
    description: string;
    date: string;
    amount: number;
  }>;
}

/**
 * Get rule statistics
 */
export function getRuleStats(): {
  totalRules: number;
  activeRules: number;
  totalMatches: number;
} {
  const db = getDatabase();

  const result = db.prepare(`
    SELECT
      COUNT(*) as total_rules,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_rules,
      SUM(match_count) as total_matches
    FROM auto_category_rule
  `).get() as { total_rules: number; active_rules: number; total_matches: number };

  return {
    totalRules: result.total_rules,
    activeRules: result.active_rules || 0,
    totalMatches: result.total_matches || 0,
  };
}

/**
 * Count how many existing uncategorized transactions would match a rule
 */
export function countMatchingTransactions(matchText: string): number {
  const db = getDatabase();

  const result = db.prepare(`
    SELECT COUNT(*) as count
    FROM "transaction"
    WHERE is_deleted = 0
      AND is_split = 0
      AND sub_category_id IS NULL
      AND LOWER(description) LIKE '%' || LOWER(?) || '%'
  `).get(matchText.trim()) as { count: number };

  return result.count;
}

/**
 * Apply a rule to existing uncategorized transactions
 * Returns the number of transactions updated
 */
export function applyRuleToExistingTransactions(ruleId: string): number {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Get the rule
  const rule = db.prepare(`
    SELECT match_text, sub_category_id
    FROM auto_category_rule
    WHERE id = ?
  `).get(ruleId) as { match_text: string; sub_category_id: string } | undefined;

  if (!rule) return 0;

  // Update matching uncategorized transactions
  const result = db.prepare(`
    UPDATE "transaction"
    SET sub_category_id = ?, updated_at = ?
    WHERE is_deleted = 0
      AND is_split = 0
      AND sub_category_id IS NULL
      AND LOWER(description) LIKE '%' || LOWER(?) || '%'
  `).run(rule.sub_category_id, now, rule.match_text);

  // Update the rule's match count
  if (result.changes > 0) {
    db.prepare(`
      UPDATE auto_category_rule
      SET match_count = match_count + ?, updated_at = ?
      WHERE id = ?
    `).run(result.changes, now, ruleId);
  }

  return result.changes;
}
