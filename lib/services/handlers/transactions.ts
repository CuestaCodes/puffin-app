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
  pageSize: number;
}> {
  const page = parseInt(params.page || '1');
  const pageSize = parseInt(params.pageSize || '50');
  const offset = (page - 1) * pageSize;

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
    conditions.push('t.description LIKE ?');
    queryParams.push(`%${params.search}%`);
  }

  const whereClause = conditions.join(' AND ');

  // Get total count
  const countResult = await db.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM "transaction" t WHERE ${whereClause}`,
    queryParams
  );
  const total = countResult?.count || 0;

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
    ORDER BY t.date DESC, t.created_at DESC
    LIMIT ? OFFSET ?`,
    [...queryParams, pageSize, offset]
  );

  return { transactions, total, page, pageSize };
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
