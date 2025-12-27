// API routes for individual category operations
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { 
  getSubCategoryById, 
  getUpperCategoryById,
  updateSubCategory, 
  updateUpperCategory,
  deleteSubCategory,
  hasTransactions,
  reassignTransactions
} from '@/lib/db/categories';
import { updateSubCategorySchema, updateUpperCategorySchema } from '@/lib/validations';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/categories/[id] - Get a single category
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    const { id } = await params;
    
    // Try sub-category first, then upper category
    const subCategory = getSubCategoryById(id);
    if (subCategory) {
      return NextResponse.json({ category: subCategory, type: 'sub' });
    }
    
    const upperCategory = getUpperCategoryById(id);
    if (upperCategory) {
      return NextResponse.json({ category: upperCategory, type: 'upper' });
    }

    return NextResponse.json(
      { error: 'Category not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error fetching category:', error);
    return NextResponse.json(
      { error: 'Failed to fetch category' },
      { status: 500 }
    );
  }
}

// PATCH /api/categories/[id] - Update a category
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    const { id } = await params;
    const body = await request.json();
    
    // Check if it's a sub-category
    const subCategory = getSubCategoryById(id);
    if (subCategory) {
      const validation = updateSubCategorySchema.safeParse(body);
      
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validation.error.flatten() },
          { status: 400 }
        );
      }

      const updated = updateSubCategory(id, validation.data);
      return NextResponse.json({ category: updated, type: 'sub' });
    }
    
    // Check if it's an upper category
    const upperCategory = getUpperCategoryById(id);
    if (upperCategory) {
      const validation = updateUpperCategorySchema.safeParse(body);
      
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validation.error.flatten() },
          { status: 400 }
        );
      }

      const updated = updateUpperCategory(id, validation.data.name);
      return NextResponse.json({ category: updated, type: 'upper' });
    }

    return NextResponse.json(
      { error: 'Category not found' },
      { status: 404 }
    );
  } catch (error) {
    console.error('Error updating category:', error);
    return NextResponse.json(
      { error: 'Failed to update category' },
      { status: 500 }
    );
  }
}

// DELETE /api/categories/[id] - Delete a sub-category
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const reassignTo = searchParams.get('reassignTo');
    
    // Only allow deleting sub-categories, not upper categories
    const subCategory = getSubCategoryById(id);
    if (!subCategory) {
      return NextResponse.json(
        { error: 'Sub-category not found' },
        { status: 404 }
      );
    }
    
    // Check if category has transactions
    if (hasTransactions(id)) {
      if (reassignTo) {
        // Reassign transactions to another category
        const count = reassignTransactions(id, reassignTo === 'null' ? null : reassignTo);
        console.log(`Reassigned ${count} transactions from ${id} to ${reassignTo}`);
      } else {
        return NextResponse.json(
          { 
            error: 'Category has transactions', 
            message: 'Please reassign transactions before deleting or specify a reassignTo category' 
          },
          { status: 400 }
        );
      }
    }

    const success = deleteSubCategory(id);
    
    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete category' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}





