// Date format detection and parsing utilities
import type {
  DateColumnAnalysis,
  DateDetectionHint,
  DateFormat,
} from '@/types/import';

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
  
  // Try text-based date formats (common in PDF statements)
  // "01 Jan 2024", "01 January 2024", "1 Jan 24"
  const textDayFirst = dateStr.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})$/);
  if (textDayFirst) {
    const [, dayStr, monthStr, yearStr] = textDayFirst;
    const month = parseMonthName(monthStr);
    if (month !== null) {
      const day = parseInt(dayStr, 10);
      let year = parseInt(yearStr, 10);
      if (year < 100) {
        year = year > 50 ? 1900 + year : 2000 + year;
      }
      if (isValidDate(year, month, day)) {
        return {
          date: formatToISO(year, month, day),
          format: 'auto',
          confidence: 0.85,
        };
      }
    }
  }

  // "Jan 01, 2024", "January 1, 2024"
  const textMonthFirst = dateStr.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})$/);
  if (textMonthFirst) {
    const [, monthStr, dayStr, yearStr] = textMonthFirst;
    const month = parseMonthName(monthStr);
    if (month !== null) {
      const day = parseInt(dayStr, 10);
      let year = parseInt(yearStr, 10);
      if (year < 100) {
        year = year > 50 ? 1900 + year : 2000 + year;
      }
      if (isValidDate(year, month, day)) {
        return {
          date: formatToISO(year, month, day),
          format: 'auto',
          confidence: 0.85,
        };
      }
    }
  }

  // "01Jan2024" or "01Jan24" (no spaces)
  const compactDate = dateStr.match(/^(\d{1,2})([A-Za-z]{3})(\d{2,4})$/);
  if (compactDate) {
    const [, dayStr, monthStr, yearStr] = compactDate;
    const month = parseMonthName(monthStr);
    if (month !== null) {
      const day = parseInt(dayStr, 10);
      let year = parseInt(yearStr, 10);
      if (year < 100) {
        year = year > 50 ? 1900 + year : 2000 + year;
      }
      if (isValidDate(year, month, day)) {
        return {
          date: formatToISO(year, month, day),
          format: 'auto',
          confidence: 0.8,
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
 * Parse month name to number (1-12)
 */
function parseMonthName(monthStr: string): number | null {
  const months: Record<string, number> = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  return months[monthStr.toLowerCase()] ?? null;
}

/**
 * Detect the most likely date format for a column of dates.
 * Pass the whole column — see analyseDateColumn.
 */
export function detectDateFormat(values: string[]): DateFormat {
  return analyseDateColumn(values).format;
}

/**
 * How much tighter one reading's typical gap between consecutive dates must be
 * before the date order is trusted to settle a fully ambiguous column.
 */
const SEQUENCE_TIGHTNESS_RATIO = 2;

/** Consecutive differing pairs needed before the date order is trusted at all. */
const SEQUENCE_MIN_PAIRS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

type NumericReading =
  | { kind: 'dayFirst' }
  | { kind: 'monthFirst' }
  | { kind: 'ambiguous'; key: string; dayFirstTime: number; monthFirstTime: number };

function expandYear(year: number): number {
  return year < 100 ? (year > 50 ? 1900 + year : 2000 + year) : year;
}

/**
 * Classify a `NN/NN/YYYY` value by which orders produce a real date. Uses date
 * validity rather than "a number above 12", so `31/04` (valid neither way) is
 * not counted as evidence for anything.
 */
function readNumericDate(value: string): NumericReading | null {
  const match = value.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})$/);
  if (!match) return null;

  const first = parseInt(match[1], 10);
  const second = parseInt(match[2], 10);
  const year = expandYear(parseInt(match[3], 10));

  const asDayFirst = isValidDate(year, second, first);
  const asMonthFirst = isValidDate(year, first, second);

  if (asDayFirst && asMonthFirst) {
    return {
      kind: 'ambiguous',
      key: `${first}-${second}-${year}`,
      dayFirstTime: Date.UTC(year, second - 1, first),
      monthFirstTime: Date.UTC(year, first - 1, second),
    };
  }
  if (asDayFirst) return { kind: 'dayFirst' };
  if (asMonthFirst) return { kind: 'monthFirst' };
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Settle a column where every date could be either order, using the order the
 * dates appear in. Statements list transactions chronologically and usually a
 * few days apart, so the right reading has small gaps between neighbours while
 * the wrong one jumps by months: `01/02, 03/02, 05/02` is 1, 3, 5 Feb as DD/MM
 * but 2 Jan, 2 Mar, 2 May as MM/DD.
 *
 * Only decides when one reading is clearly tighter; otherwise returns null.
 */
function resolveBySequence(
  readings: Extract<NumericReading, { kind: 'ambiguous' }>[]
): 'DD/MM/YYYY' | 'MM/DD/YYYY' | null {
  const dayFirstGaps: number[] = [];
  const monthFirstGaps: number[] = [];

  for (let i = 1; i < readings.length; i++) {
    const prev = readings[i - 1];
    const curr = readings[i];
    // Same-day neighbours say nothing about order; both readings agree on them
    if (prev.key === curr.key) continue;
    dayFirstGaps.push(Math.abs(curr.dayFirstTime - prev.dayFirstTime) / DAY_MS);
    monthFirstGaps.push(Math.abs(curr.monthFirstTime - prev.monthFirstTime) / DAY_MS);
  }

  if (dayFirstGaps.length < SEQUENCE_MIN_PAIRS) return null;

  const dayFirstMedian = median(dayFirstGaps);
  const monthFirstMedian = median(monthFirstGaps);

  if (dayFirstMedian * SEQUENCE_TIGHTNESS_RATIO <= monthFirstMedian) return 'DD/MM/YYYY';
  if (monthFirstMedian * SEQUENCE_TIGHTNESS_RATIO <= dayFirstMedian) return 'MM/DD/YYYY';
  return null;
}

/**
 * Work out a date column's format from every value in it, and why.
 *
 * Decisive dates outrank ambiguous ones. `01/13/2027` can only be MM/DD, while
 * `01/02/2027` could be either; counting both as equal votes let 24 ambiguous
 * rows outvote 20 decisive ones and import a whole MM/DD statement as DD/MM.
 *
 * Numeric columns never come back as `'auto'`. `'auto'` parses each row on its
 * own, so a column with dates in both orders would import silently mixed; an
 * explicit format instead makes the rows that don't fit show as invalid.
 */
export function analyseDateColumn(values: string[]): DateColumnAnalysis {
  let total = 0;
  let iso = 0;
  let text = 0;
  let dayFirst = 0;
  let monthFirst = 0;
  const ambiguousReadings: Extract<NumericReading, { kind: 'ambiguous' }>[] = [];

  for (const raw of values) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) continue;
    total++;

    const isoMatch = value.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (isoMatch && isValidDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]))) {
      iso++;
      continue;
    }

    const numeric = readNumericDate(value);
    if (numeric) {
      if (numeric.kind === 'dayFirst') dayFirst++;
      else if (numeric.kind === 'monthFirst') monthFirst++;
      else ambiguousReadings.push(numeric);
      continue;
    }

    // Month-name dates are unambiguous on their own and parse one at a time.
    // The confidence floor excludes the JS Date last resort, which accepts junk.
    const parsed = detectAndParseDate(value);
    if (parsed.date !== null && parsed.confidence >= 0.8) text++;
  }

  const ambiguous = ambiguousReadings.length;
  const numericCount = dayFirst + monthFirst + ambiguous;
  const counts = { total, dayFirst, monthFirst, ambiguous };

  if (iso > 0 && iso >= numericCount && iso >= text) {
    return { format: 'YYYY-MM-DD', basis: 'iso', ...counts };
  }

  if (numericCount > 0 && numericCount >= text) {
    if (dayFirst > 0 && monthFirst > 0) {
      // A tie keeps the DD/MM default
      const format = monthFirst > dayFirst ? 'MM/DD/YYYY' : 'DD/MM/YYYY';
      return { format, basis: 'conflict', ...counts };
    }
    if (dayFirst > 0) return { format: 'DD/MM/YYYY', basis: 'decisive', ...counts };
    if (monthFirst > 0) return { format: 'MM/DD/YYYY', basis: 'decisive', ...counts };

    const bySequence = resolveBySequence(ambiguousReadings);
    if (bySequence) return { format: bySequence, basis: 'sequence', ...counts };

    // Nothing settles it: DD/MM, the order Australian and most non-US banks use
    return { format: 'DD/MM/YYYY', basis: 'default', ...counts };
  }

  if (text > 0) return { format: 'auto', basis: 'text', ...counts };

  return { format: 'auto', basis: 'none', ...counts };
}

