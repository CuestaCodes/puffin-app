/**
 * Smart paste parser for extracting transactions from copied PDF/table content
 *
 * Handles various formats:
 * - Tab-separated values (most common from PDF viewers)
 * - Multiple-space separated values
 * - Fixed-width columns
 * - Multi-line descriptions
 */

import type { CSVParseResult, ColumnMapping } from '@/types/import';

interface ParseOptions {
  /** Minimum spaces to consider as column delimiter */
  minSpaces?: number;
  /** Whether to try merging multi-line descriptions */
  mergeMultiLine?: boolean;
}

interface ColumnAnalysis {
  index: number;
  type: 'date' | 'amount' | 'text' | 'unknown';
  confidence: number;
  samples: string[];
}

/**
 * Parse pasted text and extract tabular data
 */
export function parsePastedText(text: string, options: ParseOptions = {}): CSVParseResult {
  const { minSpaces = 2, mergeMultiLine = true } = options;

  // Normalize line endings
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into lines and filter empty ones
  const lines = normalizedText.split('\n').filter(line => line.trim() !== '');

  if (lines.length === 0) {
    throw new Error('No data found in pasted text');
  }

  // Detect delimiter type
  const delimiter = detectDelimiter(lines);

  // Parse lines into columns
  let rows = lines.map(line => splitLine(line, delimiter, minSpaces));

  // Normalize column count (some rows may have different column counts)
  const maxColumns = Math.max(...rows.map(r => r.length));
  rows = rows.map(row => {
    while (row.length < maxColumns) {
      row.push('');
    }
    return row;
  });

  // Try to merge multi-line entries if enabled
  if (mergeMultiLine && rows.length > 1) {
    rows = mergeMultiLineRows(rows);
  }

  // Filter out header rows and summary rows
  rows = filterNonTransactionRows(rows);

  if (rows.length === 0) {
    throw new Error('No transaction data found. Make sure you copied a transaction table.');
  }

  // Generate synthetic headers based on detected column types
  const columnAnalysis = analyzeColumns(rows);
  const headers = generateHeaders(columnAnalysis);

  return {
    headers,
    rows,
    totalRows: rows.length,
    encoding: 'UTF-8',
  };
}

/**
 * Detect the most likely delimiter in the pasted content
 */
function detectDelimiter(lines: string[]): 'tab' | 'spaces' | 'pipe' | 'mixed' {
  let tabCount = 0;
  let multiSpaceCount = 0;
  let pipeCount = 0;

  for (const line of lines.slice(0, Math.min(10, lines.length))) {
    if (line.includes('\t')) tabCount++;
    if (/  {2,}/.test(line)) multiSpaceCount++;
    if (line.includes('|')) pipeCount++;
  }

  const maxCount = Math.max(tabCount, multiSpaceCount, pipeCount);

  if (tabCount === maxCount && tabCount > 0) return 'tab';
  if (pipeCount === maxCount && pipeCount > 0) return 'pipe';
  if (multiSpaceCount > 0) return 'spaces';

  return 'mixed';
}

/**
 * Split a line into columns based on detected delimiter
 */
function splitLine(line: string, delimiter: 'tab' | 'spaces' | 'pipe' | 'mixed', minSpaces: number): string[] {
  let parts: string[];

  switch (delimiter) {
    case 'tab':
      parts = line.split('\t');
      break;
    case 'pipe':
      parts = line.split('|');
      break;
    case 'spaces':
      // Split on 2+ spaces
      parts = line.split(new RegExp(`\\s{${minSpaces},}`));
      break;
    case 'mixed':
    default:
      // Try tab first, then spaces
      if (line.includes('\t')) {
        parts = line.split('\t');
      } else {
        parts = line.split(new RegExp(`\\s{${minSpaces},}`));
      }
  }

  return parts.map(p => p.trim()).filter((p, i, arr) => {
    // Keep empty strings in the middle, but remove leading/trailing empty
    if (p === '') {
      return i > 0 && i < arr.length - 1;
    }
    return true;
  });
}

/**
 * Merge rows that appear to be continuation of previous row
 * (common when PDF tables have wrapped text)
 */
