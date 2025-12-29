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
  /** For amount columns: 'debit', 'credit', 'balance', or 'single' */
  amountRole?: 'debit' | 'credit' | 'balance' | 'single';
  confidence: number;
  samples: string[];
  /** Original header name if detected from paste */
  headerHint?: string;
}

/**
 * Parse pasted text and extract tabular data
 */
export function parsePastedText(text: string, options: ParseOptions = {}): CSVParseResult {
  const { minSpaces = 2, mergeMultiLine = true } = options;

  // Normalize line endings
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Split into lines and filter empty ones
  let lines = normalizedText.split('\n').filter(line => line.trim() !== '');

  if (lines.length === 0) {
    throw new Error('No data found in pasted text');
  }

  // Pre-process: Try to merge lines that belong to same transaction
  // Many PDFs split transactions across lines (date+desc on one, amounts on next)
  lines = preprocessMultiLineTransactions(lines);

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

  // Extract header row before filtering (if present)
  const { headerRow, dataRows } = extractHeaderRow(rows);

  // Filter out summary rows from data
  rows = filterNonTransactionRows(dataRows);

  if (rows.length === 0) {
    throw new Error('No transaction data found. Make sure you copied a transaction table.');
  }

  // Generate headers based on detected column types and original headers
  const columnAnalysis = analyzeColumns(rows, headerRow);
  const headers = generateHeaders(columnAnalysis, headerRow);

  return {
    headers,
    rows,
    totalRows: rows.length,
    encoding: 'UTF-8',
  };
}

/**
 * Preprocess lines to merge multi-line transactions
 * Many PDFs split transactions like:
 *   "6 Dec 25 ACCOUNT TFR ADJUSTMENT"
 *   "ADDITIONAL DESCRIPTION TEXT"
 *   "52,243.23 52,243.23"
 * This combines them into single lines
 */
function preprocessMultiLineTransactions(lines: string[]): string[] {
  const result: string[] = [];
  let currentLine = '';

  // Check if a line starts with a date pattern
  const startsWithDate = (line: string): boolean => {
    const trimmed = line.trim();
    return (
      /^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}/.test(trimmed) || // DD/MM/YYYY
      /^\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/.test(trimmed) ||   // YYYY-MM-DD
      /^\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4}/.test(trimmed) ||     // 6 Dec 25
      /^[A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4}/.test(trimmed)      // Dec 6, 25
    );
  };

  // Check if a line looks like it's just amounts (end of transaction)
  const isAmountOnlyLine = (line: string): boolean => {
    const trimmed = line.trim();
    // Line with mostly numbers/currency that looks like amounts
    const cleaned = trimmed.replace(/[$£€¥₹,.\s\-()DR CR]/gi, '');
    const isNumeric = /^\d+$/.test(cleaned);
    const hasAmountPattern = /\d+[.,]\d{2}/.test(trimmed);
    return isNumeric && hasAmountPattern && trimmed.length < 50;
  };

  // Check if line is a header or summary (to preserve separately)
  const isHeaderOrSummary = (line: string): boolean => {
    const lower = line.toLowerCase();
    return (
      /^(date|transaction|withdrawals|deposits|balance)/.test(lower) ||
      /^opening\s+balance/.test(lower) ||
      /^closing\s+balance/.test(lower) ||
      /^transaction\s+total/.test(lower)
    );
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (isHeaderOrSummary(line)) {
      // Push any accumulated line first
      if (currentLine) {
        result.push(currentLine);
        currentLine = '';
      }
      result.push(line);
      continue;
    }

    if (startsWithDate(line)) {
      // This starts a new transaction
      if (currentLine) {
        result.push(currentLine);
      }
      currentLine = line;
    } else if (isAmountOnlyLine(line)) {
      // This is the amounts line - append to current and finalize
      if (currentLine) {
        currentLine = currentLine + '  ' + line; // Use double space as delimiter
        result.push(currentLine);
        currentLine = '';
      } else {
        result.push(line);
      }
    } else if (currentLine) {
      // Continuation of description - append
      currentLine = currentLine + ' ' + line;
    } else {
      // Standalone line (might be description without date)
      result.push(line);
    }
  }

  // Don't forget the last line
  if (currentLine) {
    result.push(currentLine);
  }

  return result;
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
 * Extract date from the beginning of first cell if it contains both date and text
 * e.g., "6 Dec 25 ACCOUNT TFR" → ["6 Dec 25", "ACCOUNT TFR"]
 */
