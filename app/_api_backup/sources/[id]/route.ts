// API routes for individual source operations
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { 
  getSourceById, 
  updateSource, 
  deleteSource,
  sourceHasTransactions,
  getSourceByName,
} from '@/lib/db/sources';
import { z } from 'zod';

const updateSourceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  sort_order: z.number().int().min(0).optional(),
});

// GET /api/sources/[id] - Get a single source
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    
    const { id } = await params;
    const source = getSourceById(id);
    
    if (!source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ source });
  } catch (error) {
    console.error('Error fetching source:', error);
    return NextResponse.json(
      { error: 'Failed to fetch source' },
      { status: 500 }
    );
  }
}

// PATCH /api/sources/[id] - Update a source
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    
    const { id } = await params;
    const body = await request.json();
    const validation = updateSourceSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const existing = getSourceById(id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    // Check for duplicate name if name is being changed
    if (validation.data.name && validation.data.name !== existing.name) {
      const duplicate = getSourceByName(validation.data.name);
      if (duplicate) {
        return NextResponse.json(
          { error: 'A source with this name already exists' },
          { status: 409 }
        );
      }
    }

    const source = updateSource(id, validation.data);
    
    return NextResponse.json({ source });
  } catch (error) {
    console.error('Error updating source:', error);
    return NextResponse.json(
      { error: 'Failed to update source' },
      { status: 500 }
    );
  }
}

// DELETE /api/sources/[id] - Delete a source
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    
    const { id } = await params;
    const source = getSourceById(id);
    
    if (!source) {
      return NextResponse.json(
        { error: 'Source not found' },
        { status: 404 }
      );
    }

    // Check for transactions - they will be set to source_id = null
    const txCount = sourceHasTransactions(id);
    
    const deleted = deleteSource(id);
    
    if (!deleted) {
      return NextResponse.json(
        { error: 'Failed to delete source' },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true,
      transactionsUpdated: txCount,
    });
  } catch (error) {
    console.error('Error deleting source:', error);
    return NextResponse.json(
      { error: 'Failed to delete source' },
      { status: 500 }
    );
  }
}