function mergeMultiLineRows(rows: string[][]): string[][] {
  const merged: string[][] = [];
  let current: string[] | null = null;

  for (const row of rows) {
    // Check if this looks like a continuation line
    const isContinuation = isContinuationRow(row, current);

    if (isContinuation && current) {
      // Merge with previous row - typically the description column
      const descIndex = findDescriptionColumn(current);
      if (descIndex !== -1) {
        current[descIndex] = (current[descIndex] + ' ' + row.join(' ')).trim();
      }
    } else {
      if (current) {
        merged.push(current);
      }
      current = [...row];
    }
  }

  if (current) {
    merged.push(current);
  }

  return merged;
}

/**
 * Check if a row looks like a continuation of the previous row
 */
function isContinuationRow(row: string[], prevRow: string[] | null): boolean {
  if (!prevRow) return false;

  // If row has fewer columns and no date/amount patterns, likely continuation
  if (row.length < prevRow.length * 0.5) {
    const hasDate = row.some(cell => isDateLike(cell));
    const hasAmount = row.some(cell => isAmountLike(cell));
    return !hasDate && !hasAmount;
  }

  // If first cell is empty but previous had content, might be continuation
  if (row[0] === '' && prevRow[0] !== '') {
    return true;
  }

  return false;
}

/**
 * Find the most likely description column index
 */
function findDescriptionColumn(row: string[]): number {
  let bestIndex = -1;
  let bestLength = 0;

  for (let i = 0; i < row.length; i++) {
    const cell = row[i];
    // Description is usually the longest text that's not a date or amount
    if (!isDateLike(cell) && !isAmountLike(cell) && cell.length > bestLength) {
      bestLength = cell.length;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Filter out rows that don't look like transactions
 */
function filterNonTransactionRows(rows: string[][]): string[][] {
  return rows.filter(row => {
    // Must have at least 2 non-empty cells
    const nonEmpty = row.filter(cell => cell.trim() !== '');
    if (nonEmpty.length < 2) return false;

    // Should have either a date-like or amount-like value
    const hasDate = row.some(cell => isDateLike(cell));
    const hasAmount = row.some(cell => isAmountLike(cell));

    // Filter out header rows (usually contain "Date", "Amount", etc.)
    const lowerRow = row.map(c => c.toLowerCase());
    const isHeader = lowerRow.some(c =>
      ['date', 'description', 'amount', 'balance', 'debit', 'credit', 'transaction'].includes(c)
    );

    // Filter out summary rows
    const isSummary = lowerRow.some(c =>
      c.includes('total') || c.includes('balance') || c.includes('opening') || c.includes('closing')
    );

    return (hasDate || hasAmount) && !isHeader && !isSummary;
  });
}

/**
 * Analyze columns to detect their types
 */
function analyzeColumns(rows: string[][]): ColumnAnalysis[] {
  if (rows.length === 0) return [];

  const numColumns = rows[0].length;
  const analysis: ColumnAnalysis[] = [];

  for (let col = 0; col < numColumns; col++) {
    const samples = rows.map(row => row[col] || '').filter(s => s.trim() !== '');
    const type = detectColumnType(samples);

    analysis.push({
      index: col,
      type: type.type,
      confidence: type.confidence,
      samples: samples.slice(0, 5),
    });
  }

  return analysis;
}

/**
 * Detect the type of a column based on sample values
 */
function detectColumnType(samples: string[]): { type: 'date' | 'amount' | 'text' | 'unknown'; confidence: number } {
  if (samples.length === 0) {
    return { type: 'unknown', confidence: 0 };
  }

  let dateCount = 0;
  let amountCount = 0;
  let textCount = 0;

  for (const sample of samples) {
    if (isDateLike(sample)) dateCount++;
    else if (isAmountLike(sample)) amountCount++;
    else if (sample.length > 3) textCount++;
  }

  const total = samples.length;
  const dateRatio = dateCount / total;
  const amountRatio = amountCount / total;
  const textRatio = textCount / total;

  if (dateRatio > 0.7) return { type: 'date', confidence: dateRatio };
  if (amountRatio > 0.7) return { type: 'amount', confidence: amountRatio };
  if (textRatio > 0.5) return { type: 'text', confidence: textRatio };

  return { type: 'unknown', confidence: 0.3 };
}

/**
 * Check if a string looks like a date
 */
export function isDateLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Common date patterns
  const datePatterns = [
    /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}$/, // DD/MM/YYYY, MM/DD/YYYY, etc.
    /^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}$/, // YYYY-MM-DD
    /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}$/, // 01 Jan 2024
    /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}$/, // Jan 01, 2024
    /^\d{1,2}[A-Za-z]{3}\d{2,4}$/, // 01Jan2024
  ];

  return datePatterns.some(pattern => pattern.test(trimmed));
}

