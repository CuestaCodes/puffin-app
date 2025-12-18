// Category database operations
import { getDatabase } from './index';
import { generateId } from '../uuid';
import type { UpperCategory, SubCategory, SubCategoryWithUpper } from '@/types/database';

/**
 * Get all upper categories
 */
export function getUpperCategories(): UpperCategory[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM upper_category ORDER BY sort_order ASC
  `).all() as UpperCategory[];
}

/**
 * Get an upper category by ID
 */
export function getUpperCategoryById(id: string): UpperCategory | null {
  const db = getDatabase();
  const result = db.prepare('SELECT * FROM upper_category WHERE id = ?').get(id) as UpperCategory | undefined;
  return result || null;
}

/**
 * Update an upper category name
 */
export function updateUpperCategory(id: string, name: string): UpperCategory | null {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  db.prepare(`UPDATE upper_category SET name = ?, updated_at = ? WHERE id = ?`).run(name, now, id);
  return getUpperCategoryById(id);
}

/**
 * Get all sub-categories with their upper category info
 */
export function getSubCategories(includeDeleted: boolean = false): SubCategoryWithUpper[] {
  const db = getDatabase();
  const deletedClause = includeDeleted ? '' : 'WHERE sc.is_deleted = 0';
  
  return db.prepare(`
    SELECT 
      sc.*,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM sub_category sc
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    ${deletedClause}
    ORDER BY uc.sort_order ASC, sc.sort_order ASC
  `).all() as SubCategoryWithUpper[];
}

/**
 * Get sub-categories for a specific upper category
 */
export function getSubCategoriesByUpper(upperCategoryId: string, includeDeleted: boolean = false): SubCategory[] {
  const db = getDatabase();
  const deletedClause = includeDeleted ? '' : 'AND is_deleted = 0';
  
  return db.prepare(`
    SELECT * FROM sub_category 
    WHERE upper_category_id = ? ${deletedClause}
    ORDER BY sort_order ASC
  `).all(upperCategoryId) as SubCategory[];
}

/**
 * Get a sub-category by ID
 */
export function getSubCategoryById(id: string): SubCategoryWithUpper | null {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT 
      sc.*,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM sub_category sc
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE sc.id = ?
  `).get(id) as SubCategoryWithUpper | undefined;
  return result || null;
}

/**
 * Create a new sub-category
 */
export function createSubCategory(data: {
  upper_category_id: string;
  name: string;
}): SubCategory {
  const db = getDatabase();
  const id = generateId();
  const now = new Date().toISOString();
  
  // Get max sort order
  const maxOrder = db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) as max_order 
    FROM sub_category WHERE upper_category_id = ?
  `).get(data.upper_category_id) as { max_order: number };
  
  const sortOrder = maxOrder.max_order + 1;
  
  db.prepare(`
    INSERT INTO sub_category (id, upper_category_id, name, sort_order, is_deleted, created_at, updated_at)
    VALUES (?, ?, ?, ?, 0, ?, ?)
  `).run(id, data.upper_category_id, data.name, sortOrder, now, now);
  
  return {
    id,
    upper_category_id: data.upper_category_id,
    name: data.name,
    sort_order: sortOrder,
    is_deleted: false,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Update a sub-category
 */
export function updateSubCategory(id: string, data: {
  name?: string;
  sort_order?: number;
}): SubCategory | null {
  const db = getDatabase();
  
  const updates: string[] = [];
  const params: (string | number)[] = [];
  
  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.sort_order !== undefined) {
    updates.push('sort_order = ?');
    params.push(data.sort_order);
  }
  
  if (updates.length === 0) {
    return getSubCategoryById(id);
  }
  
  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);
  
  db.prepare(`UPDATE sub_category SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  
  return getSubCategoryById(id);
}

/**
 * Soft delete a sub-category
 */
export function deleteSubCategory(id: string): boolean {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    UPDATE sub_category SET is_deleted = 1, updated_at = ? WHERE id = ?
  `).run(now, id);
  
  return result.changes > 0;
}

/**
 * Check if a sub-category has any transactions
 */
export function hasTransactions(subCategoryId: string): boolean {
  const db = getDatabase();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM "transaction" 
    WHERE sub_category_id = ? AND is_deleted = 0
  `).get(subCategoryId) as { count: number };
  return result.count > 0;
}

/**
 * Reassign transactions from one category to another
 */
export function reassignTransactions(fromCategoryId: string, toCategoryId: string | null): number {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const result = db.prepare(`
    UPDATE "transaction" SET sub_category_id = ?, updated_at = ?
    WHERE sub_category_id = ? AND is_deleted = 0
  `).run(toCategoryId, now, fromCategoryId);
  
  return result.changes;
}

/**
 * Get categories grouped by upper category
 */
export function getCategoriesGrouped(): Map<UpperCategory, SubCategoryWithUpper[]> {
  const upperCategories = getUpperCategories();
  const subCategories = getSubCategories();
  
  const grouped = new Map<UpperCategory, SubCategoryWithUpper[]>();
  
  for (const upper of upperCategories) {
    grouped.set(
      upper,
      subCategories.filter(sub => sub.upper_category_id === upper.id)
    );
  }
  
  return grouped;
}

/**
 * Reorder sub-categories
 */
export function reorderSubCategories(upperCategoryId: string, orderedIds: string[]): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  
  const updateStmt = db.prepare(`
    UPDATE sub_category SET sort_order = ?, updated_at = ? WHERE id = ? AND upper_category_id = ?
  `);
  
  const reorder = db.transaction((ids: string[]) => {
    ids.forEach((id, index) => {
      updateStmt.run(index + 1, now, id, upperCategoryId);
    });
  });
  
  reorder(orderedIds);
}



