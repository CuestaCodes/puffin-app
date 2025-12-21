// Types for CSV import functionality

export type DateFormat = 'YYYY-MM-DD' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'DD-MM-YYYY' | 'auto';

export interface ColumnMapping {
  date: number;
  description: number;
  amount: number;
  ignore: number[];
}

export interface ParsedRow {
  rowIndex: number;
  raw: string[];
  parsed: {
    date: string | null;
    description: string | null;
    amount: number | null;
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
  errors: ImportError[];
}

export interface ImportError {
  rowIndex: number;
  message: string;
  data?: Record<string, unknown>;
}

export interface ImportProgress {
  stage: 'uploading' | 'parsing' | 'validating' | 'importing' | 'complete' | 'error';
  current: number;
  total: number;
  message: string;
}



