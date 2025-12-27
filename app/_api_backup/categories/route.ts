// API routes for categories
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { 
  getUpperCategories, 
  getSubCategories, 
  createSubCategory 
} from '@/lib/db/categories';
import { createSubCategorySchema } from '@/lib/validations';

// GET /api/categories - List all categories
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    
    const { searchParams } = new URL(request.url);
    const includeDeleted = searchParams.get('includeDeleted') === 'true';
    
    const upperCategories = getUpperCategories();
    const subCategories = getSubCategories(includeDeleted);
    
    // Group sub-categories by upper category
    const grouped = upperCategories.map(upper => ({
      ...upper,
      subCategories: subCategories.filter(sub => sub.upper_category_id === upper.id),
    }));

    return NextResponse.json({ 
      categories: grouped,
      upperCategories,
      subCategories,
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json(
      { error: 'Failed to fetch categories' },
      { status: 500 }
    );
  }
}

// POST /api/categories - Create a new sub-category
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    
    const body = await request.json();
    const validation = createSubCategorySchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const category = createSubCategory(validation.data);
    
    return NextResponse.json({ category }, { status: 201 });
  } catch (error) {
    console.error('Error creating category:', error);
    return NextResponse.json(
      { error: 'Failed to create category' },
      { status: 500 }
    );
  }
}



