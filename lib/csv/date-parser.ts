// Date format detection and parsing utilities
import type { DateFormat } from '@/types/import';

interface DateParseResult {
  date: string | null; // YYYY-MM-DD format
  format: DateFormat;
  confidence: number;
}

/**
 * Parse a date string and convert to YYYY-MM-DD format
 */
export function parseDate(dateStr: string, format: DateFormat = 'auto'): string | null {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }
  
  const trimmed = dateStr.trim();
  if (!trimmed) {
    return null;
  }
  
  if (format === 'auto') {
    const detected = detectAndParseDate(trimmed);
    return detected.date;
  }
  
  return parseDateWithFormat(trimmed, format);
}

/**
 * Parse date with a specific format
 */
function parseDateWithFormat(dateStr: string, format: DateFormat): string | null {
  // Normalize separators
  const normalized = dateStr.replace(/[\/\-\.]/g, '-');
  const parts = normalized.split('-').map(p => p.trim());
  
  if (parts.length !== 3) {
    return null;
  }
  
  let year: number, month: number, day: number;
  
  switch (format) {
    case 'YYYY-MM-DD':
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
      break;
    case 'DD/MM/YYYY':
    case 'DD-MM-YYYY':
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
      break;
    case 'MM/DD/YYYY':
      month = parseInt(parts[0], 10);
      day = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
      break;
    default:
      return null;
  }
  
  // Handle 2-digit years
  if (year < 100) {
    year = year > 50 ? 1900 + year : 2000 + year;
  }
  
  // Validate ranges
  if (!isValidDate(year, month, day)) {
    return null;
  }
  
  return formatToISO(year, month, day);
}

/**
 * Detect date format and parse
 */
function detectAndParseDate(dateStr: string): DateParseResult {
  // Try YYYY-MM-DD first (ISO format)
  const isoMatch = dateStr.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch.map(Number);
    if (isValidDate(year, month, day)) {
      return {
        date: formatToISO(year, month, day),
        format: 'YYYY-MM-DD',
        confidence: 1.0,
      };
    }
  }
  
  // Try DD/MM/YYYY or MM/DD/YYYY or DD-MM-YYYY
  const dmyMatch = dateStr.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (dmyMatch) {
    const [, first, second, yearStr] = dmyMatch;
    const firstNum = parseInt(first, 10);
    const secondNum = parseInt(second, 10);
    let year = parseInt(yearStr, 10);
    
    // Handle 2-digit years
    if (year < 100) {
      year = year > 50 ? 1900 + year : 2000 + year;
    }
    
    // Determine if DD/MM or MM/DD based on values
    // If first > 12, it must be day
    // If second > 12, it must be day (so first is month)
    
    if (firstNum > 12 && secondNum <= 12) {
      // DD/MM/YYYY format
      if (isValidDate(year, secondNum, firstNum)) {
        return {
          date: formatToISO(year, secondNum, firstNum),
          format: 'DD/MM/YYYY',
          confidence: 0.9,
        };
      }
    } else if (firstNum <= 12 && secondNum > 12) {
      // MM/DD/YYYY format
      if (isValidDate(year, firstNum, secondNum)) {
        return {
          date: formatToISO(year, firstNum, secondNum),
          format: 'MM/DD/YYYY',
          confidence: 0.9,
        };
      }
    } else {
      // Ambiguous case - try both
      // Prefer DD/MM/YYYY as it's more common internationally
      if (isValidDate(year, secondNum, firstNum)) {
        return {
          date: formatToISO(year, secondNum, firstNum),
          format: 'DD/MM/YYYY',
          confidence: 0.6,
        };
      }
      if (isValidDate(year, firstNum, secondNum)) {
        return {
          date: formatToISO(year, firstNum, secondNum),
          format: 'MM/DD/YYYY',
          confidence: 0.5,
        };
      }
    }
  }
  
  // Try parsing with JavaScript Date as last resort
  const jsDate = new Date(dateStr);
  if (!isNaN(jsDate.getTime())) {
    return {
      date: formatToISO(jsDate.getFullYear(), jsDate.getMonth() + 1, jsDate.getDate()),
      format: 'auto',
      confidence: 0.4,
    };
  }
  
  return {
    date: null,
    format: 'auto',
    confidence: 0,
  };
}

/**
 * Detect the most likely date format from a sample of dates
 * Optimized with early termination when confidence is high
 */
export function detectDateFormat(samples: string[]): DateFormat {
  const formatCounts: Record<DateFormat, number> = {
    'YYYY-MM-DD': 0,
    'DD/MM/YYYY': 0,
    'MM/DD/YYYY': 0,
    'DD-MM-YYYY': 0,
    'auto': 0,
  };
  
  const minSamplesForConfidence = Math.min(5, samples.length);
  let processedCount = 0;
  
  for (const sample of samples) {
    const result = detectAndParseDate(sample);
    if (result.format !== 'auto' && result.confidence >= 0.6) {
      formatCounts[result.format]++;
      processedCount++;
      
      // Early termination: if one format has clear majority, stop
      if (processedCount >= minSamplesForConfidence) {
        const maxCount = Math.max(...Object.values(formatCounts));
        if (maxCount >= minSamplesForConfidence * 0.8) {
          break;
        }
      }
    }
  }
  
  // Find the most common format
  let maxCount = 0;
  let detectedFormat: DateFormat = 'auto';
  
  for (const [format, count] of Object.entries(formatCounts)) {
    if (count > maxCount && format !== 'auto') {
      maxCount = count;
      detectedFormat = format as DateFormat;
    }
  }
  
  return detectedFormat;
}

/**
 * Validate date components
 */
function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  
  // Check days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return false;
  
  return true;
}

/**
 * Format date components to ISO string (YYYY-MM-DD)
 */
function formatToISO(year: number, month: number, day: number): string {
  const y = year.toString().padStart(4, '0');
  const m = month.toString().padStart(2, '0');
  const d = day.toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a date string for display
 */
export function formatDateForDisplay(dateStr: string): string {
  if (!dateStr) return '';
  
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

