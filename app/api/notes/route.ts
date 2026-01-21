// API routes for notes operations
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { getAllNotes, getAllTags, createNote } from '@/lib/db/notes';
import type { CreateNoteInput } from '@/types/database';

// GET /api/notes - List all notes or get all tags
export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const { searchParams } = new URL(request.url);
    const tagsOnly = searchParams.get('tagsOnly');
    const search = searchParams.get('search') || undefined;

    if (tagsOnly === 'true') {
      const tags = getAllTags();
      return NextResponse.json({ tags });
    }

    const notes = getAllNotes(search);
    return NextResponse.json({ notes });
  } catch (error) {
    console.error('Error fetching notes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notes' },
      { status: 500 }
    );
  }
}

// POST /api/notes - Create a new note
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const body = await request.json() as CreateNoteInput;

    // Validate title
    if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
      return NextResponse.json(
        { error: 'Title is required' },
        { status: 400 }
      );
    }

    const note = createNote({
      title: body.title.trim(),
      content: body.content || null,
      tags: body.tags || [],
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error('Error creating note:', error);
    return NextResponse.json(
      { error: 'Failed to create note' },
      { status: 500 }
    );
  }
}
