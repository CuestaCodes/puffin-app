/**
 * How an imported row gets its amount and sign — shared by the CSV and paste importers.
 *
 * Puffin's convention is negative = expense, positive = income. The two importers used to
 * work this out separately and disagreed: the CSV one dropped parentheses and DR/CR markers,
 * and the paste one discarded every sign. Both now go through `resolveRowAmount`.
 */

import type { ColumnMapping } from '@/types/import';

export type AmountRole = 'debit' | 'credit' | 'balance';

const MINUS_SIGNS = /[−–]/g; // U+2212 minus and en dash, as copied from PDFs

/**
 * Parse amount string to number
 */
export function parseAmount(value: string): number | null {
  if (!value || !value.trim()) return null;

  let cleaned = value.trim().replace(MINUS_SIGNS, '-');

  // Check for DR/CR indicators
  const isDebit = /DR$/i.test(cleaned);
  const isCredit = /CR$/i.test(cleaned);
  cleaned = cleaned.replace(/\s*(DR|CR)$/i, '');

  // Remove currency symbols and whitespace
  cleaned = cleaned.replace(/[$£€¥₹\s]/g, '');

  // Check for parentheses (negative)
  const isNegativeParens = /^\(.*\)$/.test(cleaned);
  if (isNegativeParens) {
    cleaned = cleaned.slice(1, -1);
  }

  // Remove a currency code at either end (R, AUD, kr)
  cleaned = cleaned
    .replace(/^([-+]?)[A-Za-z]{1,3}/, '$1')
    .replace(/[A-Za-z]{1,3}$/, '');

  // Remove thousands separators (detect format first)
  const hasCommaDecimal = /\d,\d{1,2}$/.test(cleaned);
  if (hasCommaDecimal) {
    // European format: 1.234,56
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // US/UK format: 1,234.56
    cleaned = cleaned.replace(/,/g, '');
  }

  // Anything left that is not a plain number is not an amount. parseFloat alone would
  // read "12 Main St" as 12.
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) return null;

  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  // Apply sign based on indicators
  if (isNegativeParens || isDebit) {
    return -Math.abs(num);
  }
  if (isCredit) {
    return Math.abs(num);
  }

  return num;
}

/**
 * Whether a value says which way the money went: a sign before the number, parentheses,
 * or a DR/CR marker. A bare `84.35` does not.
 */
export function hasExplicitSign(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    /(DR|CR)$/i.test(trimmed) ||
    /^\(.*\)$/.test(trimmed) ||
    /^[$£€¥₹]?\s*[-−–+]\s*[$£€¥₹]?\s*[\d.]/.test(trimmed)
  );
}

/** Whether any value in an amount column carries an explicit sign. */
export function columnHasSigns(values: string[]): boolean {
  return values.some(value => hasExplicitSign(value ?? ''));
}

/**
 * What a column header says about an amount column, or null when it says nothing.
 * `Amount` is null: it names a single signed column, not a direction.
 */
export function amountRoleFromHeader(header: string): AmountRole | null {
  const lower = header.toLowerCase().trim();

  // Debit/withdrawal patterns
  if (/withdraw|debit|\bdr\.?$|payment|expense|\bout$/.test(lower)) {
    return 'debit';
  }

  // Credit/deposit patterns
  if (/deposit|credit|\bcr\.?$|income|\bin$|received/.test(lower)) {
    return 'credit';
  }

  // Balance patterns
  if (/balance|running|total$/.test(lower)) {
    return 'balance';
  }

  return null;
}

// Headers that name a direction outright. "Payment Reference" and "Expense Category" also
// read as debit by the looser patterns above, so these are looked for first.
const STRONG_ROLE_PATTERNS: Record<AmountRole, RegExp> = {
  debit: /debit|withdraw/,
  credit: /credit|deposit/,
  balance: /balance/,
};

/**
 * The column for each amount role, going by header names alone: -1 where no header names
 * the role. `exclude` lists columns already taken (date, description).
 *
 * A header that names the role outright wins over one that merely matches a looser word,
 * wherever each sits: with `Payment Reference, Debit, Credit` the debit column is `Debit`.
 */
