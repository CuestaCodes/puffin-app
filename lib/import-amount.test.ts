import { describe, it, expect } from 'vitest';
import {
  parseAmount,
  hasExplicitSign,
  columnHasSigns,
  amountRoleFromHeader,
  findAmountRoleColumns,
  usesDebitCreditColumns,
  hasAmountColumn,
  resolveRowAmount,
  countBySign,
  describeSignSplit,
} from './import-amount';
import type { ColumnMapping } from '@/types/import';

const SINGLE: ColumnMapping = { date: 0, description: 1, amount: 2, ignore: [] };
const DEBIT_CREDIT: ColumnMapping = { date: 0, description: 1, amount: -1, debit: 2, credit: 3, ignore: [] };

describe('parseAmount', () => {
  it.each([
    ['84.35', 84.35],
    ['-84.35', -84.35],
    ['+84.35', 84.35],
    ['1,071.20', 1071.2],
    ['1,234,567.89', 1234567.89],
    ['1.234,56', 1234.56],
    ['.50', 0.5],
    ['100', 100],
  ])('reads %s as %d', (value, expected) => {
    expect(parseAmount(value)).toBe(expected);
  });

  it.each([
    ['(84.35)', -84.35],
    ['(1,071.20)', -1071.2],
    ['($84.35)', -84.35],
    ['$(84.35)', -84.35],
    ['−84.35', -84.35], // U+2212
    ['–84.35', -84.35], // en dash
    ['- 84.35', -84.35],
    ['-$84.35', -84.35],
    ['$-84.35', -84.35],
    ['84.35 DR', -84.35],
    ['84.35DR', -84.35],
  ])('reads %s as the negative %d', (value, expected) => {
    expect(parseAmount(value)).toBe(expected);
  });

  it('reads a CR marker as positive', () => {
    expect(parseAmount('84.35 CR')).toBe(84.35);
    expect(parseAmount('-84.35 CR')).toBe(84.35);
  });

  it('ignores a currency symbol or code at either end', () => {
    expect(parseAmount('$84.35')).toBe(84.35);
    expect(parseAmount('AUD 84.35')).toBe(84.35);
    expect(parseAmount('84.35 AUD')).toBe(84.35);
    expect(parseAmount('R1,234.50')).toBe(1234.5);
  });

  it.each(['', '   ', 'abc', '-', '(', '12 Main St', '84.35-', 'Debit'])(
    'returns null for %j rather than guessing',
    value => {
      expect(parseAmount(value)).toBeNull();
    }
  );
});

describe('hasExplicitSign', () => {
  it.each(['-84.35', '−84.35', '(84.35)', '+5', '$-1', '-$1', '1 DR', '1CR', '- 3'])(
    'is true for %s',
    value => {
      expect(hasExplicitSign(value)).toBe(true);
    }
  );

  it.each(['84.35', '$84.35', '', 'Amount', 'Non-refundable 5'])('is false for %j', value => {
    expect(hasExplicitSign(value)).toBe(false);
  });
});

describe('columnHasSigns', () => {
  it('is true when any value is signed', () => {
    expect(columnHasSigns(['84.35', '-23.95', '3,438.75'])).toBe(true);
  });

  it('is false for a wholly unsigned column, including blanks', () => {
    expect(columnHasSigns(['84.35', '', '3,438.75'])).toBe(false);
    expect(columnHasSigns([])).toBe(false);
  });
});

describe('amountRoleFromHeader', () => {
  it.each(['Debit', 'Debit Amount', 'Withdrawals', 'Paid out', 'Payment', 'Dr', 'Dr.'])(
    'reads %s as debit',
    header => {
      expect(amountRoleFromHeader(header)).toBe('debit');
    }
  );

  it.each(['Credit', 'Credit Amount', 'Deposits', 'Paid in', 'Income', 'Cr', 'Received'])(
    'reads %s as credit',
    header => {
      expect(amountRoleFromHeader(header)).toBe('credit');
    }
  );

  it.each(['Balance', 'Running Balance', 'Running total'])('reads %s as balance', header => {
    expect(amountRoleFromHeader(header)).toBe('balance');
  });

  // "Amount" names a signed column, not a direction. The others only end in the letters
  // of a pattern: "Origin" and "Margin" end in "in", "Addr" in "dr", "Layout" in "out".
  it.each(['Amount', 'Date', 'Description', 'Origin', 'Margin', 'Addr', 'Layout', ''])(
    'reads %j as no role',
    header => {
      expect(amountRoleFromHeader(header)).toBeNull();
    }
  );
});