/**
 * The non-empty values that fail to parse under `format`.
 *
 * Returns the values rather than a count so the hint can name them: being told
 * "1 date doesn't fit" means hunting through the file for it.
 */
export function findUnparseableDates(values: string[], format: DateFormat): string[] {
  const failures: string[] = [];
  for (const raw of values) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (value && parseDate(value, format) === null) failures.push(value);
  }
  return failures;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * Names the offending values, so they can be found without opening the file.
 *
 * "and N more" is avoided deliberately: the count in the sentence is rows,
 * these are distinct values, and one bad date repeated across rows made the two
 * disagree ("11 dates ... and 7 more").
 */
function listExamples(values: string[], limit = 3): string {
  const unique = [...new Set(values)];
  if (unique.length <= limit) return unique.join(', ');
  return `including ${unique.slice(0, limit).join(', ')}`;
}

function formatLabel(format: DateFormat): string {
  return format === 'auto' ? 'Auto-detect' : format;
}

/**
 * The one-line explanation shown under the date format picker, shared by the
 * CSV and paste importers so both say the same thing. `selectedFormat` is the
 * format currently in use, which differs from `analysis.format` once the user
 * has picked one by hand.
 */
export function describeDateDetection(
  analysis: DateColumnAnalysis,
  selectedFormat: DateFormat,
  unparseable: string[]
): DateDetectionHint | null {
  if (analysis.total === 0) return null;

  // Nothing recognised already says every date fails; the count would repeat it
  const misfit = unparseable.length > 0 && analysis.basis !== 'none'
    ? ` ${plural(unparseable.length, 'date')} ${unparseable.length === 1 ? "doesn't" : "don't"}` +
      ` fit this format (${listExamples(unparseable)}).`
    : '';

  if (selectedFormat !== analysis.format) {
    const detected = analysis.basis === 'none' ? '' : ` (detected ${formatLabel(analysis.format)})`;
    const autoNote = selectedFormat === 'auto'
      ? ' Each date is read on its own, so dates that could be either order are read as DD/MM.'
      : '';
    return {
      message: `Using ${formatLabel(selectedFormat)}${detected}.${autoNote}${misfit}`,
      tone: unparseable.length > 0 ? 'warning' : 'info',
    };
  }

  const fmt = formatLabel(analysis.format);
  let message: string;
  let tone: DateDetectionHint['tone'] = 'info';

  switch (analysis.basis) {
    case 'iso':
      message = `Detected ${fmt}.`;
      break;
    case 'decisive': {
      const evidence = analysis.format === 'MM/DD/YYYY' ? analysis.monthFirst : analysis.dayFirst;
      message = `Detected ${fmt}: ${plural(evidence, 'date')} can only be read this way.`;
      break;
    }
    case 'conflict':
      message =
        `Dates in both orders found (${analysis.dayFirst} only fit DD/MM, ` +
        `${analysis.monthFirst} only fit MM/DD). Using ${fmt}` +
        (analysis.dayFirst === analysis.monthFirst ? '.' : ', the more common one.');
      tone = 'warning';
      break;
    case 'sequence':
      message = `Every date could be either order. Assumed ${fmt} because the dates run in sequence that way.`;
      break;
    case 'default':
      message =
        `Every date could be either order, so ${fmt} was assumed. ` +
        'Check the preview and choose the other order if the dates look wrong.';
      tone = 'warning';
      break;
    case 'text':
      message = 'Dates use month names, so each is read as written.';
      break;
    case 'none':
      message = 'No dates recognised in this column. Check that the right column is mapped to Date.';
      tone = 'warning';
      break;
  }

  if (misfit) tone = 'warning';
  return { message: message + misfit, tone };
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