/**
 * Check if a string looks like an amount
 */
export function isAmountLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  // Remove currency symbols and whitespace
  const cleaned = trimmed.replace(/[$£€¥₹R\s]/g, '');

  // Common amount patterns
  const amountPatterns = [
    /^-?\d{1,3}(,\d{3})*(\.\d{1,2})?$/, // 1,234.56
    /^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$/, // 1.234,56 (European)
    /^-?\d+(\.\d{1,2})?$/, // Simple number
    /^\(\d{1,3}(,\d{3})*(\.\d{1,2})?\)$/, // (1,234.56) - negative
    /^-?\d+(\.\d{1,2})?\s*(DR|CR)$/i, // With DR/CR indicator
  ];

  return amountPatterns.some(pattern => pattern.test(cleaned));
}

/**
 * Generate header names based on column analysis
 */
function generateHeaders(analysis: ColumnAnalysis[]): string[] {
  const headers: string[] = [];
  let dateCount = 0;
  let amountCount = 0;
  let textCount = 0;

  for (const col of analysis) {
    switch (col.type) {
      case 'date':
        dateCount++;
        headers.push(dateCount === 1 ? 'Date' : `Date ${dateCount}`);
        break;
      case 'amount':
        amountCount++;
        headers.push(amountCount === 1 ? 'Amount' : `Amount ${amountCount}`);
        break;
      case 'text':
        textCount++;
        headers.push(textCount === 1 ? 'Description' : `Text ${textCount}`);
        break;
      default:
        headers.push(`Column ${col.index + 1}`);
    }
  }

  return headers;
}

/**
 * Smart column mapping that considers column types
 */
export function detectPasteColumnMapping(headers: string[], rows: string[][]): ColumnMapping | null {
  const analysis = analyzeColumns(rows);

  let dateIndex = -1;
  let amountIndex = -1;
  let descIndex = -1;

  // Find best candidates for each required field
  for (const col of analysis) {
    if (col.type === 'date' && dateIndex === -1) {
      dateIndex = col.index;
    } else if (col.type === 'amount' && amountIndex === -1) {
      amountIndex = col.index;
    } else if (col.type === 'text' && descIndex === -1) {
      descIndex = col.index;
    }
  }

  // Fallback: if we have amount but no text, use another column for description
  if (amountIndex !== -1 && descIndex === -1) {
    for (let i = 0; i < analysis.length; i++) {
      if (i !== dateIndex && i !== amountIndex) {
        descIndex = i;
        break;
      }
    }
  }

  if (dateIndex === -1 && amountIndex === -1) {
    return null;
  }

  // Build ignore list
  const ignore = headers
    .map((_, idx) => idx)
    .filter(idx => idx !== dateIndex && idx !== descIndex && idx !== amountIndex);

  return {
    date: dateIndex,
    description: descIndex,
    amount: amountIndex,
    ignore,
  };
}

/**
 * Parse amount string to number
 */
export function parseAmount(value: string): number | null {
  if (!value || !value.trim()) return null;

  let cleaned = value.trim();

  // Check for DR/CR indicators
  const isDebit = /DR$/i.test(cleaned);
  const isCredit = /CR$/i.test(cleaned);
  cleaned = cleaned.replace(/\s*(DR|CR)$/i, '');

  // Check for parentheses (negative)
  const isNegativeParens = /^\(.*\)$/.test(cleaned);
  if (isNegativeParens) {
    cleaned = cleaned.slice(1, -1);
  }

  // Remove currency symbols
  cleaned = cleaned.replace(/[$£€¥₹R]/g, '');

  // Remove thousands separators (detect format first)
  const hasCommaDecimal = /\d,\d{1,2}$/.test(cleaned);
  if (hasCommaDecimal) {
    // European format: 1.234,56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // US/UK format: 1,234.56
    cleaned = cleaned.replace(/,/g, '');
  }

  // Remove any remaining whitespace
  cleaned = cleaned.replace(/\s/g, '');

  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  // Apply sign based on indicators
  if (isNegativeParens || isDebit) {
    return -Math.abs(num);
  }
  if (isCredit) {
    return Math.abs(num);
  }

  return num;
}
