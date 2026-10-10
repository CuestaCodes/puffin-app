// CSV parsing utilities using papaparse
import Papa from 'papaparse';
import type { CSVParseResult, ColumnMapping } from '@/types/import';
import { amountRoleFromHeader, parseAmount } from '@/lib/import-amount';
import { parseDate } from './date-parser';

export interface ParseCSVOptions {
  /** Whether the first row contains headers (default: true) */
  hasHeaders?: boolean;
}

/**
 * Whether a CSV's first row is column names rather than a transaction: it has text in at
 * least two cells and nothing that reads as a date or an amount. Lets the wizard pre-tick
 * "First row contains column headers" — header names are what column detection reads, so
 * an unticked box quietly falls back to guessing by position.
 */
export function looksLikeHeaderRow(row: string[]): boolean {
  const cells = row.map(cell => (cell ?? '').trim()).filter(cell => cell !== '');
  if (cells.length < 2) return false;
  return cells.every(cell => parseAmount(cell) === null && parseDate(cell, 'auto') === null);
}

/**
 * Parse a CSV file and return structured data
 */
export async function parseCSV(file: File, options: ParseCSVOptions = {}): Promise<CSVParseResult> {
  const { hasHeaders = true } = options;

  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      complete: (results) => {
        const data = results.data as string[][];

        // Filter out completely empty rows
        const filteredData = data.filter(row =>
          row.some(cell => cell && cell.trim() !== '')
        );

        if (filteredData.length === 0) {
          reject(new Error('CSV file is empty'));
          return;
        }

        let headers: string[];
        let rows: string[][];

        if (hasHeaders) {
          // First row is headers
          headers = filteredData[0].map(h => h?.trim() || '');
          rows = filteredData.slice(1);
        } else {
          // No headers - generate placeholder headers and keep all rows
          const columnCount = filteredData[0].length;
          headers = Array.from({ length: columnCount }, (_, i) => `Column ${i + 1}`);
          rows = filteredData;
        }

        resolve({
          headers,
          rows,
          totalRows: rows.length,
          encoding: 'UTF-8', // papaparse handles encoding automatically
        });
      },
      error: (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      },
      skipEmptyLines: true,
      encoding: 'UTF-8',
    });
  });
}

/**
 * Parse CSV from string content
 */
export function parseCSVString(content: string): CSVParseResult {
  const results = Papa.parse(content, {
    skipEmptyLines: true,
  });
  
  const data = results.data as string[][];
  
  if (data.length === 0) {
    throw new Error('CSV content is empty');
  }
  
  const headers = data[0].map(h => h?.trim() || '');
  const rows = data.slice(1);
  
  return {
    headers,
    rows,
    totalRows: rows.length,
    encoding: 'UTF-8',
  };
}

/**
 * Auto-detect column mapping based on header names.
 *
 * Amounts come from a single Amount column when one is named, otherwise from Debit and
 * Credit columns (or Withdrawals/Deposits and the like). Debit and Credit used to be
 * accepted as names for the single Amount column, which imported every withdrawal as
 * income and rejected every deposit row.
 */
export function detectColumnMapping(headers: string[]): ColumnMapping | null {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());

  // Common patterns for date columns
  const datePatterns = ['date', 'transaction date', 'trans date', 'posted', 'posted date', 'value date'];
  // Common patterns for description columns
  const descPatterns = ['description', 'desc', 'memo', 'narrative', 'details', 'transaction', 'merchant', 'payee'];
  // Common patterns for a single signed amount column
  const amountPatterns = ['amount', 'value', 'sum', 'money'];

  let dateIndex = -1;
  let descIndex = -1;
  let amountIndex = -1;

  // Find date column
  for (const pattern of datePatterns) {
    const foundIdx = lowerHeaders.findIndex(h => h.includes(pattern));
    if (foundIdx !== -1) {
      dateIndex = foundIdx;
      break;
    }
  }

  // Find description column (exclude already-mapped date column)
  for (const pattern of descPatterns) {
    const foundIdx = lowerHeaders.findIndex((h, i) => h.includes(pattern) && i !== dateIndex);
    if (foundIdx !== -1) {
      descIndex = foundIdx;
      break;
    }
  }

  // Columns whose header names a direction or a balance (exclude already-mapped columns)
  const roles = lowerHeaders.map((h, i) =>
    i === dateIndex || i === descIndex ? null : amountRoleFromHeader(h)
  );
  const debitIndex = roles.indexOf('debit');
  const creditIndex = roles.indexOf('credit');
  const balanceIndex = roles.indexOf('balance');

  // Find a single amount column: one named as an amount without a direction, so
  // "Debit Amount" is a debit column and not this
  for (const pattern of amountPatterns) {
    const foundIdx = lowerHeaders.findIndex((h, i) =>
      h.includes(pattern) && i !== dateIndex && i !== descIndex && roles[i] === null
    );
    if (foundIdx !== -1) {
      amountIndex = foundIdx;
      break;
    }
  }

  // Separate debit/credit columns, when no single Amount column carries both directions
  if (amountIndex === -1 && (debitIndex !== -1 || creditIndex !== -1)) {
    const mapped = [dateIndex, descIndex, debitIndex, creditIndex, balanceIndex];
    const mapping: ColumnMapping = {
      // Left unmapped rather than guessed by position: the guess could land on an amount column
      date: dateIndex,
      description: descIndex,
      amount: -1,
      ignore: headers.map((_, idx) => idx).filter(idx => !mapped.includes(idx)),
    };
    if (debitIndex !== -1) mapping.debit = debitIndex;
    if (creditIndex !== -1) mapping.credit = creditIndex;
    if (balanceIndex !== -1) mapping.balance = balanceIndex;
    return mapping;
  }

  // If we couldn't detect all required columns, try positional fallback
  if (dateIndex === -1 || descIndex === -1 || amountIndex === -1) {
    // Common CSV formats: Date, Description, Amount or Date, Amount, Description
    if (headers.length >= 3) {
      return {
        date: dateIndex === -1 ? 0 : dateIndex,
        description: descIndex === -1 ? 1 : descIndex,
        amount: amountIndex === -1 ? 2 : amountIndex,
        ignore: [],
      };
    }
    return null;
  }

  // Build ignore list (all columns not mapped)
  const ignore = headers
    .map((_, idx) => idx)
    .filter(idx => idx !== dateIndex && idx !== descIndex && idx !== amountIndex && idx !== balanceIndex);

  const mapping: ColumnMapping = {
    date: dateIndex,
    description: descIndex,
    amount: amountIndex,
    ignore,
  };
  if (balanceIndex !== -1) mapping.balance = balanceIndex;
  return mapping;
}

/**
 * Validate that a file is a CSV
 */
export function isValidCSVFile(file: File): boolean {
  const validTypes = ['text/csv', 'application/vnd.ms-excel', 'text/plain'];
  const validExtensions = ['.csv', '.txt'];
  
  const hasValidType = validTypes.includes(file.type) || file.type === '';
  const hasValidExtension = validExtensions.some(ext => 
    file.name.toLowerCase().endsWith(ext)
  );
  
  return hasValidType || hasValidExtension;
}

/**
 * Get file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

