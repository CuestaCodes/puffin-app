'use client';

import { useEffect, useCallback, useMemo, memo } from 'react';
import { useMonthlyTransactionsState } from '@/hooks/use-page-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, X, Filter } from 'lucide-react';
import { FiltersPopover } from './filters-popover';
import { TransactionTable } from './transaction-table';
import { TransactionListDialogs } from './transaction-list-dialogs';
import { useTransactionList } from './use-transaction-list';
import { getEffectiveCategoryId, getMonthDateRange } from '@/lib/transaction-list-query';
import type { FilterValues, TransactionListState } from '@/types/transaction-list';

interface MonthlyTransactionListProps {
  year: number;
  month: number;
  categoryFilter: string | null;
  onClearCategoryFilter?: () => void;
  onCategoryChange?: () => void;
}

// Calculate default date for new transactions
function getDefaultTransactionDate(year: number, month: number): string {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1; // 1-indexed

  if (year === currentYear && month === currentMonth) {
    // Current month: use today's date
    return `${year}-${String(month).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  } else {
    // Past or future month: use day 15 as a reasonable default
    return `${year}-${String(month).padStart(2, '0')}-15`;
  }
}

// Memoized to prevent re-renders when parent budget data updates
export const MonthlyTransactionList = memo(function MonthlyTransactionList({
  year,
  month,
  categoryFilter,
  onClearCategoryFilter,
  onCategoryChange
}: MonthlyTransactionListProps) {
  // Persisted state from context (survives navigation). Filters, search and sort carry
  // across months; the page number belongs to one month and category.
  const {
    setMonthlyTransactionsState,
    pageScope,
    page: savedPage,
    filters,
    searchQuery,
    sortBy,
    sortOrder,
  } = useMonthlyTransactionsState();

  // The month is fixed by the page, and a budget tile click fixes the category.
  const scope = useMemo(
    () => ({ ...getMonthDateRange(year, month), categoryId: categoryFilter }),
    [year, month, categoryFilter]
  );

  // A saved page only means something for the month and category it was reached in.
  // Deriving it, rather than resetting it in an effect, means a new month fetches page 1
  // straight away instead of fetching the stale page first.
  const scopeKey = `${year}-${month}|${categoryFilter ?? ''}`;
  const listState = useMemo<TransactionListState>(
    () => ({
      filters,
      searchQuery,
      sortBy,
      sortOrder,
      page: pageScope === scopeKey ? savedPage : 1,
    }),
    [filters, searchQuery, sortBy, sortOrder, pageScope, scopeKey, savedPage]
  );
  const setListState = useCallback(
    (partial: Partial<TransactionListState>) => {
      setMonthlyTransactionsState(
        partial.page !== undefined ? { ...partial, pageScope: scopeKey } : partial
      );
    },
    [setMonthlyTransactionsState, scopeKey]
  );

  const list = useTransactionList({
    state: listState,
    setState: setListState,
    scope,
    onDataChanged: onCategoryChange,
  });
  const {
    transactions,
    isLoading,
    total,
    searchInput,
    setSearchInput,
    setFilters,
    handleAddTransaction,
  } = list;

  // The budget tile's category wins over the popover's. The popover is shown the one
  // in effect, so it reads correctly after a tile click.
  const effectiveCategoryId = getEffectiveCategoryId(filters, scope);
  const shownFilters = useMemo<FilterValues>(
    () => ({ ...filters, categoryId: effectiveCategoryId }),
    [filters, effectiveCategoryId]
  );

  // A tile click replaces a category picked in the popover; without this the popover's
  // pick would resurface when the tile filter is cleared. The list is already filtered
  // by the tile's category, so this changes nothing that is fetched.
  useEffect(() => {
    if (categoryFilter && filters.categoryId) {
      setMonthlyTransactionsState({ filters: { ...filters, categoryId: null } });
    }
  }, [categoryFilter, filters, setMonthlyTransactionsState]);

  const handleFiltersChange = (newFilters: FilterValues) => {
    // If user changed category via popover, clear the parent's categoryFilter
    // so the popover selection takes effect (categoryFilter has priority otherwise)
    const categoryChanged = newFilters.categoryId !== effectiveCategoryId;
    if (categoryChanged) onClearCategoryFilter?.();
    // The tile's category lives in the parent, so it is not stored here as well.
    setFilters(categoryChanged ? newFilters : { ...newFilters, categoryId: filters.categoryId });
  };

  const handleClearCategoryFilter = () => {
    // Clear parent's category filter (from clicking budget categories)
    onClearCategoryFilter?.();
    // Also clear the popover's
    if (filters.categoryId) setFilters({ ...filters, categoryId: null });
  };

  const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long' });

  return (
    <>
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="space-y-1">
            <CardTitle className="text-lg text-slate-100">
              {monthName} Transactions
            </CardTitle>
            {total > 0 && (
              <p className="text-sm text-slate-400">
                {total} transaction{total !== 1 ? 's' : ''}
                {categoryFilter && ' in selected category'}
              </p>
            )}
          </div>
          <Button 
            onClick={handleAddTransaction}
            size="sm"
            className="gap-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20"
          >
            <Plus className="w-4 h-4" />
            Add Transaction
          </Button>
        </CardHeader>
        <CardContent>
          {/* Search bar with filters and category filter indicator */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search transactions..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-10 bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-cyan-500"
              />
              {searchInput && (
                <button
                  onClick={() => setSearchInput('')}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <FiltersPopover
              filters={shownFilters}
              onChange={handleFiltersChange}
              hideDateRange
            >
              <Button variant="outline" className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                <Filter className="w-4 h-4" />
                Filters
              </Button>
            </FiltersPopover>
            {effectiveCategoryId && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearCategoryFilter}
                className="gap-1.5 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
              >
                <X className="w-3 h-3" />
                Clear category filter
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-slate-500">
              <div className="w-8 h-8 mx-auto mb-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <p>Loading transactions...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p className="font-medium text-slate-400">
                {categoryFilter 
                  ? 'No transactions in this category for ' + monthName
                  : 'No transactions for ' + monthName
                }
              </p>
              <p className="text-sm mt-1">
                {categoryFilter 
                  ? 'Try clearing the category filter or add a new transaction'
                  : 'Add transactions manually to get started'
                }
              </p>
              <Button 
                onClick={handleAddTransaction}
                className="gap-2 bg-cyan-600 hover:bg-cyan-500 mt-4"
              >
                <Plus className="w-4 h-4" />
                Add Transaction
              </Button>
            </div>
          ) : (
            <TransactionTable list={list} />
          )}
        </CardContent>
      </Card>

      <TransactionListDialogs list={list} defaultDate={getDefaultTransactionDate(year, month)} />
    </>
  );
});
