/**
 * Tauri Handler: Transactions
 *
 * Handles transaction-related operations in Tauri mode.
 * Mirrors the functionality of /api/transactions/* routes.
 */

import * as db from '../tauri-db';

interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  sub_category_id: string | null;
  source_id: string | null;
  notes: string | null;
  is_deleted: number;
  is_split_parent: number;
  parent_transaction_id: string | null;
  created_at: string;
  updated_at: string;
}

interface TransactionWithCategory extends Transaction {
  category_name: string | null;
  upper_category_name: string | null;
  upper_category_type: string | null;
  source_name: string | null;
}

interface HandlerContext {
  method: string;
  body?: unknown;
  params: Record<string, string>;
  path: string;
}

/**
 * Main transactions handler - /api/transactions
 */
export async function handleTransactions(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;

  switch (method) {
    case 'GET':
      return getTransactions(params);
    case 'POST':
      return createTransaction(body as Partial<Transaction>);
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Single transaction handler - /api/transactions/[id]
 */
export async function handleTransaction(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;
  const id = params.id;

  if (!id) {
    throw new Error('Transaction ID required');
  }

  switch (method) {
    case 'GET':
      return getTransactionById(id);
    case 'PUT':
    case 'PATCH':
      return updateTransaction(id, body as Partial<Transaction>);
    case 'DELETE':
      return deleteTransaction(id);
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Get transactions with optional filters.
 */
async function getTransactions(params: Record<string, string>): Promise<{
  transactions: TransactionWithCategory[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}> {
  const page = parseInt(params.page || '1');
  const limit = parseInt(params.limit || params.pageSize || '50');
  const offset = (page - 1) * limit;

  // Sorting - validate and sanitize
  const sortBy = params.sortBy || 'date';
  const sortOrder = params.sortOrder === 'asc' ? 'ASC' : 'DESC';

  // Map sortBy to actual column names
  const sortColumnMap: Record<string, string> = {
    date: 't.date',
    description: 't.description',
    amount: 't.amount',
  };
  const sortColumn = sortColumnMap[sortBy] || 't.date';

  // Build WHERE clause
  const conditions: string[] = ['t.is_deleted = 0', 't.is_split_parent = 0'];
  const queryParams: unknown[] = [];

  if (params.startDate) {
    conditions.push('t.date >= ?');
    queryParams.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push('t.date <= ?');
    queryParams.push(params.endDate);
  }
  if (params.categoryId) {
    conditions.push('t.sub_category_id = ?');
    queryParams.push(params.categoryId);
  }
  if (params.uncategorized === 'true') {
    conditions.push('t.sub_category_id IS NULL');
  }
  if (params.sourceId) {
    conditions.push('t.source_id = ?');
    queryParams.push(params.sourceId);
  }
  if (params.search) {
    // Case-insensitive search using LOWER()
    conditions.push('LOWER(t.description) LIKE LOWER(?)');
    queryParams.push(`%${params.search}%`);
  }
  if (params.minAmount) {
    conditions.push('ABS(t.amount) >= ?');
    queryParams.push(parseFloat(params.minAmount));
  }
  if (params.maxAmount) {
    conditions.push('ABS(t.amount) <= ?');
    queryParams.push(parseFloat(params.maxAmount));
  }

  const whereClause = conditions.join(' AND ');

  // Get total count
  const countResult = await db.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM "transaction" t WHERE ${whereClause}`,
    queryParams
  );
  const total = countResult?.count || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  // Get transactions with category info
  const transactions = await db.query<TransactionWithCategory>(
    `SELECT
      t.*,
      sc.name as category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type,
      s.name as source_name
    FROM "transaction" t
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
    LEFT JOIN source s ON t.source_id = s.id
    WHERE ${whereClause}
    ORDER BY ${sortColumn} ${sortOrder}, t.created_at DESC
    LIMIT ? OFFSET ?`,
    [...queryParams, limit, offset]
  );

  return { transactions, total, page, limit, totalPages };
}

/**
 * Get a single transaction by ID.
 */
async function getTransactionById(id: string): Promise<TransactionWithCategory | null> {
  return db.queryOne<TransactionWithCategory>(
    `SELECT
      t.*,
      sc.name as category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type,
      s.name as source_name
    FROM "transaction" t
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
    LEFT JOIN source s ON t.source_id = s.id
    WHERE t.id = ?`,
    [id]
  );
}

/**
 * Create a new transaction.
 */
async function createTransaction(data: Partial<Transaction>): Promise<Transaction> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db.execute(
    `INSERT INTO "transaction" (id, date, description, amount, sub_category_id, source_id, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.date,
      data.description,
      data.amount,
      data.sub_category_id || null,
      data.source_id || null,
      data.notes || null,
      now,
      now,
    ]
  );

  const transaction = await getTransactionById(id);
  if (!transaction) {
    throw new Error('Failed to create transaction');
  }
  return transaction;
}

/**
 * Update a transaction.
 */
async function updateTransaction(id: string, data: Partial<Transaction>): Promise<Transaction> {
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.date !== undefined) {
    updates.push('date = ?');
    params.push(data.date);
  }
  if (data.description !== undefined) {
    updates.push('description = ?');
    params.push(data.description);
  }
  if (data.amount !== undefined) {
    updates.push('amount = ?');
    params.push(data.amount);
  }
  if (data.sub_category_id !== undefined) {
    updates.push('sub_category_id = ?');
    params.push(data.sub_category_id);
  }
  if (data.source_id !== undefined) {
    updates.push('source_id = ?');
    params.push(data.source_id);
  }
  if (data.notes !== undefined) {
    updates.push('notes = ?');
    params.push(data.notes);
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  await db.execute(
    `UPDATE "transaction" SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  const transaction = await getTransactionById(id);
  if (!transaction) {
    throw new Error('Transaction not found');
  }
  return transaction;
}

/**
 * Soft delete a transaction.
 */
async function deleteTransaction(id: string): Promise<{ success: boolean }> {
  await db.execute(
    `UPDATE "transaction" SET is_deleted = 1, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), id]
  );
  return { success: true };
}

/**
 * Split transaction handler - /api/transactions/[id]/split
 */
export async function handleTransactionSplit(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;
  const id = params.id;

  if (!id) {
    throw new Error('Transaction ID required');
  }

  switch (method) {
    case 'GET':
      return getSplitChildren(id);
    case 'POST':
      return splitTransaction(id, body as { splits: SplitInput[] });
    case 'DELETE':
      return unsplitTransaction(id);
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

interface SplitInput {
  amount: number;
  sub_category_id?: string | null;
  description?: string;
}

/**
 * Get child transactions for a split parent
 */
async function getSplitChildren(parentId: string): Promise<{
  parent: TransactionWithCategory | null;
  children: TransactionWithCategory[];
}> {
  const parent = await getTransactionById(parentId);

  if (!parent) {
    throw new Error('Transaction not found');
  }

  if (!parent.is_split_parent) {
    throw new Error('Transaction is not split');
  }

  const children = await db.query<TransactionWithCategory>(
    `SELECT
      t.*,
      sc.name as category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type,
      s.name as source_name
    FROM "transaction" t
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
    LEFT JOIN source s ON t.source_id = s.id
    WHERE t.parent_transaction_id = ? AND t.is_deleted = 0
    ORDER BY t.amount DESC`,
    [parentId]
  );

  return { parent, children };
}

/**
 * Split a transaction into multiple child transactions
 */
async function splitTransaction(
  parentId: string,
  data: { splits: SplitInput[] }
): Promise<{ success: boolean; parent: TransactionWithCategory | null; children: TransactionWithCategory[] }> {
  const parent = await getTransactionById(parentId);

  if (!parent) {
    throw new Error('Transaction not found');
  }

  if (parent.is_split_parent) {
    throw new Error('Transaction is already split');
  }

  if (parent.parent_transaction_id) {
    throw new Error('Cannot split a child transaction');
  }

  const { splits } = data;

  if (!splits || splits.length < 2) {
    throw new Error('Must have at least 2 splits');
  }

  if (splits.length > 10) {
    throw new Error('Maximum 10 splits allowed');
  }

  // Validate split amounts sum to parent amount
  const splitTotal = splits.reduce((sum, s) => sum + Math.abs(s.amount), 0);
  const parentAmount = Math.abs(parent.amount);

  if (Math.abs(splitTotal - parentAmount) > 0.01) {
    throw new Error(`Split amounts (${splitTotal}) must equal parent amount (${parentAmount})`);
  }

  const now = new Date().toISOString();
  const sign = parent.amount < 0 ? -1 : 1;

  // Mark parent as split
  await db.execute(
    `UPDATE "transaction" SET is_split_parent = 1, updated_at = ? WHERE id = ?`,
    [now, parentId]
  );

  // Create child transactions
  for (const split of splits) {
    const childId = crypto.randomUUID();
    const amount = sign * Math.abs(split.amount);

    await db.execute(
      `INSERT INTO "transaction" (
        id, date, description, amount, sub_category_id, source_id, notes,
        is_deleted, is_split_parent, parent_transaction_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
      [
        childId,
        parent.date,
        split.description || parent.description,
        amount,
        split.sub_category_id || null,
        parent.source_id,
        null,
        parentId,
        now,
        now,
      ]
    );
  }

  const result = await getSplitChildren(parentId);
  return { success: true, ...result };
}

/**
 * Unsplit a transaction - remove children and restore parent
 */
async function unsplitTransaction(parentId: string): Promise<{ success: boolean; transaction: TransactionWithCategory | null }> {
  const parent = await getTransactionById(parentId);

  if (!parent) {
    throw new Error('Transaction not found');
  }

  if (!parent.is_split_parent) {
    throw new Error('Transaction is not split');
  }

  const now = new Date().toISOString();

  // Delete child transactions
  await db.execute(
    `DELETE FROM "transaction" WHERE parent_transaction_id = ?`,
    [parentId]
  );

  // Unmark parent as split
  await db.execute(
    `UPDATE "transaction" SET is_split_parent = 0, updated_at = ? WHERE id = ?`,
    [now, parentId]
  );

  const transaction = await getTransactionById(parentId);
  return { success: true, transaction };
}

/**
 * Import transactions handler - /api/transactions/import
 */
export async function handleTransactionImport(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  return importTransactions(body as {
    transactions: ImportTransaction[];
    skipDuplicates?: boolean;
  });
}

interface ImportTransaction {
  date: string;
  description: string;
  amount: number;
  notes?: string | null;
  sub_category_id?: string | null;
  source_id?: string | null;
}

interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  duplicates: number;
  autoCategorized: number;
  errors: Array<{ rowIndex: number; message: string }>;
}

/**
 * Generate fingerprint for duplicate detection
 */
function generateFingerprint(tx: { date: string; amount: number; description: string }): string {
  const normalized = `${tx.date}|${tx.amount.toFixed(2)}|${tx.description.toLowerCase().trim()}`;
  return normalized;
}

/**
 * Import multiple transactions
 */
async function importTransactions(data: {
  transactions: ImportTransaction[];
  skipDuplicates?: boolean;
}): Promise<ImportResult> {
  const { transactions, skipDuplicates = true } = data;

  if (!transactions || transactions.length === 0) {
    throw new Error('No transactions to import');
  }

  if (transactions.length > 1000) {
    throw new Error('Maximum 1000 transactions per import');
  }

  const result: ImportResult = {
    success: true,
    imported: 0,
    skipped: 0,
    duplicates: 0,
    autoCategorized: 0,
    errors: [],
  };

  // Get existing fingerprints for duplicate checking
  const existingFingerprints = new Set<string>();
  if (skipDuplicates) {
    const dates = transactions.map(t => t.date).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];

    const existing = await db.query<{ date: string; amount: number; description: string }>(
      `SELECT date, amount, description FROM "transaction"
       WHERE date >= ? AND date <= ? AND is_deleted = 0`,
      [startDate, endDate]
    );

    for (const tx of existing) {
      existingFingerprints.add(generateFingerprint(tx));
    }
  }

  const importedFingerprints = new Set<string>();

  // Get auto-categorization rules
  const rules = await db.query<{ pattern: string; sub_category_id: string; match_type: string }>(
    `SELECT pattern, sub_category_id, match_type FROM auto_category_rule
     WHERE is_active = 1 ORDER BY priority ASC`
  );

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i];

    try {
      const fingerprint = generateFingerprint(tx);

      // Check for duplicates
      if (skipDuplicates) {
        if (existingFingerprints.has(fingerprint) || importedFingerprints.has(fingerprint)) {
          result.duplicates++;
          result.skipped++;
          continue;
        }
      }

      // Apply auto-categorization if no category set
      let finalSubCategoryId = tx.sub_category_id || null;
      let wasAutoCategorized = false;

      if (!finalSubCategoryId && rules.length > 0) {
        for (const rule of rules) {
          const desc = tx.description.toLowerCase();
          const pattern = rule.pattern.toLowerCase();
          let matched = false;

          switch (rule.match_type) {
            case 'contains':
              matched = desc.includes(pattern);
              break;
            case 'exact':
              matched = desc === pattern;
              break;
            case 'starts_with':
              matched = desc.startsWith(pattern);
              break;
            case 'ends_with':
              matched = desc.endsWith(pattern);
              break;
          }

          if (matched) {
            finalSubCategoryId = rule.sub_category_id;
            wasAutoCategorized = true;
            break;
          }
        }
      }

      // Insert transaction
      const id = crypto.randomUUID();
      const now = new Date().toISOString();

      await db.execute(
        `INSERT INTO "transaction" (
          id, date, description, amount, notes, sub_category_id, source_id,
          is_split_parent, parent_transaction_id, is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, ?, ?)`,
        [
          id,
          tx.date,
          tx.description,
          tx.amount,
          tx.notes || null,
          finalSubCategoryId,
          tx.source_id || null,
          now,
          now,
        ]
      );

      importedFingerprints.add(fingerprint);
      result.imported++;
      if (wasAutoCategorized) {
        result.autoCategorized++;
      }
    } catch (error) {
      result.errors.push({
        rowIndex: i,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      result.skipped++;
    }
  }

  result.success = result.errors.length === 0;
  return result;
}

/**
 * Check duplicates handler - /api/transactions/check-duplicates
 */
export async function handleCheckDuplicates(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  const { transactions } = body as { transactions: Array<{ date: string; amount: number; description: string }> };

  if (!transactions || transactions.length === 0) {
    return { duplicates: [] };
  }

  const dates = transactions.map(t => t.date).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  const existing = await db.query<{ date: string; amount: number; description: string }>(
    `SELECT date, amount, description FROM "transaction"
     WHERE date >= ? AND date <= ? AND is_deleted = 0`,
    [startDate, endDate]
  );

  const existingFingerprints = new Set<string>();
  for (const tx of existing) {
    existingFingerprints.add(generateFingerprint(tx));
  }

  const duplicates = transactions
    .map((tx, index) => ({ ...tx, index }))
    .filter(tx => existingFingerprints.has(generateFingerprint(tx)))
    .map(tx => tx.index);

  return { duplicates };
}
