// Duplicate transaction detection utilities
import { getDatabase, initializeDatabase } from '@/lib/db';

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
 * - Remove common noise patterns that vary between transactions
 */
function normalizeDescription(desc: string): string {
  if (!desc) return '';
  
  return desc
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    // Remove common reference patterns
    .replace(/ref[:.]?\s*[\w-]+/gi, '')
    .replace(/reference[:.]?\s*[\w-]+/gi, '')
    .replace(/conf(?:irmation)?[:.]?\s*[\w-]+/gi, '')
    .replace(/auth(?:orization)?[:.]?\s*[\w-]+/gi, '')
    .replace(/trans(?:action)?[:.]?\s*#?\s*[\w-]+/gi, '')
    .replace(/order[:.]?\s*#?\s*[\w-]+/gi, '')
    // Remove card numbers (partial or masked)
    .replace(/\d{16,}/g, '')
    .replace(/x{4,}\d{4}/gi, '') // Masked card numbers like XXXX1234
    .replace(/\*{4,}\d{4}/g, '') // Masked card numbers like ****1234
    // Remove asterisks and other common noise
    .replace(/\*+/g, '')
    .replace(/#+/g, '')
    // Remove dates that might be embedded (MM/DD, DD/MM patterns)
    .replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, '')
    // Remove time patterns
    .replace(/\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?/gi, '')
    // Final cleanup
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Get existing transaction fingerprints from database for a date range
 */
export function getExistingFingerprints(
  startDate: string,
  endDate: string
): Set<string> {
  // Ensure database is initialized before querying
  initializeDatabase();
  const db = getDatabase();
  
  const transactions = db.prepare(`
    SELECT date, amount, description 
    FROM "transaction" 
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

