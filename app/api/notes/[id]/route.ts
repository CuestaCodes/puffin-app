// API routes for individual note operations
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import { getNoteById, updateNote, deleteNote } from '@/lib/db/notes';
import type { UpdateNoteInput } from '@/types/database';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/notes/[id] - Get a single note
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    const { id } = await params;

    const note = getNoteById(id);
    if (!note) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ note });
  } catch (error) {
    console.error('Error fetching note:', error);
    return NextResponse.json(
      { error: 'Failed to fetch note' },
      { status: 500 }
    );
  }
}

// PATCH /api/notes/[id] - Update a note
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    const { id } = await params;

    const body = await request.json() as UpdateNoteInput;

    // Validate title if provided
    if (body.title !== undefined && (!body.title || typeof body.title !== 'string' || !body.title.trim())) {
      return NextResponse.json(
        { error: 'Title cannot be empty' },
        { status: 400 }
      );
    }

    const note = updateNote(id, {
      title: body.title?.trim(),
      content: body.content,
      tags: body.tags,
    });

    if (!note) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ note });
  } catch (error) {
    console.error('Error updating note:', error);
    return NextResponse.json(
      { error: 'Failed to update note' },
      { status: 500 }
    );
  }
}

// DELETE /api/notes/[id] - Soft delete a note
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();
    const { id } = await params;

    const success = deleteNote(id);
    if (!success) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting note:', error);
    return NextResponse.json(
      { error: 'Failed to delete note' },
      { status: 500 }
    );
  }
}
