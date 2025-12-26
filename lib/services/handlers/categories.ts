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
    case 'GET':
      return getCategoryById(id);
    case 'PUT':
    case 'PATCH':
      return updateCategory(id, body as Partial<SubCategory>);
    case 'DELETE':
      return deleteCategory(id);
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Get all categories with optional filters.
 */
async function getCategories(params: Record<string, string>): Promise<{
  upperCategories: UpperCategory[];
  subCategories: SubCategory[];
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
    ORDER BY uc.sort_order, sc.sort_order`
  );

  return { upperCategories, subCategories };
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