describe('findAmountRoleColumns', () => {
  it('finds each role by header', () => {
    expect(findAmountRoleColumns(['Date', 'Description', 'Debit', 'Credit', 'Balance'])).toEqual({
      debit: 2,
      credit: 3,
      balance: 4,
    });
  });

  it('returns -1 for a role no header names', () => {
    expect(findAmountRoleColumns(['Date', 'Description', 'Amount'])).toEqual({
      debit: -1,
      credit: -1,
      balance: -1,
    });
  });

  // "Payment" and "Expense" are debit words too, but name a text column here
  it('prefers a header that names the role outright over a looser match before it', () => {
    expect(findAmountRoleColumns(['Date', 'Payment Reference', 'Debit', 'Credit'])).toMatchObject({
      debit: 2,
      credit: 3,
    });
    expect(findAmountRoleColumns(['Expense Category', 'Withdrawal', 'Income Type', 'Deposit'])).toMatchObject({
      debit: 1,
      credit: 3,
    });
  });

  it('falls back to a looser match when nothing names the role outright', () => {
    expect(findAmountRoleColumns(['Date', 'Details', 'Paid out', 'Paid in'])).toMatchObject({
      debit: 2,
      credit: 3,
    });
  });

  it('skips excluded columns', () => {
    expect(findAmountRoleColumns(['Payment', 'Debit'], [1])).toMatchObject({ debit: 0 });
    expect(findAmountRoleColumns(['Debit', 'Credit'], [0, -1])).toMatchObject({ debit: -1, credit: 1 });
  });
});

describe('usesDebitCreditColumns / hasAmountColumn', () => {
  it('single mode needs an amount column', () => {
    expect(usesDebitCreditColumns(SINGLE)).toBe(false);
    expect(hasAmountColumn(SINGLE)).toBe(true);
    expect(hasAmountColumn({ ...SINGLE, amount: -1 })).toBe(false);
  });

  it('debit/credit mode is on with either field present, even as a -1 placeholder', () => {
    expect(usesDebitCreditColumns(DEBIT_CREDIT)).toBe(true);
    expect(usesDebitCreditColumns({ ...SINGLE, amount: -1, debit: -1, credit: -1 })).toBe(true);
    expect(usesDebitCreditColumns({ ...SINGLE, amount: -1, credit: 3 })).toBe(true);
  });

  it('debit/credit mode needs at least one of the two mapped', () => {
    expect(hasAmountColumn(DEBIT_CREDIT)).toBe(true);
    expect(hasAmountColumn({ ...SINGLE, amount: -1, debit: 2 })).toBe(true);
    expect(hasAmountColumn({ ...SINGLE, amount: -1, debit: -1, credit: -1 })).toBe(false);
    // A stale single amount index does not count once the mode is debit/credit
    expect(hasAmountColumn({ ...SINGLE, amount: 2, debit: -1, credit: -1 })).toBe(false);
  });
});

