// API endpoint for importing transactions in batch
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { getDatabase, initializeDatabase } from '@/lib/db';
import { generateId } from '@/lib/uuid';
import { getExistingFingerprints, generateFingerprint } from '@/lib/csv/duplicate-detector';
import { applyRulesToDescription } from '@/lib/db/rules';
import type { ImportResult } from '@/types/import';

// Validation schema for import transactions
const importTransactionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  description: z.string().min(1).max(500),
  amount: z.number().refine(val => val !== 0, 'Amount cannot be zero'),
  notes: z.string().max(1000).nullable().optional(),
  sub_category_id: z.string().nullable().optional(),
  source_id: z.string().nullable().optional(),
});

const importRequestSchema = z.object({
  transactions: z.array(importTransactionSchema).min(1).max(1000),
  skipDuplicates: z.boolean().optional().default(true),
});

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;
  
  try {
    initializeDatabase();
    
    const body = await request.json();
    const validation = importRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: validation.error.flatten() },
        { status: 400 }
      );
    }
    
    const { transactions, skipDuplicates } = validation.data;
    const db = getDatabase();
    
    // Get date range for duplicate checking
    const dates = transactions.map(t => t.date).sort();
    const startDate = dates[0];
    const endDate = dates[dates.length - 1];
    
    // Get existing fingerprints
    const existingFingerprints = skipDuplicates 
      ? getExistingFingerprints(startDate, endDate)
      : new Set<string>();
    
    const importedFingerprints = new Set<string>();
    const result: ImportResult = {
      success: true,
      imported: 0,
      skipped: 0,
      duplicates: 0,
      autoCategorized: 0,
      errors: [],
    };
    
    // Prepare insert statement (table is "transaction" singular, quoted due to reserved word)
    const insertStmt = db.prepare(`
      INSERT INTO "transaction" (
        id, date, description, amount, notes, sub_category_id, source_id,
        is_split, parent_transaction_id, is_deleted, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, 0, datetime('now'), datetime('now'))
    `);
    
    // Process all transactions within a single database transaction for atomicity
    const importBatch = db.transaction(() => {
      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        
        try {
          // Generate fingerprint for duplicate check
          const fingerprint = generateFingerprint({
            date: tx.date,
            amount: tx.amount,
            description: tx.description,
          });
          
          // Check for duplicates (both in DB and in this import batch)
          if (skipDuplicates) {
            if (existingFingerprints.has(fingerprint)) {
              result.duplicates++;
              result.skipped++;
              continue;
            }
            
            if (importedFingerprints.has(fingerprint)) {
              result.duplicates++;
              result.skipped++;
              continue;
            }
          }
          
          // Determine sub_category_id - apply rules if not already set
          let finalSubCategoryId = tx.sub_category_id || null;
          let wasAutoCategorized = false;

          if (!finalSubCategoryId) {
            // Apply auto-categorization rules
            const matchedCategoryId = applyRulesToDescription(tx.description);
            if (matchedCategoryId) {
              finalSubCategoryId = matchedCategoryId;
              wasAutoCategorized = true;
            }
          }

          // Insert transaction
          const id = generateId();
          insertStmt.run(
            id,
            tx.date,
            tx.description,
            tx.amount,
            tx.notes || null,
            finalSubCategoryId,
            tx.source_id || null
          );

          importedFingerprints.add(fingerprint);
          result.imported++;
          if (wasAutoCategorized) {
            result.autoCategorized++;
          }
        } catch (error) {
          result.errors.push({
            rowIndex: i,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
          result.skipped++;
        }
      }
    });
    
    // Execute the batch import
    importBatch();
    
    // Set success flag
    result.success = result.errors.length === 0;
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error importing transactions:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to import transactions',
        imported: 0,
        skipped: 0,
        duplicates: 0,
        autoCategorized: 0,
        errors: [{ rowIndex: -1, message: 'Server error during import' }]
      },
      { status: 500 }
    );
  }
}