function extractDateFromFirstCell(parts: string[]): string[] {
  if (parts.length === 0) return parts;

  const first = parts[0].trim();

  // Date patterns that might be at the start of a cell
  const datePatterns = [
    /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})\s+(.+)$/,     // DD/MM/YYYY ...
    /^(\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\s+(.+)$/,       // YYYY-MM-DD ...
    /^(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\s+(.+)$/,         // 6 Dec 25 ...
    /^([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{2,4})\s+(.+)$/,       // Dec 6, 25 ...
    /^(\d{1,2}[A-Za-z]{3}\d{2,4})\s+(.+)$/,                 // 06Dec25 ...
  ];

  for (const pattern of datePatterns) {
    const match = first.match(pattern);
    if (match) {
      // Found a date at the start - split it out
      return [match[1], match[2], ...parts.slice(1)];
    }
  }

  return parts;
}

/**
 * Split amounts from the last cell if it contains trailing amounts
 * Handles both:
 * - Pure amounts: "52,243.23 52,243.23" → ["52,243.23", "52,243.23"]
 * - Text + amounts: "TRANSFER 0064897267WL01 1,427.00 52,243.23" → ["TRANSFER 0064897267WL01", "1,427.00", "52,243.23"]
 */
function splitAmountsInLastCell(parts: string[]): string[] {
  if (parts.length === 0) return parts;

  const last = parts[parts.length - 1].trim();

  // Pattern to match amounts (with optional currency, commas, decimals)
  const amountPattern = /[$£€¥₹]?[\d,]+\.\d{2}(?:\s*(?:DR|CR))?/gi;

  // Find all amounts in the last cell
  const amounts = last.match(amountPattern);

  if (amounts && amounts.length >= 1) {
    // Find where the first amount starts
    const firstAmountIndex = last.search(amountPattern);

    if (firstAmountIndex > 0) {
      // There's text before the amounts - extract it as description
      const textPart = last.substring(0, firstAmountIndex).trim();
      if (textPart) {
        return [...parts.slice(0, -1), textPart, ...amounts.map(a => a.trim())];
      }
    } else if (amounts.length > 1) {
      // Starts with amounts and has multiple - split them
      return [...parts.slice(0, -1), ...amounts.map(a => a.trim())];
    }
  }

  return parts;
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

  // Post-process: if first cell contains a date at the start, extract it
  if (parts.length > 0) {
    parts = extractDateFromFirstCell(parts);
  }

  // Post-process: if last cell contains multiple amounts, split them
  if (parts.length > 0) {
    parts = splitAmountsInLastCell(parts);
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
 * Extract header row from data if present
 * Returns the header row (if found) and remaining data rows
 */
function extractHeaderRow(rows: string[][]): { headerRow: string[] | null; dataRows: string[][] } {
  if (rows.length === 0) {
    return { headerRow: null, dataRows: rows };
  }

  const headerWords = ['date', 'description', 'amount', 'balance', 'debit', 'credit', 'transaction', 'withdrawals', 'deposits', 'details', 'particulars'];

  // Check first few rows for header pattern
  for (let i = 0; i < Math.min(3, rows.length); i++) {
    const row = rows[i];
    const lowerRow = row.map(c => c.toLowerCase().trim());
    const headerMatches = lowerRow.filter(c => headerWords.includes(c)).length;

    // Also check for partial matches (e.g., "Transaction Date" contains "date")
    const partialMatches = lowerRow.filter(c =>
      headerWords.some(hw => c.includes(hw))
    ).length;

    if (headerMatches >= 2 || partialMatches >= 2) {
      return {
        headerRow: row,
        dataRows: [...rows.slice(0, i), ...rows.slice(i + 1)],
      };
    }
  }

  return { headerRow: null, dataRows: rows };
}

/**
 * Filter out rows that don't look like transactions (excluding headers, already extracted)
 */
function filterNonTransactionRows(rows: string[][]): string[][] {
  return rows.filter(row => {
    // Must have at least 2 non-empty cells
    const nonEmpty = row.filter(cell => cell.trim() !== '');
    if (nonEmpty.length < 2) return false;

    // Should have either a date-like or amount-like value
    const hasDate = row.some(cell => isDateLike(cell));
    const hasAmount = row.some(cell => isAmountLike(cell));

    // Filter out summary rows - be strict: only match if cell STARTS with summary words
    // This avoids filtering "ESTABLISH TRANSFER BALANCE" as a summary
    const lowerRow = row.map(c => c.toLowerCase().trim());
    const isSummary = lowerRow.some(c =>
      /^(opening\s+balance|closing\s+balance|transaction\s+total|total[s]?\s*[:/]?$|^balance\s+brought|^balance\s+carried)/i.test(c)
    );

    return (hasDate || hasAmount) && !isSummary;
  });
}

/**
 * Analyze columns to detect their types
 */
function analyzeColumns(rows: string[][], headerRow: string[] | null): ColumnAnalysis[] {
  if (rows.length === 0) return [];

  const numColumns = rows[0].length;
  const analysis: ColumnAnalysis[] = [];

  for (let col = 0; col < numColumns; col++) {
    const samples = rows.map(row => row[col] || '').filter(s => s.trim() !== '');
    const type = detectColumnType(samples);
    const headerHint = headerRow && headerRow[col] ? headerRow[col].trim() : undefined;

    // Determine amount role from header hint
    let amountRole: 'debit' | 'credit' | 'balance' | 'single' | undefined;
    if (type.type === 'amount' && headerHint) {
      amountRole = detectAmountRole(headerHint, samples);
    }

    analysis.push({
      index: col,
      type: type.type,
      amountRole,
      confidence: type.confidence,
      samples: samples.slice(0, 5),
      headerHint,
    });
  }

  // If we have multiple amount columns, try to infer roles even without header hints
  const amountCols = analysis.filter(a => a.type === 'amount');
  if (amountCols.length >= 2) {
    inferAmountRoles(amountCols, rows);
  }

  return analysis;
}

/**
 * Detect amount column role from header name
 */
function detectAmountRole(header: string, samples: string[]): 'debit' | 'credit' | 'balance' | 'single' {
  const lower = header.toLowerCase();

  // Debit/withdrawal patterns
  if (/withdraw|debit|dr\.?$|payment|expense|out/i.test(lower)) {
    return 'debit';
  }

  // Credit/deposit patterns
  if (/deposit|credit|cr\.?$|income|in$|received/i.test(lower)) {
    return 'credit';
  }

  // Balance patterns
  if (/balance|running|total$/i.test(lower)) {
    return 'balance';
  }

  // Check if values have consistent signs (negative = debit, positive = credit)
  const hasNegatives = samples.some(s => s.startsWith('-') || s.startsWith('('));
  const hasPositives = samples.some(s => !s.startsWith('-') && !s.startsWith('(') && parseFloat(s.replace(/[^0-9.-]/g, '')) > 0);

  if (hasNegatives && !hasPositives) return 'debit';
  if (hasPositives && !hasNegatives) return 'credit';

  return 'single';
}

/**
 * Infer amount roles when headers don't provide enough info
 * Uses heuristics like: balance typically has values for every row,
 * debit/credit often have alternating empty values
 */
function inferAmountRoles(amountCols: ColumnAnalysis[], rows: string[][]): void {
  // Already have explicit roles? Skip inference
  if (amountCols.every(col => col.amountRole && col.amountRole !== 'single')) {
    return;
  }

  // Count non-empty values per column
  const fillRates = amountCols.map(col => ({
    col,
    fillRate: rows.filter(row => row[col.index]?.trim()).length / rows.length,
  }));

  // Sort by fill rate (highest = likely balance, lower = likely debit/credit)
  fillRates.sort((a, b) => b.fillRate - a.fillRate);

  // If we have 3 amount columns with different fill rates, likely: balance, debit, credit
  if (fillRates.length === 3) {
    const [highest, mid, lowest] = fillRates;

    // If highest fill rate is much higher (>90%), it's probably balance
    if (highest.fillRate > 0.9 && mid.fillRate < 0.8) {
      if (!highest.col.amountRole || highest.col.amountRole === 'single') {
        highest.col.amountRole = 'balance';
      }
    }

    // For the other two, use position heuristic (first = debit, second = credit is common)
    const remaining = fillRates.filter(f => f.col.amountRole !== 'balance');
    if (remaining.length === 2) {
      // Check if they have mutually exclusive values (typical debit/credit pattern)
      const bothHaveValues = rows.filter(row =>
        row[remaining[0].col.index]?.trim() && row[remaining[1].col.index]?.trim()
      ).length;

      if (bothHaveValues < rows.length * 0.1) {
        // Columns are mostly mutually exclusive - likely debit/credit split
        // Use column order (common pattern: debit first, credit second)
        const [first, second] = remaining.sort((a, b) => a.col.index - b.col.index);
        if (!first.col.amountRole || first.col.amountRole === 'single') {
          first.col.amountRole = 'debit';
        }
        if (!second.col.amountRole || second.col.amountRole === 'single') {
          second.col.amountRole = 'credit';
        }
      }
    }
  }

  // If we have 2 amount columns with similar fill rates, likely debit/credit
  if (fillRates.length === 2) {
    const [first, second] = fillRates;
    const bothHaveValues = rows.filter(row =>
      row[first.col.index]?.trim() && row[second.col.index]?.trim()
    ).length;

    if (bothHaveValues < rows.length * 0.1) {
      // Mutually exclusive - debit/credit split
      const [colA, colB] = [first.col, second.col].sort((a, b) => a.index - b.index);
      if (!colA.amountRole || colA.amountRole === 'single') {
        colA.amountRole = 'debit';
      }
      if (!colB.amountRole || colB.amountRole === 'single') {
        colB.amountRole = 'credit';
      }
    }
  }
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
 * Generate header names based on column analysis and original headers
 */
function generateHeaders(analysis: ColumnAnalysis[], headerRow: string[] | null): string[] {
  const headers: string[] = [];
  let dateCount = 0;
  let textCount = 0;

  for (const col of analysis) {
    // Prefer original header if available and meaningful
    if (col.headerHint && col.headerHint.length > 1) {
      headers.push(col.headerHint);
      continue;
    }

    switch (col.type) {
      case 'date':
        dateCount++;
        headers.push(dateCount === 1 ? 'Date' : `Date ${dateCount}`);
        break;
      case 'amount':
        // Use role-specific names for amount columns
        switch (col.amountRole) {
          case 'debit':
            headers.push('Withdrawals');
            break;
          case 'credit':
            headers.push('Deposits');
            break;
          case 'balance':
            headers.push('Balance');
            break;
          default:
            headers.push('Amount');
        }
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
 * Simplified to use single amount column (expense/income toggled in preview)
 */
export function detectPasteColumnMapping(headers: string[], rows: string[][]): ColumnMapping | null {
  const analysis = analyzeColumnsWithHeaders(rows, headers);

  let dateIndex = -1;
  let amountIndex = -1;
  let descIndex = -1;

  // Find best candidates for each required field
  for (const col of analysis) {
    if (col.type === 'date' && dateIndex === -1) {
      dateIndex = col.index;
    } else if (col.type === 'amount') {
      // Skip balance columns, use first non-balance amount column
      if (col.amountRole !== 'balance' && amountIndex === -1) {
        amountIndex = col.index;
      }
    } else if (col.type === 'text' && descIndex === -1) {
      descIndex = col.index;
    }
  }

  // Fallback: if we have amount but no text, use another column for description
  const usedIndices = new Set([dateIndex, amountIndex].filter((i): i is number => i !== -1));
  if (usedIndices.size > 0 && descIndex === -1) {
    for (let i = 0; i < analysis.length; i++) {
      if (!usedIndices.has(i) && analysis[i].type !== 'amount') {
        descIndex = i;
        break;
      }
    }
  }

  // Must have at least date and amount
  if (dateIndex === -1 || amountIndex === -1) {
    return null;
  }

  // Build ignore list (exclude mapped columns)
  const mappedIndices = new Set([dateIndex, descIndex, amountIndex].filter((i): i is number => i !== -1));
  const ignore = headers
    .map((_, idx) => idx)
    .filter(idx => !mappedIndices.has(idx));

  return {
    date: dateIndex,
    description: descIndex,
    amount: amountIndex,
    ignore,
  };
}

/**
 * Analyze columns using generated header names (for detectPasteColumnMapping)
 */
function analyzeColumnsWithHeaders(rows: string[][], headers: string[]): ColumnAnalysis[] {
  if (rows.length === 0) return [];

  const numColumns = Math.max(rows[0].length, headers.length);
  const analysis: ColumnAnalysis[] = [];

  for (let col = 0; col < numColumns; col++) {
    const samples = rows.map(row => row[col] || '').filter(s => s.trim() !== '');
    const type = detectColumnType(samples);
    const headerHint = headers[col] || undefined;

    // Determine amount role from header name
    let amountRole: 'debit' | 'credit' | 'balance' | 'single' | undefined;
    if (type.type === 'amount' && headerHint) {
      amountRole = detectAmountRole(headerHint, samples);
    }

    analysis.push({
      index: col,
      type: type.type,
      amountRole,
      confidence: type.confidence,
      samples: samples.slice(0, 5),
      headerHint,
    });
  }

  // Infer roles for amount columns if needed
  const amountCols = analysis.filter(a => a.type === 'amount');
  if (amountCols.length >= 2) {
    inferAmountRoles(amountCols, rows);
  }

  return analysis;
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
