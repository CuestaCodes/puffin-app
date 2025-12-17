// Duplicate transaction detection utilities
import { getDatabase } from '@/lib/db';

interface TransactionFingerprint {
  date: string;
  amount: number;
  description: string;
}

/**
 * Check if a transaction is a potential duplicate
 * Uses date + amount + normalized description as fingerprint
 */
export function checkDuplicate(
  fingerprint: TransactionFingerprint,
  existingFingerprints: Set<string>
): boolean {
  const key = generateFingerprint(fingerprint);
  return existingFingerprints.has(key);
}

/**
 * Generate a fingerprint string for a transaction
 */
export function generateFingerprint(fingerprint: TransactionFingerprint): string {
  const normalizedDesc = normalizeDescription(fingerprint.description);
  // Round amount to 2 decimal places for comparison
  const normalizedAmount = Math.round(fingerprint.amount * 100) / 100;
  return `${fingerprint.date}|${normalizedAmount}|${normalizedDesc}`;
}

/**
 * Normalize description for comparison
 * - Lowercase
 * - Remove extra whitespace
 * - Remove common noise words
 */
function normalizeDescription(desc: string): string {
  if (!desc) return '';
  
  return desc
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    // Remove common reference numbers and patterns that vary
    .replace(/ref[:.]?\s*\w+/gi, '')
    .replace(/\d{16,}/g, '') // Remove long number sequences (card numbers, etc)
    .replace(/\*+/g, '') // Remove asterisks
    .trim();
}

/**
 * Get existing transaction fingerprints from database for a date range
 */
export function getExistingFingerprints(
  startDate: string,
  endDate: string
): Set<string> {
  const db = getDatabase();
  
  const transactions = db.prepare(`
    SELECT date, amount, description 
    FROM transactions 
    WHERE date BETWEEN ? AND ? 
    AND is_deleted = 0
  `).all(startDate, endDate) as TransactionFingerprint[];
  
  const fingerprints = new Set<string>();
  
  for (const tx of transactions) {
    fingerprints.add(generateFingerprint(tx));
  }
  
  return fingerprints;
}

/**
 * Check multiple transactions for duplicates in a batch
 */
export function checkDuplicatesBatch(
  transactions: TransactionFingerprint[],
  existingFingerprints: Set<string>,
  checkWithinBatch: boolean = true
): boolean[] {
  const results: boolean[] = [];
  const batchFingerprints = new Set<string>();
  
  for (const tx of transactions) {
    const key = generateFingerprint(tx);
    
    // Check against existing database transactions
    let isDuplicate = existingFingerprints.has(key);
    
    // Optionally check against other transactions in the same batch
    if (!isDuplicate && checkWithinBatch) {
      isDuplicate = batchFingerprints.has(key);
    }
    
    results.push(isDuplicate);
    batchFingerprints.add(key);
  }
  
  return results;
}

/**
 * Get the date range from a list of date strings
 */
export function getDateRange(dates: (string | null)[]): { start: string; end: string } | null {
  const validDates = dates.filter((d): d is string => d !== null && d !== '');
  
  if (validDates.length === 0) {
    return null;
  }
  
  const sortedDates = validDates.sort();
  
  return {
    start: sortedDates[0],
    end: sortedDates[sortedDates.length - 1],
  };
}