export function findAmountRoleColumns(
  headers: string[],
  exclude: number[] = []
): Record<AmountRole, number> {
  const lower = headers.map(header => header.toLowerCase());
  const roles = headers.map((header, index) =>
    exclude.includes(index) ? null : amountRoleFromHeader(header)
  );

  const find = (role: AmountRole): number => {
    const strong = roles.findIndex((r, index) => r === role && STRONG_ROLE_PATTERNS[role].test(lower[index]));
    return strong !== -1 ? strong : roles.indexOf(role);
  };

  return { debit: find('debit'), credit: find('credit'), balance: find('balance') };
}

/**
 * Debit/credit mode is on when either field is present on the mapping, including the
 * `-1` placeholder for "mode chosen, column not picked yet".
 */
export function usesDebitCreditColumns(mapping: ColumnMapping): boolean {
  return mapping.debit !== undefined || mapping.credit !== undefined;
}

/** Whether the mapping names at least one column to read amounts from. */
export function hasAmountColumn(mapping: ColumnMapping): boolean {
  if (usesDebitCreditColumns(mapping)) {
    return (mapping.debit ?? -1) >= 0 || (mapping.credit ?? -1) >= 0;
  }
  return mapping.amount >= 0;
}

export interface ResolvedAmount {
  amount: number | null;
  /** Why there is no amount; null when `amount` is set */
  error: string | null;
}

export interface ResolveAmountOptions {
  /**
   * Single-column mode only: make every amount negative. For a column with no signs at
   * all, where the values cannot say which way the money went.
   */
  unsignedAsExpense?: boolean;
}

/**
 * Work out one row's signed amount from the mapping.
 *
 * - Debit/credit mode: a debit value is an expense, a credit value is income, whatever
 *   sign the cell carries. A row with both is refused rather than guessed at.
 * - Single-column mode: the amount as written, unless `unsignedAsExpense` is set.
 */
export function resolveRowAmount(
  row: string[],
  mapping: ColumnMapping,
  options: ResolveAmountOptions = {}
): ResolvedAmount {
  const cell = (index: number | undefined): string =>
    index !== undefined && index >= 0 ? (row[index] ?? '').trim() : '';

  if (usesDebitCreditColumns(mapping)) {
    const rawDebit = cell(mapping.debit);
    const rawCredit = cell(mapping.credit);

    if (!rawDebit && !rawCredit) {
      return { amount: null, error: 'Missing amount in both debit and credit columns' };
    }

    const debit = rawDebit ? parseAmount(rawDebit) : 0;
    const credit = rawCredit ? parseAmount(rawCredit) : 0;

    if (debit === null) return { amount: null, error: `Invalid debit amount: "${rawDebit}"` };
    if (credit === null) return { amount: null, error: `Invalid credit amount: "${rawCredit}"` };
    if (debit !== 0 && credit !== 0) {
      return { amount: null, error: 'Both debit and credit columns have an amount' };
    }
    if (debit !== 0) return { amount: -Math.abs(debit), error: null };
    if (credit !== 0) return { amount: Math.abs(credit), error: null };
    return { amount: null, error: 'Amount is zero in both debit and credit columns' };
  }

  const rawAmount = cell(mapping.amount);
  if (!rawAmount) return { amount: null, error: 'Missing amount' };

  const parsed = parseAmount(rawAmount);
  if (parsed === null) return { amount: null, error: `Invalid amount: "${rawAmount}"` };

  return {
    amount: options.unsignedAsExpense ? -Math.abs(parsed) : parsed,
    error: null,
  };
}

/** How many amounts are expenses and how many income, for the preview's sign check. */
export function countBySign(amounts: Array<number | null>): { expenses: number; income: number } {
  let expenses = 0;
  let income = 0;
  for (const amount of amounts) {
    if (amount === null || amount === 0) continue;
    if (amount < 0) expenses++;
    else income++;
  }
  return { expenses, income };
}

/** "3 expenses · 1 income" */
export function describeSignSplit(amounts: Array<number | null>): string {
  const { expenses, income } = countBySign(amounts);
  return `${expenses} expense${expenses !== 1 ? 's' : ''} · ${income} income`;
}
