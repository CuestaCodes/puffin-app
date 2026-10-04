/**
 * Shared types for the transaction list, used by the Transactions page and the list
 * embedded in Monthly Budget. Both screens run on `useTransactionList`.
 */

export interface FilterValues {
  startDate: string | null;
  endDate: string | null;
  categoryId: string | null;
  sourceId: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  uncategorized: boolean;
}

export type SortField = 'date' | 'description' | 'amount';
export type SortOrder = 'asc' | 'desc';

/** Everything a transaction list lets the user control. */
export interface TransactionListState {
  filters: FilterValues;
  /** The committed (debounced) search text - what the fetch reads. */
  searchQuery: string;
  page: number;
  sortBy: SortField;
  sortOrder: SortOrder;
}

/**
 * Constraints imposed by the screen rather than chosen in the list. A value set here
 * wins over the matching filter.
 */
export interface TransactionListScope {
  startDate?: string | null;
  endDate?: string | null;
  categoryId?: string | null;
}
