// Transaction database operations
import { getDatabase } from './index';
import { generateId } from '../uuid';
import type { Transaction, TransactionWithCategory } from '@/types/database';
import type { TransactionFilter, PaginationParams } from '../validations';

/**
 * Get all transactions with optional filtering and pagination
 */
export function getTransactions(
  filter: TransactionFilter = {},
  pagination: PaginationParams = { page: 1, limit: 50, sortBy: 'date', sortOrder: 'desc' }
): { transactions: TransactionWithCategory[]; total: number } {
  const db = getDatabase();
  
  // Build WHERE clause
  const conditions: string[] = [];
  const params: (string | number | boolean)[] = [];
  
  if (!filter.includeDeleted) {
    conditions.push('t.is_deleted = 0');
  }
  
  // Note: Split parent transactions ARE shown in the list (for visibility)
  // but are excluded from TOTALS in budget queries (to prevent double-counting)
  // The UI shows them greyed out with a "SPLIT" badge
  
  if (filter.startDate) {
    conditions.push('t.date >= ?');
    params.push(filter.startDate);
  }
  
  if (filter.endDate) {
    conditions.push('t.date <= ?');
    params.push(filter.endDate);
  }
  
  if (filter.categoryId) {
    conditions.push('t.sub_category_id = ?');
    params.push(filter.categoryId);
  }
  
  if (filter.upperCategoryId) {
    conditions.push('sc.upper_category_id = ?');
    params.push(filter.upperCategoryId);
  }
  
  if (filter.uncategorized) {
    conditions.push('t.sub_category_id IS NULL');
  }
  
  if (filter.search) {
    conditions.push('(t.description LIKE ? OR t.notes LIKE ?)');
    const searchTerm = `%${filter.search}%`;
    params.push(searchTerm, searchTerm);
  }
  
  if (filter.minAmount !== undefined) {
    conditions.push('t.amount >= ?');
    params.push(filter.minAmount);
  }
  
  if (filter.maxAmount !== undefined) {
    conditions.push('t.amount <= ?');
    params.push(filter.maxAmount);
  }
  
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  
  // Count total
  const countQuery = `
    SELECT COUNT(*) as total
    FROM "transaction" t
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    ${whereClause}
  `;
  const countResult = db.prepare(countQuery).get(...params) as { total: number };
  
  // Get transactions with pagination
  const offset = (pagination.page - 1) * pagination.limit;
  
  // Whitelist mapping for ORDER BY columns (prevents SQL injection)
  const orderColumnMap: Record<string, string> = {
    'date': 't.date',
    'amount': 't.amount',
    'description': 't.description',
    'created_at': 't.created_at',
  };
  const orderColumn = orderColumnMap[pagination.sortBy] || 't.date';
  const orderDirection = pagination.sortOrder === 'asc' ? 'ASC' : 'DESC';
  
  const query = `
    SELECT 
      t.*,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM "transaction" t
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
    ${whereClause}
    ORDER BY ${orderColumn} ${orderDirection}, t.created_at DESC
    LIMIT ? OFFSET ?
  `;
  
  const transactions = db.prepare(query).all(...params, pagination.limit, offset) as TransactionWithCategory[];
  
  return {
    transactions,
    total: countResult.total,
  };
}

/**
 * Get a single transaction by ID
 */
export function getTransactionById(id: string): TransactionWithCategory | null {
  const db = getDatabase();
  const query = `
    SELECT 
      t.*,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM "transaction" t
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE t.id = ?
  `;
  const result = db.prepare(query).get(id) as TransactionWithCategory | undefined;
  return result || null;
}

/**
 * Create a new transaction
 */
export function createTransaction(data: {
  date: string;
  description: string;
  amount: number;
  notes?: string | null;
  sub_category_id?: string | null;
}): Transaction {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO "transaction" (id, date, description, amount, notes, sub_category_id, is_split, is_deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `).run(id, data.date, data.description, data.amount, data.notes || null, data.sub_category_id || null, now, now);
  
  return {
    id,
    date: data.date,
    description: data.description,
    amount: data.amount,
    notes: data.notes || null,
    sub_category_id: data.sub_category_id || null,
    is_split: false,
    parent_transaction_id: null,
    is_deleted: false,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Update a transaction
 */
export function updateTransaction(id: string, data: {
  date?: string;
  description?: string;
  amount?: number;
  notes?: string | null;
  sub_category_id?: string | null;
}): Transaction | null {
  const db = getDatabase();
  
  // Build update query dynamically
  const updates: string[] = [];
  const params: (string | number | null)[] = [];
  
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
  if (data.notes !== undefined) {
    updates.push('notes = ?');
    params.push(data.notes);
  }
  if (data.sub_category_id !== undefined) {
    updates.push('sub_category_id = ?');
    params.push(data.sub_category_id);
  }
  
  if (updates.length === 0) {
    return getTransactionById(id) as Transaction | null;
  }
  
  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);
  
  db.prepare(`UPDATE "transaction" SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  
  return getTransactionById(id) as Transaction | null;
}

/**
 * Soft delete a transaction
 */
export function deleteTransaction(id: string): boolean {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    UPDATE "transaction" SET is_deleted = 1, updated_at = ? WHERE id = ?
  `).run(now, id);
  
  return result.changes > 0;
}

/**
 * Hard delete a transaction (permanent)
 */
export function hardDeleteTransaction(id: string): boolean {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM "transaction" WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Create multiple transactions (bulk import)
 */
export function createTransactions(transactions: Array<{
  date: string;
  description: string;
  amount: number;
  notes?: string | null;
  sub_category_id?: string | null;
}>): Transaction[] {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const insert = db.prepare(`
    INSERT INTO "transaction" (id, date, description, amount, notes, sub_category_id, is_split, is_deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?)
  `);
  
  const created: Transaction[] = [];
  
  const insertMany = db.transaction((txns) => {
    for (const txn of txns) {
      const id = generateId();
      insert.run(id, txn.date, txn.description, txn.amount, txn.notes || null, txn.sub_category_id || null, now, now);
      created.push({
        id,
        date: txn.date,
        description: txn.description,
        amount: txn.amount,
        notes: txn.notes || null,
        sub_category_id: txn.sub_category_id || null,
        is_split: false,
        parent_transaction_id: null,
        is_deleted: false,
        created_at: now,
        updated_at: now,
      });
    }
  });
  
  insertMany(transactions);
  
  return created;
}

/**
 * Get count of uncategorized transactions
 */
export function getUncategorizedCount(): number {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM "transaction" 
    WHERE sub_category_id IS NULL AND is_deleted = 0
  `).get() as { count: number };
  return result.count;
}

