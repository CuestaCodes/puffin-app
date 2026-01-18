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



