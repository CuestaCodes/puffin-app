// API routes for sources
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { 
  getSources, 
  createSource,
  getSourceByName,
} from '@/lib/db/sources';
import { z } from 'zod';

const createSourceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
});

// GET /api/sources - List all sources
export async function GET() {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    
    const sources = getSources();

    return NextResponse.json({ sources });
  } catch (error) {
    console.error('Error fetching sources:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sources' },
      { status: 500 }
    );
  }
}

// POST /api/sources - Create a new source
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    
    const body = await request.json();
    const validation = createSourceSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Check for duplicate name
    const existing = getSourceByName(validation.data.name);
    if (existing) {
      return NextResponse.json(
        { error: 'A source with this name already exists' },
        { status: 409 }
      );
    }

    const source = createSource(validation.data.name);
    
    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    console.error('Error creating source:', error);
    return NextResponse.json(
      { error: 'Failed to create source' },
      { status: 500 }
    );
  }
}