/**
 * Check for duplicate transactions
 */
export function findDuplicates(transactions: Array<{ date: string; description: string; amount: number }>): Set<number> {
  const db = getDatabase();
  const duplicateIndices = new Set<number>();
  
  const checkStmt = db.prepare(`
    SELECT id FROM "transaction" 
    WHERE date = ? AND description = ? AND amount = ? AND is_deleted = 0
    LIMIT 1
  `);
  
  transactions.forEach((txn, index) => {
    const existing = checkStmt.get(txn.date, txn.description, txn.amount);
    if (existing) {
      duplicateIndices.add(index);
    }
  });
  
  return duplicateIndices;
}

/**
 * Split a transaction into multiple parts
 * @param parentId The ID of the transaction to split
 * @param splits Array of split amounts and optional category IDs
 * @returns Array of created child transactions
 */
export function splitTransaction(
  parentId: string,
  splits: Array<{ amount: number; sub_category_id?: string | null; description?: string }>
): Transaction[] {
  const db = getDatabase();
  const parent = getTransactionById(parentId);
  
  if (!parent) {
    throw new Error('Transaction not found');
  }
  
  if (parent.is_split) {
    throw new Error('Transaction is already split');
  }
  
  if (parent.parent_transaction_id) {
    throw new Error('Cannot split a child transaction');
  }
  
  // Validate that splits sum to original amount
  const totalSplit = splits.reduce((sum, s) => sum + s.amount, 0);
  const originalAmount = Math.abs(parent.amount);
  const tolerance = 0.01; // Allow for floating point precision issues
  
  if (Math.abs(totalSplit - originalAmount) > tolerance) {
    throw new Error(`Split amounts (${totalSplit}) must equal original amount (${originalAmount})`);
  }
  
  const now = new Date().toISOString();
  const createdChildren: Transaction[] = [];
  
  const performSplit = db.transaction(() => {
    // Mark parent as split
    db.prepare(`
      UPDATE "transaction" SET is_split = 1, updated_at = ? WHERE id = ?
    `).run(now, parentId);
    
    // Create child transactions
    const insertStmt = db.prepare(`
      INSERT INTO "transaction" 
      (id, date, description, amount, notes, sub_category_id, is_split, parent_transaction_id, is_deleted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?)
    `);
    
    // Determine sign based on parent amount
    const sign = parent.amount < 0 ? -1 : 1;
    
    for (let i = 0; i < splits.length; i++) {
      const split = splits[i];
      const id = generateId();
      const description = split.description || `${parent.description} (Part ${i + 1})`;
      const amount = sign * Math.abs(split.amount);
      
      insertStmt.run(
        id,
        parent.date,
        description,
        amount,
        parent.notes,
        split.sub_category_id || null,
        parentId,
        now,
        now
      );
      
      createdChildren.push({
        id,
        date: parent.date,
        description,
        amount,
        notes: parent.notes,
        sub_category_id: split.sub_category_id || null,
        is_split: false,
        parent_transaction_id: parentId,
        is_deleted: false,
        created_at: now,
        updated_at: now,
      });
    }
  });
  
  performSplit();
  
  return createdChildren;
}

/**
 * Get child transactions for a split parent
 */
export function getChildTransactions(parentId: string): TransactionWithCategory[] {
  const db = getDatabase();
  
  return db.prepare(`
    SELECT 
      t.*,
      sc.name as sub_category_name,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM "transaction" t
    LEFT JOIN sub_category sc ON t.sub_category_id = sc.id
    LEFT JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE t.parent_transaction_id = ? AND t.is_deleted = 0
    ORDER BY t.created_at ASC
  `).all(parentId) as TransactionWithCategory[];
}

/**
 * Unsplit a transaction - delete children and restore parent
 */
export function unsplitTransaction(parentId: string): Transaction | null {
  const db = getDatabase();
  const parent = getTransactionById(parentId);
  
  if (!parent) {
    throw new Error('Transaction not found');
  }
  
  if (!parent.is_split) {
    throw new Error('Transaction is not split');
  }
  
  const now = new Date().toISOString();
  
  const performUnsplit = db.transaction(() => {
    // Soft delete all child transactions
    db.prepare(`
      UPDATE "transaction" 
      SET is_deleted = 1, updated_at = ? 
      WHERE parent_transaction_id = ?
    `).run(now, parentId);
    
    // Mark parent as no longer split
    db.prepare(`
      UPDATE "transaction" 
      SET is_split = 0, updated_at = ? 
      WHERE id = ?
    `).run(now, parentId);
  });
  
  performUnsplit();
  
  return getTransactionById(parentId) as Transaction | null;
}

