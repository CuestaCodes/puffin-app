// API endpoint for undoing a transaction import batch
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { getDatabase, initializeDatabase } from '@/lib/db';
import type { UndoImportInfo, UndoImportResult } from '@/types/import';

// Validation schema for undo import request
const undoImportSchema = z.object({
  batchId: z.string().uuid(),
  confirm: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    initializeDatabase();

    const body = await request.json();
    const validation = undoImportSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { batchId, confirm } = validation.data;
    const db = getDatabase();

    // Get info about the batch
    const batchInfo = db.prepare(`
      SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN updated_at > created_at THEN 1 ELSE 0 END) as modified_count,
        SUM(CASE WHEN is_deleted = 1 THEN 1 ELSE 0 END) as deleted_count
      FROM "transaction"
      WHERE import_batch_id = ?
    `).get(batchId) as { total_count: number; modified_count: number; deleted_count: number } | undefined;

    if (!batchInfo || batchInfo.total_count === 0) {
      return NextResponse.json(
        { error: 'Import batch not found' },
        { status: 404 }
      );
    }

    const activeCount = batchInfo.total_count - batchInfo.deleted_count;

    // If not confirming, just return the batch info
    if (!confirm) {
      const info: UndoImportInfo = {
        batchId,
        totalCount: batchInfo.total_count,
        modifiedCount: batchInfo.modified_count,
        alreadyDeletedCount: batchInfo.deleted_count,
        canUndo: activeCount > 0,
      };
      return NextResponse.json(info);
    }

    // Confirm = true, perform the undo (soft delete)
    if (activeCount === 0) {
      return NextResponse.json(
        { error: 'All transactions in this batch are already deleted' },
        { status: 400 }
      );
    }

    // Soft delete all active transactions in the batch AND their split children
    // Use a transaction to ensure atomicity
    const undoTransaction = db.transaction(() => {
      // First, soft delete split children of transactions in this batch
      const childResult = db.prepare(`
        UPDATE "transaction"
        SET is_deleted = 1, updated_at = datetime('now')
        WHERE parent_transaction_id IN (
          SELECT id FROM "transaction" WHERE import_batch_id = ?
        ) AND is_deleted = 0
      `).run(batchId);

      // Then, soft delete the batch transactions themselves
      const batchResult = db.prepare(`
        UPDATE "transaction"
        SET is_deleted = 1, updated_at = datetime('now')
        WHERE import_batch_id = ? AND is_deleted = 0
      `).run(batchId);

      return batchResult.changes + childResult.changes;
    });

    const totalUndone = undoTransaction();

    const undoResult: UndoImportResult = {
      success: true,
      undoneCount: totalUndone,
      message: `Successfully undone ${totalUndone} transaction${totalUndone !== 1 ? 's' : ''}`,
    };

    return NextResponse.json(undoResult);
  } catch (error) {
    console.error('Error undoing import:', error);
    return NextResponse.json(
      { error: 'Failed to undo import' },
      { status: 500 }
    );
  }
}
