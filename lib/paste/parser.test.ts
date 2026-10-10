import { describe, it, expect } from 'vitest';
import {
  parsePastedText,
  detectPasteColumnMapping,
  pastedTextHasHeaderRow,
  isAmountLike,
} from './parser';

const ROWS = [
  ['09/10/2026', 'Harbour Grocers Ferngrove'],
  ['13/10/2026', 'Banksia Pharmacy Hillcrest'],
  ['15/10/2026', 'Marlowe & Finch Pty Ltd Salary'],
  ['16/10/2026', 'Ferngrove Fuel Wattle Creek'],
];

/** Tab-separated paste: a header line, then the four rows with the given trailing cells. */
function paste(header: string[] | null, tails: string[][]): string {
  const lines = ROWS.map((row, i) => [...row, ...tails[i]].join('\t'));
  return (header ? [header.join('\t'), ...lines] : lines).join('\n');
}

function parseAndMap(text: string, hasHeaders: boolean) {
  const result = parsePastedText(text, { hasHeaders });
  return { ...result, mapping: detectPasteColumnMapping(result.headers, result.rows) };
}

describe('parsePastedText — signed amounts in the last column', () => {
  it.each([
    ['a minus sign', ['-84.35', '-23.95', '3,438.75', '-1,071.20']],
    ['a unicode minus', ['−84.35', '−23.95', '3,438.75', '−1,071.20']],
    ['parentheses', ['(84.35)', '(23.95)', '3,438.75', '(1,071.20)']],
    ['a sign before the currency symbol', ['-$84.35', '-$23.95', '$3,438.75', '-$1,071.20']],
    ['a sign after the currency symbol', ['$-84.35', '$-23.95', '$3,438.75', '$-1,071.20']],
  ])('keeps %s on the amount', (_label, amounts) => {
    const text = paste(['Date', 'Description', 'Amount'], amounts.map(a => [a]));
    const { headers, rows, mapping } = parseAndMap(text, true);

    expect(headers).toEqual(['Date', 'Description', 'Amount']);
    expect(rows.map(row => row.length)).toEqual([3, 3, 3, 3]);
    expect(rows.map(row => row[2])).toEqual(amounts);
    expect(mapping).toEqual({ date: 0, description: 1, amount: 2, ignore: [] });
  });

  it('keeps a signed amount that is followed by a balance', () => {
    const text = paste(
      ['Date', 'Description', 'Amount', 'Balance'],
      [['-84.35', '4,728.02'], ['-23.95', '4,704.07'], ['3,438.75', '8,142.82'], ['-1,071.20', '7,071.62']]
    );
    const { rows, mapping } = parseAndMap(text, true);

    expect(rows[0]).toEqual(['09/10/2026', 'Harbour Grocers Ferngrove', '-84.35', '4,728.02']);
    expect(mapping).toEqual({ date: 0, description: 1, amount: 2, balance: 3, ignore: [] });
  });

  it('splits a signed amount off a description when nothing else separates them', () => {
    const text = [
      '09/10/2026 Harbour Grocers Ferngrove -84.35',
      '13/10/2026 Banksia Pharmacy -23.95',
      '15/10/2026 Salary 3,438.75',
    ].join('\n');
    const { rows } = parseAndMap(text, false);

    expect(rows).toEqual([
      ['09/10/2026', 'Harbour Grocers Ferngrove', '-84.35'],
      ['13/10/2026', 'Banksia Pharmacy', '-23.95'],
      ['15/10/2026', 'Salary', '3,438.75'],
    ]);
  });

  it('leaves a hyphen that is not attached to the amount with the description', () => {
    const text = '09/10/2026\tPayment Received - 1,650.00\n10/10/2026\tShop\t-20.00';
    const { rows } = parseAndMap(text, false);

    expect(rows[0]).toEqual(['09/10/2026', 'Payment Received -', '1,650.00']);
    expect(rows[1]).toEqual(['10/10/2026', 'Shop', '-20.00']);
  });

  it('still splits trailing amounts off a description', () => {
    const text = [
      '6 Dec 25 TRANSFER 0064897267WL01 1,427.00 52,243.23',
      '7 Dec 25 COFFEE 4.50 52,238.73',
    ].join('\n');
    const { rows } = parseAndMap(text, false);

    expect(rows).toEqual([
      ['6 Dec 25', 'TRANSFER 0064897267WL01', '1,427.00', '52,243.23'],
      ['7 Dec 25', 'COFFEE', '4.50', '52,238.73'],
    ]);
  });
});

describe('isAmountLike', () => {
  it.each(['84.35', '-84.35', '−84.35', '+84.35', '(84.35)', '$-84.35', '84.35 DR', '84.35CR', '1,071.20'])(
    'accepts %s',
    value => {
      expect(isAmountLike(value)).toBe(true);
    }
  );

  it.each(['', 'Amount', 'Harbour Grocers', '09/10/2026'])('rejects %j', value => {
    expect(isAmountLike(value)).toBe(false);
  });
});

