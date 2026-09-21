// Types for CSV import functionality

// ============================================
// Type Constants (use these for runtime checks)
// ============================================

export const DATE_FORMATS = [
  'YYYY-MM-DD',
  'DD/MM/YYYY',
  'MM/DD/YYYY',
  'DD-MM-YYYY',
  'auto',
] as const;

export type DateFormat = typeof DATE_FORMATS[number];

/**
 * Why a date column was given its format — see analyseDateColumn in lib/csv/date-parser.ts.
 * - `iso`      — YYYY-MM-DD values
 * - `decisive` — some dates can only be read one way (a number above 12), none the other
 * - `conflict` — some dates can only be read each way; the majority won
 * - `sequence` — every date could be either order; the dates run in order one way
 * - `default`  — every date could be either order and nothing decided it; assumed DD/MM
 * - `text`     — month names (`01 Jan 2024`), read one at a time
 * - `none`     — nothing in the column parses as a date
 */
export type DateDetectionBasis =
  | 'iso'
  | 'decisive'
  | 'conflict'
  | 'sequence'
  | 'default'
  | 'text'
  | 'none';

export interface DateColumnAnalysis {
  format: DateFormat;
  basis: DateDetectionBasis;
  /** Non-empty values examined */
  total: number;
  /** Dates only valid as DD/MM (e.g. 13/01/2027) */
  dayFirst: number;
  /** Dates only valid as MM/DD (e.g. 01/13/2027) */
  monthFirst: number;
  /** Numeric dates valid either way (e.g. 01/02/2027) */
  ambiguous: number;
}

export interface DateDetectionHint {
  message: string;
  tone: 'info' | 'warning';
}

export const IMPORT_STAGES = [
  'uploading',
  'parsing',
  'validating',
  'importing',
  'complete',
  'error',
] as const;

export type ImportStage = typeof IMPORT_STAGES[number];

export interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  /** Withdrawal/debit column - values treated as negative (optional) */
  debit?: number;
  /** Deposit/credit column - values treated as positive (optional) */
  credit?: number;
  /** Balance column - excluded from import (optional) */
  balance?: number;
  /** Notes/memo column - populates transaction notes (optional) */
  notes?: number;
  ignore: number[];
}

export interface ParsedRow {
  rowIndex: number;
  raw: string[];
  parsed: {
    date: string | null;
    description: string | null;
    amount: number | null;
    notes: string | null;
  };
  errors: string[];
  isDuplicate: boolean;
  isSelected: boolean;
  hasDefaultDescription: boolean; // True when description was empty and defaulted to "No description"
}

export interface CSVParseResult {
  headers: string[];
  rows: string[][];
  totalRows: number;
  encoding: string;
}

export interface ImportPreview {
  headers: string[];
  rows: ParsedRow[];
  suggestedMapping: ColumnMapping | null;
  detectedDateFormat: DateFormat;
  duplicateCount: number;
  validCount: number;
  errorCount: number;
}

export interface ImportOptions {
  columnMapping: ColumnMapping;
  dateFormat: DateFormat;
  skipDuplicates: boolean;
  selectedRows?: number[];
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  duplicates: number;
  autoCategorized: number;
  errors: ImportError[];
  /** Batch ID for undo functionality - only set when imported > 0 */
  batchId?: string;
}

export interface ImportError {
  rowIndex: number;
  message: string;
  data?: Record<string, unknown>;
}

export interface ImportProgress {
  stage: ImportStage;
  current: number;
  total: number;
  message: string;
}

/** Info about an import batch for undo confirmation */
export interface UndoImportInfo {
  batchId: string;
  totalCount: number;
  modifiedCount: number;
  alreadyDeletedCount: number;
  canUndo: boolean;
}

/** Result of undoing an import batch */
export interface UndoImportResult {
  success: boolean;
  undoneCount: number;
  message: string;
}