describe('resolveRowAmount', () => {
  describe('single amount column', () => {
    it('keeps the amount as written', () => {
      expect(resolveRowAmount(['d', 'x', '-84.35'], SINGLE)).toEqual({ amount: -84.35, error: null });
      expect(resolveRowAmount(['d', 'x', '3,438.75'], SINGLE)).toEqual({ amount: 3438.75, error: null });
      expect(resolveRowAmount(['d', 'x', '(84.35)'], SINGLE)).toEqual({ amount: -84.35, error: null });
    });

    it('makes every amount an expense when unsignedAsExpense is set', () => {
      const options = { unsignedAsExpense: true };
      expect(resolveRowAmount(['d', 'x', '84.35'], SINGLE, options).amount).toBe(-84.35);
      expect(resolveRowAmount(['d', 'x', '-84.35'], SINGLE, options).amount).toBe(-84.35);
    });

    it('reports a missing or unreadable amount', () => {
      expect(resolveRowAmount(['d', 'x', ''], SINGLE)).toEqual({ amount: null, error: 'Missing amount' });
      expect(resolveRowAmount(['d', 'x'], SINGLE)).toEqual({ amount: null, error: 'Missing amount' });
      expect(resolveRowAmount(['d', 'x', 'abc'], SINGLE)).toEqual({
        amount: null,
        error: 'Invalid amount: "abc"',
      });
      expect(resolveRowAmount(['d', 'x', '5'], { ...SINGLE, amount: -1 }).error).toBe('Missing amount');
    });
  });

  describe('debit and credit columns', () => {
    it('reads a debit as an expense and a credit as income', () => {
      expect(resolveRowAmount(['d', 'x', '84.35', ''], DEBIT_CREDIT)).toEqual({ amount: -84.35, error: null });
      expect(resolveRowAmount(['d', 'x', '', '3,438.75'], DEBIT_CREDIT)).toEqual({ amount: 3438.75, error: null });
    });

    it('goes by the column, not the sign in the cell', () => {
      expect(resolveRowAmount(['d', 'x', '-84.35', ''], DEBIT_CREDIT).amount).toBe(-84.35);
      expect(resolveRowAmount(['d', 'x', '', '-50.00'], DEBIT_CREDIT).amount).toBe(50);
    });

    it('ignores unsignedAsExpense', () => {
      const result = resolveRowAmount(['d', 'x', '', '50.00'], DEBIT_CREDIT, { unsignedAsExpense: true });
      expect(result.amount).toBe(50);
    });

    it('treats a zero beside a real value as empty', () => {
      expect(resolveRowAmount(['d', 'x', '0.00', '7.00'], DEBIT_CREDIT).amount).toBe(7);
      expect(resolveRowAmount(['d', 'x', '7.00', '0.00'], DEBIT_CREDIT).amount).toBe(-7);
    });

    it('works with only one of the two columns mapped', () => {
      const debitOnly: ColumnMapping = { date: 0, description: 1, amount: -1, debit: 2, ignore: [] };
      expect(resolveRowAmount(['d', 'x', '84.35'], debitOnly).amount).toBe(-84.35);

      const creditOnly: ColumnMapping = { date: 0, description: 1, amount: -1, credit: 2, ignore: [] };
      expect(resolveRowAmount(['d', 'x', '84.35'], creditOnly).amount).toBe(84.35);
    });

    it('refuses a row with an amount in both columns', () => {
      expect(resolveRowAmount(['d', 'x', '5.00', '7.00'], DEBIT_CREDIT)).toEqual({
        amount: null,
        error: 'Both debit and credit columns have an amount',
      });
    });

    it('reports empty, zero and unreadable rows', () => {
      expect(resolveRowAmount(['d', 'x', '', ''], DEBIT_CREDIT).error).toBe(
        'Missing amount in both debit and credit columns'
      );
      expect(resolveRowAmount(['d', 'x', '0.00', ''], DEBIT_CREDIT).error).toBe(
        'Amount is zero in both debit and credit columns'
      );
      expect(resolveRowAmount(['d', 'x', 'abc', ''], DEBIT_CREDIT).error).toBe('Invalid debit amount: "abc"');
      expect(resolveRowAmount(['d', 'x', '', 'abc'], DEBIT_CREDIT).error).toBe('Invalid credit amount: "abc"');
    });
  });
});

describe('countBySign / describeSignSplit', () => {
  it('counts expenses and income, skipping nulls and zeros', () => {
    expect(countBySign([-84.35, -23.95, 3438.75, null, 0])).toEqual({ expenses: 2, income: 1 });
  });

  it('describes the split', () => {
    expect(describeSignSplit([-84.35, -23.95, 3438.75, -1071.2])).toBe('3 expenses · 1 income');
    expect(describeSignSplit([-1])).toBe('1 expense · 0 income');
    expect(describeSignSplit([])).toBe('0 expenses · 0 income');
  });
});
