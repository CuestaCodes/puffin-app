import { describe, it, expect } from 'vitest';
import {
  analyseDateColumn,
  findUnparseableDates,
  describeDateDetection,
  detectDateFormat,
  parseDate,
} from './date-parser';

/** `MM/DD/YYYY` for each day from `start` to `end` inclusive, within one month. */
function monthFirstDays(month: number, start: number, end: number, year = 2027): string[] {
  const values: string[] = [];
  for (let day = start; day <= end; day++) {
    values.push(`${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`);
  }
  return values;
}

/** The user-reported column: 01/01/2027 … 01/31/2027, 02/01/2027 … 02/13/2027. */
const REPORTED_COLUMN = [...monthFirstDays(1, 1, 31), ...monthFirstDays(2, 1, 13)];

describe('analyseDateColumn', () => {
  describe('decisive evidence', () => {
    it('detects the reported 44-row column as MM/DD/YYYY', () => {
      const analysis = analyseDateColumn(REPORTED_COLUMN);

      expect(REPORTED_COLUMN).toHaveLength(44);
      expect(analysis).toEqual({
        format: 'MM/DD/YYYY',
        basis: 'decisive',
        total: 44,
        dayFirst: 0,
        monthFirst: 20,
        ambiguous: 24,
      });
    });

    it('lets decisive dates outrank a larger number of ambiguous ones', () => {
      // 12 ambiguous rows that would each default to DD/MM, 1 that can only be MM/DD
      const column = [...monthFirstDays(1, 1, 12), '01/13/2027'];

      expect(analyseDateColumn(column).format).toBe('MM/DD/YYYY');
    });

    it('finds decisive evidence anywhere in the column, not just the first rows', () => {
      const column = [...monthFirstDays(3, 1, 12), ...monthFirstDays(4, 1, 12), '04/30/2027'];

      expect(column.indexOf('04/30/2027')).toBe(24);
      expect(analyseDateColumn(column)).toMatchObject({ format: 'MM/DD/YYYY', basis: 'decisive', monthFirst: 1 });
    });

    it('detects DD/MM/YYYY when a day above 12 comes first', () => {
      expect(analyseDateColumn(['01/01/2027', '05/01/2027', '13/01/2027'])).toMatchObject({
        format: 'DD/MM/YYYY',
        basis: 'decisive',
        dayFirst: 1,
        ambiguous: 2,
      });
    });

    it('does not count a date that is invalid both ways as evidence', () => {
      // 31/04 and 04/31 are both impossible — April has 30 days
      const analysis = analyseDateColumn(['31/04/2027', '04/31/2027', '01/02/2027']);

      expect(analysis.dayFirst).toBe(0);
      expect(analysis.monthFirst).toBe(0);
      expect(analysis.basis).not.toBe('decisive');
    });

    it('handles dash separators and 2-digit years', () => {
      expect(detectDateFormat(['01-13-27', '01-14-27'])).toBe('MM/DD/YYYY');
      expect(detectDateFormat(['13-01-27', '14-01-27'])).toBe('DD/MM/YYYY');
    });

    it('decides from a single decisive row', () => {
      expect(analyseDateColumn(['12/25/2027'])).toMatchObject({ format: 'MM/DD/YYYY', basis: 'decisive' });
    });
  });

  describe('conflicting evidence', () => {
    it('picks the order with more decisive dates and reports both counts', () => {
      const analysis = analyseDateColumn(['13/01/2027', '14/01/2027', '01/13/2027', '02/02/2027']);

      expect(analysis).toMatchObject({ format: 'DD/MM/YYYY', basis: 'conflict', dayFirst: 2, monthFirst: 1 });
    });

    it('picks MM/DD when it has the majority', () => {
      expect(analyseDateColumn(['13/01/2027', '01/13/2027', '01/14/2027'])).toMatchObject({
        format: 'MM/DD/YYYY',
        basis: 'conflict',
      });
    });

    it('keeps DD/MM on a tie', () => {
      expect(analyseDateColumn(['13/01/2027', '01/13/2027']).format).toBe('DD/MM/YYYY');
    });

    it('never returns auto for a numeric column, which would parse rows inconsistently', () => {
      expect(analyseDateColumn(['13/01/2027', '01/13/2027']).format).not.toBe('auto');
    });
  });

  describe('fully ambiguous columns', () => {
    it('settles DD/MM from dates a few days apart', () => {
      // 1, 3, 5, 6 Feb as DD/MM — or 2 Jan, 2 Mar, 2 May, 2 Jun as MM/DD
      expect(analyseDateColumn(['01/02/2027', '03/02/2027', '05/02/2027', '06/02/2027'])).toMatchObject({
        format: 'DD/MM/YYYY',
        basis: 'sequence',
      });
    });

    it('settles MM/DD from dates a few days apart', () => {
      expect(analyseDateColumn(['02/01/2027', '02/03/2027', '02/05/2027', '02/06/2027'])).toMatchObject({
        format: 'MM/DD/YYYY',
        basis: 'sequence',
      });
    });

    it('reads a newest-first statement the same way', () => {
      expect(analyseDateColumn(['06/02/2027', '05/02/2027', '03/02/2027', '01/02/2027']).format)
        .toBe('DD/MM/YYYY');
    });

    it('ignores same-day neighbours when judging the order', () => {
      const column = ['01/02/2027', '01/02/2027', '03/02/2027', '03/02/2027', '05/02/2027'];

      expect(analyseDateColumn(column)).toMatchObject({ format: 'DD/MM/YYYY', basis: 'sequence' });
    });

    it('falls back to DD/MM when the order does not clearly favour either reading', () => {
      // 5 May, 6 Jun, 7 Jul read the same both ways
      expect(analyseDateColumn(['05/05/2027', '06/06/2027', '07/07/2027'])).toMatchObject({
        format: 'DD/MM/YYYY',
        basis: 'default',
      });
    });

    it('falls back to DD/MM with too few rows to judge the order', () => {
      expect(analyseDateColumn(['01/02/2027', '03/02/2027'])).toMatchObject({
        format: 'DD/MM/YYYY',
        basis: 'default',
      });
      expect(analyseDateColumn(['01/02/2027'])).toMatchObject({ format: 'DD/MM/YYYY', basis: 'default' });
    });
  });

  describe('other formats', () => {
    it('detects ISO dates', () => {
      expect(analyseDateColumn(['2027-01-13', '2027-01-14'])).toMatchObject({ format: 'YYYY-MM-DD', basis: 'iso' });
    });

    it('leaves month-name dates on auto, since each parses on its own', () => {
      expect(analyseDateColumn(['01 Jan 2024', 'Feb 3, 2024', '05Mar24'])).toMatchObject({
        format: 'auto',
        basis: 'text',
      });
    });

    it('reports none when nothing is a date', () => {
      expect(analyseDateColumn(['Coffee', 'Groceries'])).toMatchObject({ format: 'auto', basis: 'none', total: 2 });
    });

    it('skips blank values, and an empty column is none', () => {
      expect(analyseDateColumn(['', '  ', '13/01/2027'])).toMatchObject({ total: 1, format: 'DD/MM/YYYY' });
      expect(analyseDateColumn([])).toMatchObject({ format: 'auto', basis: 'none', total: 0 });
    });
  });
});

