'use client';

import { useEffect, useCallback, useMemo, memo } from 'react';
import { useMonthlyTransactionsState } from '@/hooks/use-page-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus, Search, X, ChevronLeft, ChevronRight,
  Trash2, Edit2, ArrowUpDown, ArrowUp, ArrowDown, Split, Undo2, Filter, Sparkles, Copy
} from 'lucide-react';
import { TransactionForm } from './transaction-form';
import { DeleteDialog } from './delete-dialog';
import { CategorySelector } from './category-selector';
import { SplitModal } from './split-modal';
import { FiltersPopover } from './filters-popover';
import { useTransactionList } from './use-transaction-list';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RuleDialog } from '@/components/rules';
import { getEffectiveCategoryId, getMonthDateRange } from '@/lib/transaction-list-query';
import type {
  FilterValues,
  SortField,
  SortOrder,
  TransactionListState,
} from '@/types/transaction-list';
import { cn } from '@/lib/utils';

interface MonthlyTransactionListProps {
  year: number;
  month: number;
  categoryFilter: string | null;
  onClearCategoryFilter?: () => void;
  onCategoryChange?: () => void;
}

function SortIcon({ field, sortBy, sortOrder }: { field: SortField; sortBy: SortField; sortOrder: SortOrder }) {
  if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
  return sortOrder === 'asc' 
    ? <ArrowUp className="w-3 h-3 text-cyan-400" />
    : <ArrowDown className="w-3 h-3 text-cyan-400" />;
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

  const {
    transactions,
    isLoading,
    total,
    totalPages,
    searchInput,
    setSearchInput,
    setFilters,
    handleSort,
    handleNextPage,
    handlePrevPage,
    selectedIds,
    allSelected,
    handleSelectAll,
    handleSelectOne,
    clearSelection,
    handleBulkDelete,
    confirmBulkDelete,
    showBulkDeleteConfirm,
    setShowBulkDeleteConfirm,
    bulkDeleteCount,
    isBulkDeleting,
    showTransactionForm,
    handleTransactionFormOpenChange,
    editingTransaction,
    duplicatingTransaction,
    deletingTransaction,
    setDeletingTransaction,
    splittingTransaction,
    setSplittingTransaction,
    creatingRuleFromTransaction,
    setCreatingRuleFromTransaction,
    handleAddTransaction,
    handleEditTransaction,
    handleDuplicateTransaction,
    handleDeleteTransaction,
    handleTransactionSaved,
    handleTransactionDeleted,
    handleCategoryChange,
    handleSplitTransaction,
    handleUnsplitTransaction,
    handleSplitSuccess,
    handleRuleCreated,
  } = useTransactionList({
    state: listState,
    setState: setListState,
    scope,
    onDataChanged: onCategoryChange,
  });
  const { page } = listState;

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

  const formatAmount = (amount: number): string => {
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Math.abs(amount));
    return amount < 0 ? `-${formatted}` : formatted;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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

          {/* Bulk actions bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-4 p-3 mb-4 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
              <span className="text-sm text-cyan-400 font-medium">
                {selectedIds.size} selected
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="gap-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelection}
                className="ml-auto text-slate-400 hover:text-slate-200"
              >
                Clear selection
              </Button>
            </div>
          )}

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
            <>
              {/* Transaction table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-700">
                      <th className="py-3 px-2 w-10">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={handleSelectAll}
                          className="border-slate-600"
                          aria-label="Select all"
                        />
                      </th>
                      <th className="text-left py-3 px-4">
                        <button
                          onClick={() => handleSort('date')}
                          className="flex items-center gap-1 text-xs font-medium text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
                        >
                          Date
                          <SortIcon field="date" sortBy={sortBy} sortOrder={sortOrder} />
                        </button>
                      </th>
                      <th className="text-left py-3 px-4">
                        <button
                          onClick={() => handleSort('description')}
                          className="flex items-center gap-1 text-xs font-medium text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors"
                        >
                          Description
                          <SortIcon field="description" sortBy={sortBy} sortOrder={sortOrder} />
                        </button>
                      </th>
                      <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Category
                      </th>
                      <th className="text-right py-3 px-4">
                        <button
                          onClick={() => handleSort('amount')}
                          className="flex items-center gap-1 text-xs font-medium text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors ml-auto"
                        >
                          Amount
                          <SortIcon field="amount" sortBy={sortBy} sortOrder={sortOrder} />
                        </button>
                      </th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {transactions.map((tx) => {
                      // Grey out split parents and transfer category transactions
                      const isTransfer = tx.upper_category_type === 'transfer';
                      const isGreyedOut = tx.is_split || isTransfer;

                      return (
                      <tr
                        key={tx.id}
                        className={cn(
                          'hover:bg-slate-800/50 transition-colors',
                          selectedIds.has(tx.id) && 'bg-cyan-500/5',
                          isGreyedOut && 'opacity-50' // Greyed out - excluded from calculations
                        )}
                      >
                        <td className="py-3 px-2">
                          <Checkbox
                            checked={selectedIds.has(tx.id)}
                            onCheckedChange={(checked) => handleSelectOne(tx.id, !!checked)}
                            className="border-slate-600"
                            aria-label={`Select ${tx.description}`}
                          />
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-300 whitespace-nowrap">
                          {formatDate(tx.date)}
                        </td>
                        <td className="py-3 px-4 text-sm text-slate-200 max-w-[300px]">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="truncate">{tx.description}</span>
                              {!!tx.is_split && (
                                <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-500/20 text-violet-400 border border-violet-500/30">
                                  SPLIT
                                </span>
                              )}
                              {!!tx.parent_transaction_id && (
                                <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-slate-500/20 text-slate-400 border border-slate-500/30">
                                  CHILD
                                </span>
                              )}
                              {isTransfer && (
                                <span
                                  className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                  title="Transfer transactions are excluded from budget calculations"
                                >
                                  TRANSFER
                                </span>
                              )}
                              {tx.source_name && (
                                <span
                                  className="shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                  title={`Source: ${tx.source_name}`}
                                >
                                  {tx.source_name}
                                </span>
                              )}
                            </div>
                            {tx.notes && (
                              <p
                                className="text-xs text-slate-500 truncate max-w-[280px]"
                                title={tx.notes}
                              >
                                {tx.notes}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-sm">
                          <CategorySelector
                            value={tx.sub_category_id}
                            onChange={(catId) => handleCategoryChange(tx.id, catId)}
                            compact
                          />
                        </td>
                        <td className={cn(
                          'py-3 px-4 text-sm font-mono text-right whitespace-nowrap',
                          tx.amount < 0 ? 'text-red-400' : 'text-emerald-400'
                        )}>
                          {formatAmount(tx.amount)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {/* Create Rule button */}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-slate-400 hover:text-violet-400"
                              onClick={() => setCreatingRuleFromTransaction(tx)}
                              title="Create auto-categorization rule"
                              aria-label="Create auto-categorization rule"
                            >
                              <Sparkles className="w-4 h-4" />
                            </Button>
                            {/* Split/Unsplit button */}
                            {tx.is_split ? (
                              <Button 
                                variant="ghost" 
                                size="icon-sm" 
                                className="text-violet-400 hover:text-violet-300"
                                onClick={() => handleUnsplitTransaction(tx)}
                                title="Unsplit transaction"
                                aria-label="Unsplit transaction"
                              >
                                <Undo2 className="w-4 h-4" />
                              </Button>
                            ) : !tx.parent_transaction_id && (
                              <Button 
                                variant="ghost" 
                                size="icon-sm" 
                                className="text-slate-400 hover:text-violet-400"
                                onClick={() => handleSplitTransaction(tx)}
                                title="Split transaction"
                                aria-label="Split transaction"
                              >
                                <Split className="w-4 h-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-slate-400 hover:text-cyan-400"
                              onClick={() => handleDuplicateTransaction(tx)}
                              title="Duplicate transaction"
                              aria-label="Duplicate transaction"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-slate-400 hover:text-slate-200"
                              onClick={() => handleEditTransaction(tx)}
                              title="Edit transaction"
                              aria-label="Edit transaction"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon-sm" 
                              className="text-slate-400 hover:text-red-400"
                              onClick={() => handleDeleteTransaction(tx)}
                              title="Delete transaction"
                              aria-label="Delete transaction"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-800">
                  <p className="text-sm text-slate-400">
                    Page {page} of {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevPage}
                      disabled={page === 1}
                      className="border-slate-700"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={page === totalPages}
                      className="border-slate-700"
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Transaction Form Modal */}
      <TransactionForm
        open={showTransactionForm}
        onOpenChange={handleTransactionFormOpenChange}
        transaction={editingTransaction}
        duplicateFrom={duplicatingTransaction}
        onSuccess={handleTransactionSaved}
        defaultDate={editingTransaction?.date || getDefaultTransactionDate(year, month)}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteDialog
        open={!!deletingTransaction}
        onOpenChange={(open) => !open && setDeletingTransaction(null)}
        transaction={deletingTransaction}
        onSuccess={handleTransactionDeleted}
      />

      <SplitModal
        open={!!splittingTransaction}
        onOpenChange={(open) => !open && setSplittingTransaction(null)}
        transaction={splittingTransaction}
        onSuccess={handleSplitSuccess}
      />

      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">
              Delete {bulkDeleteCount} transaction{bulkDeleteCount !== 1 ? 's' : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {bulkDeleteCount === 1 ? 'It' : 'They'} will be removed from your view.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog up until the deletes resolve, so it cannot be
                // dismissed while the requests are still in flight
                e.preventDefault();
                confirmBulkDelete();
              }}
              disabled={isBulkDeleting}
              className="bg-red-600 hover:bg-red-500 text-white"
            >
              {isBulkDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Rule Dialog */}
      <RuleDialog
        open={!!creatingRuleFromTransaction}
        onOpenChange={(open) => !open && setCreatingRuleFromTransaction(null)}
        defaultMatchText={creatingRuleFromTransaction?.description || ''}
        defaultCategoryId={creatingRuleFromTransaction?.sub_category_id || ''}
        onSuccess={handleRuleCreated}
      />
    </>
  );
});
