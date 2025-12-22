// API routes for budget templates
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { 
  createBudgetTemplate,
  getBudgetTemplates,
  deleteBudgetTemplate,
  applyBudgetTemplate
} from '@/lib/db/budgets';

// GET /api/budgets/templates - Get all templates
export async function GET(_request: NextRequest) {
  const { isAuthenticated, response } = await requireAuth();
  if (!isAuthenticated) return response;

  try {
    initializeDatabase();
    const templates = getBudgetTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}

// POST /api/budgets/templates - Create or apply a template
export async function POST(request: NextRequest) {
  const { isAuthenticated, response } = await requireAuth();
  if (!isAuthenticated) return response;

  try {
    initializeDatabase();
    const body = await request.json();
    
    // Handle apply operation
    if (body.action === 'apply') {
      const { templateId, year, month } = body;
      
      if (!templateId || !year || !month) {
        return NextResponse.json(
          { error: 'Missing required fields for apply operation' },
          { status: 400 }
        );
      }
      
      const appliedCount = applyBudgetTemplate(templateId, year, month);
      return NextResponse.json({ 
        success: true, 
        appliedCount,
        message: `Applied template to ${appliedCount} categories`
      });
    }
    
    // Handle create operation
    const { name, year, month } = body;
    
    if (!name || !year || !month) {
      return NextResponse.json(
        { error: 'Missing required fields: name, year, month' },
        { status: 400 }
      );
    }
    
    const template = createBudgetTemplate(name, year, month);
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('Error with template operation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process template' },
      { status: 500 }
    );
  }
}

// DELETE /api/budgets/templates - Delete a template
export async function DELETE(request: NextRequest) {
  const { isAuthenticated, response } = await requireAuth();
  if (!isAuthenticated) return response;

  try {
    initializeDatabase();
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('id');
    
    if (!templateId) {
      return NextResponse.json(
        { error: 'Template ID is required' },
        { status: 400 }
      );
    }
    
    const deleted = deleteBudgetTemplate(templateId);
    if (!deleted) {
      return NextResponse.json(
        { error: 'Template not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json(
      { error: 'Failed to delete template' },
      { status: 500 }
    );
  }
}

