/**
 * Tauri Handler: Categories
 *
 * Handles category-related operations in Tauri mode.
 * Mirrors the functionality of /api/categories/* routes.
 */

import * as db from '../tauri-db';

interface UpperCategory {
  id: string;
  name: string;
  type: string;
  sort_order: number;
  is_active: number;
}

interface SubCategory {
  id: string;
  name: string;
  upper_category_id: string;
  sort_order: number;
  is_deleted: number;
  upper_category_name?: string;
  upper_category_type?: string;
}

interface HandlerContext {
  method: string;
  body?: unknown;
  params: Record<string, string>;
  path: string;
}

/**
 * Main categories handler - /api/categories
 */
export async function handleCategories(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;

  switch (method) {
    case 'GET':
      return getCategories(params);
    case 'POST':
      return createCategory(body as { name: string; upper_category_id: string });
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Single category handler - /api/categories/[id]
 */
export async function handleCategory(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;
  const id = params.id;

  if (!id) {
    throw new Error('Category ID required');
  }

  switch (method) {
    case 'GET': {
      // Try sub-category first, then upper category
      const subCategory = await getCategoryById(id);
      if (subCategory) {
        return { category: subCategory, type: 'sub' };
      }
      const upperCategory = await getUpperCategoryById(id);
      if (upperCategory) {
        const countResult = await db.queryOne<{ count: number }>(
          `SELECT COUNT(*) as count FROM "transaction" t
           JOIN sub_category sc ON t.sub_category_id = sc.id
           WHERE sc.upper_category_id = ? AND t.is_deleted = 0`,
          [id]
        );
        return { category: upperCategory, type: 'upper', transactionCount: countResult?.count || 0 };
      }
      throw new Error('Category not found');
    }
    case 'PUT':
    case 'PATCH': {
      // Check if it's an upper category first
      const upperCategory = await getUpperCategoryById(id);
      if (upperCategory) {
        const data = body as { name?: string; is_active?: boolean | 0 | 1 };
        if (data.name === undefined && data.is_active === undefined) {
          throw new Error('At least one field (name or is_active) is required');
        }

        const countResult = await db.queryOne<{ count: number }>(
          `SELECT COUNT(*) as count FROM "transaction" t
           JOIN sub_category sc ON t.sub_category_id = sc.id
           WHERE sc.upper_category_id = ? AND t.is_deleted = 0`,
          [id]
        );
        const transactionCount = countResult?.count || 0;
        const deactivating = data.is_active === false || data.is_active === 0;
        const now = new Date().toISOString();

        const updates: string[] = [];
        const params: unknown[] = [];
        if (data.name !== undefined) {
          updates.push('name = ?');
          params.push(data.name);
        }
        if (data.is_active !== undefined) {
          updates.push('is_active = ?');
          params.push(data.is_active ? 1 : 0);
        }
        updates.push('updated_at = ?');
        params.push(now);
        params.push(id);

        await db.execute('BEGIN TRANSACTION');
        try {
          if (deactivating) {
            await db.execute(
              `UPDATE "transaction" SET sub_category_id = NULL, updated_at = ?
               WHERE sub_category_id IN (SELECT id FROM sub_category WHERE upper_category_id = ?)
                 AND is_deleted = 0`,
              [now, id]
            );
          }
          await db.execute(
            `UPDATE upper_category SET ${updates.join(', ')} WHERE id = ?`,
            params
          );
          await db.execute('COMMIT');
        } catch (e) {
          try { await db.execute('ROLLBACK'); } catch { /* no active transaction */ }
          throw e;
        }

        const updated = await getUpperCategoryById(id);
        return { category: updated, type: 'upper', transactionCount };
      }
      // Otherwise update sub-category
      return updateCategory(id, body as Partial<SubCategory>);
    }
    case 'DELETE':
      return deleteCategory(id);
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

interface CategoryGroup {
  id: string;
  name: string;
  type: string;
  sort_order: number;
  is_active: number;
  subCategories: SubCategory[];
}

/**
 * Get all categories with optional filters.
 * Returns both flat format (upperCategories, subCategories) and grouped format (categories).
 */
async function getCategories(params: Record<string, string>): Promise<{
  upperCategories: UpperCategory[];
  subCategories: SubCategory[];
  categories: CategoryGroup[];
}> {
  const includeDeleted = params.includeDeleted === 'true';

  // Get upper categories
  const upperCategories = await db.query<UpperCategory>(
    'SELECT * FROM upper_category ORDER BY sort_order'
  );

  // Get sub categories
  const whereClause = includeDeleted ? '' : 'WHERE is_deleted = 0';
  const subCategories = await db.query<SubCategory>(
    `SELECT
      sc.*,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM sub_category sc
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    ${whereClause}
    ORDER BY uc.sort_order, sc.name COLLATE NOCASE`
  );

  // Build grouped format for category-management.tsx
  const categories: CategoryGroup[] = upperCategories.map(upper => ({
    id: upper.id,
    name: upper.name,
    type: upper.type,
    sort_order: upper.sort_order,
    is_active: upper.is_active ?? 1,
    subCategories: subCategories.filter(sub => sub.upper_category_id === upper.id),
  }));

  return { upperCategories, subCategories, categories };
}

/**
 * Get an upper category by ID.
 */
async function getUpperCategoryById(id: string): Promise<UpperCategory | null> {
  return db.queryOne<UpperCategory>(
    'SELECT * FROM upper_category WHERE id = ?',
    [id]
  );
}

/**
 * Get a single category by ID.
 */
async function getCategoryById(id: string): Promise<SubCategory | null> {
  return db.queryOne<SubCategory>(
    `SELECT
      sc.*,
      uc.name as upper_category_name,
      uc.type as upper_category_type
    FROM sub_category sc
    JOIN upper_category uc ON sc.upper_category_id = uc.id
    WHERE sc.id = ?`,
    [id]
  );
}

/**
 * Create a new sub-category.
 */
async function createCategory(data: { name: string; upper_category_id: string }): Promise<SubCategory> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Get max sort_order for this upper category
  const maxOrder = await db.queryOne<{ max_order: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) as max_order FROM sub_category WHERE upper_category_id = ?',
    [data.upper_category_id]
  );

  await db.execute(
    `INSERT INTO sub_category (id, name, upper_category_id, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, data.name, data.upper_category_id, (maxOrder?.max_order || 0) + 1, now, now]
  );

  const category = await getCategoryById(id);
  if (!category) {
    throw new Error('Failed to create category');
  }
  return category;
}

/**
 * Update a category.
 */
async function updateCategory(id: string, data: Partial<SubCategory>): Promise<SubCategory> {
  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.name !== undefined) {
    updates.push('name = ?');
    params.push(data.name);
  }
  if (data.upper_category_id !== undefined) {
    updates.push('upper_category_id = ?');
    params.push(data.upper_category_id);
  }
  if (data.sort_order !== undefined) {
    updates.push('sort_order = ?');
    params.push(data.sort_order);
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  await db.execute(
    `UPDATE sub_category SET ${updates.join(', ')} WHERE id = ?`,
    params
  );

  const category = await getCategoryById(id);
  if (!category) {
    throw new Error('Category not found');
  }
  return category;
}

/**
 * Soft delete a category.
 */
async function deleteCategory(id: string): Promise<{ success: boolean }> {
  await db.execute(
    'UPDATE sub_category SET is_deleted = 1, updated_at = ? WHERE id = ?',
    [new Date().toISOString(), id]
  );
  return { success: true };
}