describe('detectPasteColumnMapping', () => {
  const DEBIT_CREDIT_TAILS = [
    ['84.35', '', '4,728.02'],
    ['23.95', '', '4,704.07'],
    ['', '3,438.75', '8,142.82'],
    ['1,071.20', '', '7,071.62'],
  ];

  it('maps Debit, Credit and Balance from their headers', () => {
    const text = paste(['Date', 'Description', 'Debit', 'Credit', 'Balance'], DEBIT_CREDIT_TAILS);
    const { mapping } = parseAndMap(text, true);

    expect(mapping).toEqual({
      date: 0,
      description: 1,
      amount: -1,
      debit: 2,
      credit: 3,
      balance: 4,
      ignore: [],
    });
  });

  it('maps Withdrawals and Deposits the same way', () => {
    const text = paste(['Date', 'Transaction', 'Withdrawals', 'Deposits', 'Balance'], DEBIT_CREDIT_TAILS);
    const { mapping } = parseAndMap(text, true);

    expect(mapping).toMatchObject({ amount: -1, debit: 2, credit: 3, balance: 4 });
  });

  it('maps a Credit column that has no values in this paste', () => {
    const text = [
      'Date\tDescription\tDebit\tCredit\tBalance',
      '09/10/2026\tA\t84.35\t\t100.00',
      '10/10/2026\tB\t23.95\t\t76.05',
    ].join('\n');
    const { mapping } = parseAndMap(text, true);

    expect(mapping).toMatchObject({ amount: -1, debit: 2, credit: 3, balance: 4 });
  });

  it('maps a lone Debit column as debit', () => {
    const text = [
      'Date\tDescription\tDebit\tBalance',
      '09/10/2026\tA\t84.35\t100.00',
      '10/10/2026\tB\t23.95\t76.05',
    ].join('\n');
    const { mapping } = parseAndMap(text, true);

    expect(mapping).toEqual({ date: 0, description: 1, amount: -1, debit: 2, balance: 3, ignore: [] });
  });

  // The regression this guards: sample signs must not decide a role. An unsigned Amount
  // column is "all positive", which once read as credit and would import as income.
  it('keeps an unsigned Amount column as a single amount, not a credit column', () => {
    const text = paste(['Date', 'Description', 'Amount'], [['84.35'], ['23.95'], ['3,438.75'], ['1,071.20']]);
    const { mapping } = parseAndMap(text, true);

    expect(mapping).toEqual({ date: 0, description: 1, amount: 2, ignore: [] });
  });

  it('prefers a plain Amount column over a Credit column beside it', () => {
    const text = [
      'Date\tDescription\tAmount\tCredit',
      '09/10/2026\tA\t-84.35\t1.00',
      '10/10/2026\tB\t23.95\t2.00',
    ].join('\n');
    const { mapping } = parseAndMap(text, true);

    expect(mapping).toMatchObject({ amount: 2 });
    expect(mapping?.debit).toBeUndefined();
    expect(mapping?.credit).toBeUndefined();
  });

  it('infers withdrawals, deposits and balance for a headerless paste', () => {
    const { headers, mapping } = parseAndMap(paste(null, DEBIT_CREDIT_TAILS), false);

    expect(headers.slice(2)).toEqual(['Withdrawals', 'Deposits', 'Balance']);
    expect(mapping).toMatchObject({ amount: -1, debit: 2, credit: 3, balance: 4 });
  });

  it('recognises a column of DR/CR amounts', () => {
    const text = 'Date\tDescription\tAmount\n09/10/2026\tA\t84.35 DR\n10/10/2026\tB\t23.95 CR';
    const { mapping } = parseAndMap(text, true);

    expect(mapping).toEqual({ date: 0, description: 1, amount: 2, ignore: [] });
  });

  it('returns null without a date or an amount column', () => {
    expect(detectPasteColumnMapping(['A', 'B'], [['hello there', 'more text']])).toBeNull();
  });
});

describe('pastedTextHasHeaderRow', () => {
  it('is true when the text opens with column names', () => {
    expect(pastedTextHasHeaderRow('Date\tDescription\tAmount\n09/10/2026\tA\t-84.35')).toBe(true);
    expect(pastedTextHasHeaderRow('Date  Description  Amount\n09/10/2026  A  -84.35')).toBe(true);
    expect(pastedTextHasHeaderRow('\r\nDate\tDescription\tDebit\tCredit\r\n09/10/2026\tA\t1.00\t')).toBe(true);
  });

  it('is false for rows of data and for empty text', () => {
    expect(pastedTextHasHeaderRow('09/10/2026\tA\t-84.35\n10/10/2026\tB\t23.95')).toBe(false);
    expect(pastedTextHasHeaderRow('')).toBe(false);
    expect(pastedTextHasHeaderRow('   \n  ')).toBe(false);
  });
});