describe('findUnparseableDates', () => {
  it('returns the values that fail under the given format', () => {
    const column = ['01/13/2027', '13/01/2027', '02/30/2027', ''];

    // blank ignored
    expect(findUnparseableDates(column, 'MM/DD/YYYY')).toEqual(['13/01/2027', '02/30/2027']);
    expect(findUnparseableDates(column, 'DD/MM/YYYY')).toEqual(['01/13/2027', '02/30/2027']);
  });

  it('reports every row of the reported column fitting MM/DD', () => {
    expect(findUnparseableDates(REPORTED_COLUMN, 'MM/DD/YYYY')).toEqual([]);
    expect(findUnparseableDates(REPORTED_COLUMN, 'DD/MM/YYYY')).toHaveLength(20);
  });
});

describe('describeDateDetection', () => {
  it('lists a few examples when many dates fail, without implying a count', () => {
    const analysis = analyseDateColumn(REPORTED_COLUMN);
    const hint = describeDateDetection(analysis, 'DD/MM/YYYY', ['a', 'b', 'c', 'd']);

    // Row count and distinct values differ when a bad date repeats, so no arithmetic
    expect(hint?.message).toContain('(including a, b, c)');
    expect(hint?.message).not.toContain('more');
  });

  it('does not repeat a value that fails more than once', () => {
    const analysis = analyseDateColumn(REPORTED_COLUMN);
    const hint = describeDateDetection(analysis, 'DD/MM/YYYY', ['13/01/2027', '13/01/2027']);

    expect(hint?.message).toContain('(13/01/2027).');
  });

  it('explains a decisive detection', () => {
    const analysis = analyseDateColumn(REPORTED_COLUMN);

    expect(describeDateDetection(analysis, 'MM/DD/YYYY', [])).toEqual({
      message: 'Detected MM/DD/YYYY: 20 dates can only be read this way.',
      tone: 'info',
    });
  });

  it('warns about a conflict and the dates that do not fit', () => {
    const analysis = analyseDateColumn(['13/01/2027', '14/01/2027', '01/13/2027']);
    const hint = describeDateDetection(analysis, analysis.format, ['01/13/2027']);

    expect(hint?.tone).toBe('warning');
    expect(hint?.message).toContain('2 only fit DD/MM, 1 only fit MM/DD');
    // Names the offending date, so it can be found without opening the file
    expect(hint?.message).toContain("1 date doesn't fit this format (01/13/2027).");
  });

  it('warns when the format was only assumed', () => {
    const hint = describeDateDetection(analyseDateColumn(['05/05/2027']), 'DD/MM/YYYY', []);

    expect(hint?.tone).toBe('warning');
    expect(hint?.message).toContain('assumed');
  });

  it('names the date order when it settled the format', () => {
    const analysis = analyseDateColumn(['01/02/2027', '03/02/2027', '05/02/2027']);

    expect(describeDateDetection(analysis, 'DD/MM/YYYY', [])?.message).toContain('run in sequence');
  });

  it('describes a hand-picked format against what was detected', () => {
    const analysis = analyseDateColumn(REPORTED_COLUMN);

    const unparseable = findUnparseableDates(REPORTED_COLUMN, 'DD/MM/YYYY');

    expect(describeDateDetection(analysis, 'DD/MM/YYYY', unparseable)).toEqual({
      message:
        'Using DD/MM/YYYY (detected MM/DD/YYYY). ' +
        "20 dates don't fit this format (including 01/13/2027, 01/14/2027, 01/15/2027).",
      tone: 'warning',
    });
  });

  it('does not repeat a misfit count when no dates were recognised', () => {
    const hint = describeDateDetection(analyseDateColumn(['Coffee']), 'auto', ['Coffee']);

    expect(hint?.message).not.toContain("doesn't fit");
    expect(hint?.tone).toBe('warning');
  });

  it('says nothing for an empty column', () => {
    expect(describeDateDetection(analyseDateColumn([]), 'auto', [])).toBeNull();
  });
});

