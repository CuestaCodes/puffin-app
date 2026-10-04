/**
 * Pure query building for the transaction list.
 *
 * Kept free of React and of the database so Vitest can cover it: this is where the
 * Transactions page and the Monthly Budget list must provably ask for the same thing.
 */

import type {
  FilterValues,
  TransactionListScope,
  TransactionListState,
} from '@/types/transaction-list';

export const TRANSACTION_LIST_PAGE_SIZE = 20;

export const EMPTY_FILTERS: FilterValues = {
  startDate: null,
  endDate: null,
  categoryId: null,
  sourceId: null,
  minAmount: null,
  maxAmount: null,
  uncategorized: false,
};

/** First and last day of a month as YYYY-MM-DD. `month` is 1-indexed. */
export function getMonthDateRange(year: number, month: number): { startDate: string; endDate: string } {
  const mm = String(month).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    startDate: `${year}-${mm}-01`,
    endDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** The category the list is actually filtered by: the screen's scope wins over the popover. */
export function getEffectiveCategoryId(
  filters: FilterValues,
  scope?: TransactionListScope
): string | null {
  return scope?.categoryId || filters.categoryId || null;
}

/**
 * The query string for `/api/transactions`, without the leading `?`.
 *
 * Also serves as the list's identity: the fetch reruns exactly when this string changes,
 * so two states that ask for the same rows never cause a second request.
 */
export function buildTransactionListQuery(
  state: TransactionListState,
  scope?: TransactionListScope,
  limit: number = TRANSACTION_LIST_PAGE_SIZE
): string {
  const { filters } = state;
  const params = new URLSearchParams({
    page: state.page.toString(),
    limit: limit.toString(),
    sortBy: state.sortBy,
    sortOrder: state.sortOrder,
  });

  const startDate = scope?.startDate || filters.startDate;
  const endDate = scope?.endDate || filters.endDate;
  const categoryId = getEffectiveCategoryId(filters, scope);

  if (state.searchQuery) params.set('search', state.searchQuery);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  if (categoryId) params.set('categoryId', categoryId);
  if (filters.sourceId) params.set('sourceId', filters.sourceId);
  if (filters.minAmount !== null) params.set('minAmount', filters.minAmount.toString());
  if (filters.maxAmount !== null) params.set('maxAmount', filters.maxAmount.toString());
  if (filters.uncategorized) params.set('uncategorized', 'true');

  return params.toString();
}

/**
 * Whether giving a row `newCategoryId` takes it out of the list being shown, so the
 * list must be reconciled before the next page change.
 */
export function categoryChangeLeavesFilter(
  newCategoryId: string | null,
  filters: FilterValues,
  scope?: TransactionListScope
): boolean {
  if (filters.uncategorized && newCategoryId !== null) return true;
  const effective = getEffectiveCategoryId(filters, scope);
  return effective !== null && newCategoryId !== effective;
}
