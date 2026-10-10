import { describe, it, expect } from 'vitest';
import { detectColumnMapping, looksLikeHeaderRow, parseCSVString } from './parser';

describe('detectColumnMapping', () => {
  it('maps a single Amount column', () => {
    expect(detectColumnMapping(['Date', 'Description', 'Amount'])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      ignore: [],
    });
  });

  it('maps Balance beside a single Amount column, and does not import it', () => {
    expect(detectColumnMapping(['Date', 'Narrative', 'Amount', 'Balance'])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      balance: 3,
      ignore: [],
    });
  });

  // Debit used to be taken as the single Amount column, with Credit and Balance ignored:
  // withdrawals imported as income and deposit rows had no amount.
  it('maps Debit, Credit and Balance instead of treating Debit as the amount', () => {
    expect(detectColumnMapping(['Date', 'Description', 'Debit', 'Credit', 'Balance'])).toEqual({
      date: 0,
      description: 1,
      amount: -1,
      debit: 2,
      credit: 3,
      balance: 4,
      ignore: [],
    });
  });

  it.each([
    [['Date', 'Description', 'Debit Amount', 'Credit Amount']],
    [['Posted', 'Payee', 'Withdrawals', 'Deposits']],
    [['Date', 'Details', 'Paid out', 'Paid in']],
  ])('maps %j as debit and credit columns', headers => {
    expect(detectColumnMapping(headers)).toMatchObject({ date: 0, description: 1, amount: -1, debit: 2, credit: 3 });
  });

  it('maps a lone Debit or Credit column by its header', () => {
    expect(detectColumnMapping(['Date', 'Description', 'Debit', 'Balance'])).toEqual({
      date: 0,
      description: 1,
      amount: -1,
      debit: 2,
      balance: 3,
      ignore: [],
    });
    expect(detectColumnMapping(['Date', 'Description', 'Credit'])).toEqual({
      date: 0,
      description: 1,
      amount: -1,
      credit: 2,
      ignore: [],
    });
  });

  it('prefers a plain Amount column over a Credit column beside it', () => {
    expect(detectColumnMapping(['Trans Date', 'Memo', 'Amount', 'Credit'])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      ignore: [3],
    });
  });

  // A common bank layout. "Value Date" matches the amount pattern "value"; taken as the
  // single Amount column it hid Debit and Credit entirely.
  it('does not take a second date column for the amount', () => {
    expect(detectColumnMapping(['Date', 'Value Date', 'Description', 'Debit', 'Credit', 'Balance'])).toEqual({
      date: 0,
      description: 2,
      amount: -1,
      debit: 3,
      credit: 4,
      balance: 5,
      ignore: [1],
    });
    expect(detectColumnMapping(['Date', 'Value Date', 'Description', 'Amount'])).toEqual({
      date: 0,
      description: 2,
      amount: 3,
      ignore: [1],
    });
  });

  it('maps the column named Debit, not an earlier one that only mentions a payment', () => {
    expect(detectColumnMapping(['Date', 'Narrative', 'Payment Reference', 'Debit', 'Credit'])).toEqual({
      date: 0,
      description: 1,
      amount: -1,
      debit: 3,
      credit: 4,
      ignore: [2],
    });
  });

  it('leaves date and description unmapped rather than guessing them in debit/credit mode', () => {
    expect(detectColumnMapping(['Foo', 'Debit', 'Credit'])).toEqual({
      date: -1,
      description: -1,
      amount: -1,
      debit: 1,
      credit: 2,
      ignore: [0],
    });
  });

  it('does not read a direction into headers that only end like one', () => {
    expect(detectColumnMapping(['Date', 'Origin', 'Amount'])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      ignore: [],
    });
  });

  it('falls back to position for generated headers', () => {
    expect(detectColumnMapping(['Column 1', 'Column 2', 'Column 3'])).toEqual({
      date: 0,
      description: 1,
      amount: 2,
      ignore: [],
    });
    expect(detectColumnMapping(['Column 1', 'Column 2'])).toBeNull();
  });
});

describe('looksLikeHeaderRow', () => {
  it('is true for a row of column names', () => {
    expect(looksLikeHeaderRow(['Date', 'Description', 'Amount'])).toBe(true);
    expect(looksLikeHeaderRow(['Date', 'Description', 'Debit', 'Credit', 'Balance'])).toBe(true);
    expect(looksLikeHeaderRow(['Posted', '', 'Payee'])).toBe(true);
  });

  it('is false for a row holding a date or an amount', () => {
    expect(looksLikeHeaderRow(['09/10/2026', 'Harbour Grocers', '-84.35'])).toBe(false);
    expect(looksLikeHeaderRow(['Harbour Grocers', 'Ferngrove', '84.35'])).toBe(false);
    expect(looksLikeHeaderRow(['2026-10-09', 'Harbour Grocers', 'Ferngrove'])).toBe(false);
  });

  it('is false with fewer than two filled cells', () => {
    expect(looksLikeHeaderRow(['Date'])).toBe(false);
    expect(looksLikeHeaderRow(['', '', ''])).toBe(false);
    expect(looksLikeHeaderRow([])).toBe(false);
  });
});

describe('parseCSVString with detection', () => {
  it('reads a debit/credit statement end to end', () => {
    const csv = [
      'Date,Description,Debit,Credit,Balance',
      '09/10/2026,Harbour Grocers Ferngrove,84.35,,4728.02',
      '15/10/2026,Marlowe & Finch Pty Ltd Salary,,3438.75,8142.82',
    ].join('\r\n');
    const result = parseCSVString(csv);

    expect(looksLikeHeaderRow(result.headers)).toBe(true);
    expect(looksLikeHeaderRow(result.rows[0])).toBe(false);
    expect(detectColumnMapping(result.headers)).toMatchObject({ debit: 2, credit: 3, balance: 4 });
  });
});