describe('parseDate (unchanged behaviour)', () => {
  it('parses with an explicit format', () => {
    expect(parseDate('01/13/2027', 'MM/DD/YYYY')).toBe('2027-01-13');
    expect(parseDate('13/01/2027', 'DD/MM/YYYY')).toBe('2027-01-13');
    expect(parseDate('13-01-2027', 'DD-MM-YYYY')).toBe('2027-01-13');
    expect(parseDate('2027-01-13', 'YYYY-MM-DD')).toBe('2027-01-13');
  });

  it('rejects a date that is impossible under the format', () => {
    expect(parseDate('13/01/2027', 'MM/DD/YYYY')).toBeNull();
    expect(parseDate('02/30/2027', 'MM/DD/YYYY')).toBeNull();
  });

  it('on auto, still reads each value on its own, ambiguous ones as DD/MM', () => {
    expect(parseDate('01/02/2027')).toBe('2027-02-01');
    expect(parseDate('01/13/2027')).toBe('2027-01-13');
    expect(parseDate('01 Jan 2024')).toBe('2024-01-01');
  });

  it('expands 2-digit years', () => {
    expect(parseDate('13/01/27', 'DD/MM/YYYY')).toBe('2027-01-13');
    expect(parseDate('13/01/99', 'DD/MM/YYYY')).toBe('1999-01-13');
  });
});
