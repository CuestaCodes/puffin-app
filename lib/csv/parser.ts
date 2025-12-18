// CSV parsing utilities using papaparse
import Papa from 'papaparse';
import type { CSVParseResult, ColumnMapping } from '@/types/import';

/**
 * Parse a CSV file and return structured data
 */
export async function parseCSV(file: File): Promise<CSVParseResult> {
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
        
        // Assume first row is headers
        const headers = filteredData[0].map(h => h?.trim() || '');
        const rows = filteredData.slice(1);
        
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
 * Auto-detect column mapping based on header names
 */
export function detectColumnMapping(headers: string[]): ColumnMapping | null {
  const lowerHeaders = headers.map(h => h.toLowerCase().trim());
  
  // Common patterns for date columns
  const datePatterns = ['date', 'transaction date', 'trans date', 'posted', 'posted date', 'value date'];
  // Common patterns for description columns
  const descPatterns = ['description', 'desc', 'memo', 'narrative', 'details', 'transaction', 'merchant', 'payee'];
  // Common patterns for amount columns
  const amountPatterns = ['amount', 'value', 'sum', 'debit', 'credit', 'money'];
  
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
  
  // Find amount column (exclude already-mapped columns)
  for (const pattern of amountPatterns) {
    const foundIdx = lowerHeaders.findIndex((h, i) => 
      h.includes(pattern) && i !== dateIndex && i !== descIndex
    );
    if (foundIdx !== -1) {
      amountIndex = foundIdx;
      break;
    }
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
    .filter(idx => idx !== dateIndex && idx !== descIndex && idx !== amountIndex);
  
  return {
    date: dateIndex,
    description: descIndex,
    amount: amountIndex,
    ignore,
  };
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

