'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/services';
import { withScrollPreservation } from '@/lib/utils';
import { SEARCH_DEBOUNCE_MS } from '@/lib/constants';
import {
  buildTransactionListQuery,
  categoryChangeLeavesFilter,
  getNextSort,
} from '@/lib/transaction-list-query';
import type { TransactionWithCategory } from '@/types/database';
import type {
  FilterValues,
  SortField,
  TransactionListScope,
  TransactionListState,
} from '@/types/transaction-list';

interface TransactionListResponse {
  transactions: TransactionWithCategory[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface PendingBulkCategory {
  ids: string[];
  categoryId: string | null;
  /** How many of the other selected rows already have a different category. */
  overwriteCount: number;
}

interface UseTransactionListOptions {
  /** Filters, search, page and sort. The caller owns where this lives. */
  state: TransactionListState;
  setState: (partial: Partial<TransactionListState>) => void;
  /** Constraints the screen imposes, e.g. the displayed month. */
  scope?: TransactionListScope;
  /** Called after any change to the data, so a parent can refresh what it derives from it. */
  onDataChanged?: () => void;
}

/**
 * The one implementation of the transaction list: fetching, paging, search, selection
 * and every row action. The Transactions page and the Monthly Budget list both run on
 * it, so a list fix is made once.
 */
export function useTransactionList({ state, setState, scope, onDataChanged }: UseTransactionListOptions) {
  const { filters, searchQuery, page, sortBy, sortOrder } = state;

  // Modals
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithCategory | null>(null);
  const [duplicatingTransaction, setDuplicatingTransaction] = useState<TransactionWithCategory | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<TransactionWithCategory | null>(null);
  const [splittingTransaction, setSplittingTransaction] = useState<TransactionWithCategory | null>(null);
  const [creatingRuleFromTransaction, setCreatingRuleFromTransaction] = useState<TransactionWithCategory | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [bulkDeleteCount, setBulkDeleteCount] = useState(0);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  // A bulk categorise waiting on confirmation because it would replace existing categories.
  const [pendingBulkCategory, setPendingBulkCategory] = useState<PendingBulkCategory | null>(null);

  // Data
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // What the search box shows. It updates on every keystroke to keep the input
  // responsive; `state.searchQuery`, which the fetch reads, trails it by
  // SEARCH_DEBOUNCE_MS so typing fires one request instead of one per letter.
  const [searchInput, setSearchInput] = useState(searchQuery);

  // Set when an in-place edit (e.g. categorising under the uncategorised/category
  // filter) may have made rows no longer match the active filter. We defer dropping
  // them until the next navigation/action so the list doesn't reflow mid-edit.
  const needsReconcile = useRef(false);

  // Set only by the pager, so scroll is preserved when paging but not when the month,
  // filters, search or sort change - those should start the user at the top of a
  // fresh list.
  const preserveScrollOnPageChange = useRef(false);

  // The fetch is keyed on this string rather than on the state objects, so a state
  // change that asks for the same rows does not refetch.
  const query = buildTransactionListQuery(state, scope);

  /**
   * @param background refresh in place, leaving the current rows on screen.
   *
   * A foreground fetch swaps the table for a spinner, which collapses the scroll
   * container and clamps the scroll position to the top. That was the jump seen when
   * categorising, deleting or splitting a row: not a scroll bug, but the list deleting
   * the content whose position it was trying to preserve.
   */
  const fetchTransactions = useCallback(async (background = false) => {
    if (!background) setIsLoading(true);
    // A foreground fetch that lands beyond the last page hands over to the clamped
    // page's fetch, which is the one that clears the spinner.
    let handedOver = false;
    try {
      const result = await api.get<TransactionListResponse>(`/api/transactions?${query}`);
      if (result.data) {
        setTotalPages(result.data.totalPages);
        setTotal(result.data.total);
        // The list is now in sync with the server for the current filter.
        needsReconcile.current = false;
        // If the filtered set shrank (rows edited/deleted out of the active filter)
        // and the current page is now beyond the last page, snap back into range.
        // Skip rendering this out-of-range (empty) page and keep the current rows
        // until the clamped page's fetch populates the list, avoiding an empty flash.
        if (result.data.totalPages >= 1 && page > result.data.totalPages) {
          // The follow-up fetch for the clamped page belongs to this same operation:
          // in place if this one was, so it does not collapse the list either.
          preserveScrollOnPageChange.current = background;
          handedOver = !background;
          setState({ page: result.data.totalPages });
        } else {
          setTransactions(result.data.transactions);
        }
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      if (!background && !handedOver) setIsLoading(false);
    }
  }, [query, page, setState]);

  /** Refetch without replacing the rows or moving the scroll position. */
  const refreshInPlace = useCallback(async () => {
    await withScrollPreservation(async () => {
      await fetchTransactions(true);
      onDataChanged?.();
    });
  }, [fetchTransactions, onDataChanged]);

  useEffect(() => {
    if (preserveScrollOnPageChange.current) {
      preserveScrollOnPageChange.current = false;
      withScrollPreservation(async () => {
        await fetchTransactions(true);
      });
    } else {
      fetchTransactions();
    }
  }, [fetchTransactions]);

  // Debounced search. Commits the text and the page reset together, so the fetch runs
  // once rather than twice. Nothing to commit when the box already matches - which is
  // also what leaves a restored page alone on mount.
  useEffect(() => {
    if (searchInput === searchQuery) return;

    const timer = setTimeout(() => {
      preserveScrollOnPageChange.current = false;
      setState({ searchQuery: searchInput, page: 1 });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, searchQuery, setState]);

  // Clear the selection when the rows on screen are different rows. Keyed on the ids
  // rather than on `transactions`, so editing or categorising one row in place does not
  // throw away a selection the user is still building.
  const rowIds = transactions.map(tx => tx.id).join(',');
  useEffect(() => {
    setSelectedIds(new Set());
  }, [rowIds]);

  // Filters and sort reset the page in the same update that changes them, so the fetch
  // runs once. A fresh list starts at the top, so any pending pager request is dropped.
  const setFilters = useCallback((newFilters: FilterValues) => {
    preserveScrollOnPageChange.current = false;
    setState({ filters: newFilters, page: 1 });
  }, [setState]);

  const handleSort = (field: SortField) => {
    preserveScrollOnPageChange.current = false;
    setState({ ...getNextSort({ sortBy, sortOrder }, field), page: 1 });
  };

  // Paging keeps the scroll position so the pager stays under the cursor - otherwise
  // the list jumps to the top and Next has to be hunted down again on every page.
  const goToPage = (next: number) => {
    // A same-value page is a no-op for the fetch effect, so it would never clear the
    // flag - it would leak into the next unrelated fetch.
    if (next === page) return;
    preserveScrollOnPageChange.current = true;
    setState({ page: next });
  };

  const handleNextPage = () => {
    if (needsReconcile.current) {
      // First navigation after categorising under a filter: re-apply the filter in
      // place (drop the no-longer-matching rows and renumber) instead of advancing,
      // so we never skip past transactions the user hasn't seen. `fetchTransactions`
      // clears the flag and clamps the page if the set shrank.
      withScrollPreservation(async () => {
        await fetchTransactions(true);
      });
    } else {
      goToPage(Math.min(totalPages, page + 1));
    }
  };

  const handlePrevPage = () => {
    if (needsReconcile.current) {
      withScrollPreservation(async () => {
        await fetchTransactions(true);
      });
    } else {
      goToPage(Math.max(1, page - 1));
    }
  };

  const handleAddTransaction = () => {
    setEditingTransaction(null);
    setDuplicatingTransaction(null);
    setShowTransactionForm(true);
  };

  const handleEditTransaction = (tx: TransactionWithCategory) => {
    setEditingTransaction(tx);
    setDuplicatingTransaction(null);
    setShowTransactionForm(true);
  };

  const handleDuplicateTransaction = (tx: TransactionWithCategory) => {
    setEditingTransaction(null);
    setDuplicatingTransaction(tx);
    setShowTransactionForm(true);
  };

  const handleTransactionFormOpenChange = (open: boolean) => {
    setShowTransactionForm(open);
    if (!open) {
      // Clear edit/duplicate context when the dialog closes so the next
      // "Add" click starts from a clean slate.
      setEditingTransaction(null);
      setDuplicatingTransaction(null);
    }
  };

  // Opens the confirmation. window.confirm() cannot be used here: in the Tauri
  // webview it does not block, so the deletes fired before the user had answered.
  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    // Snapshot the count: the dialog outlives the selection, which is cleared
    // before the close, and would otherwise read "Delete 0 transactions?"
    setBulkDeleteCount(selectedIds.size);
    setShowBulkDeleteConfirm(true);
  };

  const handleDeleteTransaction = (tx: TransactionWithCategory) => {
    // If this transaction is selected and there are multiple selections, do bulk delete
    if (selectedIds.has(tx.id) && selectedIds.size > 1) {
      handleBulkDelete();
    } else {
      setDeletingTransaction(tx);
    }
  };

  const handleTransactionSaved = async () => {
    await refreshInPlace();
  };

  const handleTransactionDeleted = async () => {
    await withScrollPreservation(async () => {
      await fetchTransactions(true);
      setDeletingTransaction(null);
      onDataChanged?.();
    });
  };

  const applyCategory = async (ids: string[], categoryId: string | null) => {
    const idSet = new Set(ids);

    // Optimistically update the UI first
    setTransactions(prev => prev.map(tx =>
      idSet.has(tx.id)
        ? { ...tx, sub_category_id: categoryId }
        : tx
    ));
    // A bulk action is finished with its selection.
    if (ids.length > 1) setSelectedIds(new Set());

    try {
      // allSettled, and an explicit check of result.error, because api.* resolves
      // with { error } instead of rejecting.
      const results = await Promise.allSettled(
        ids.map(id => api.patch(`/api/transactions/${id}`, { sub_category_id: categoryId }))
      );
      const failed = results.filter(
        r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)
      ).length;

      if (failed > 0) {
        // Revert on failure by refetching. In place: an error path should quietly put
        // the rows back, not collapse the list and throw the user to the top.
        fetchTransactions(true);
        if (ids.length > 1) {
          toast.error(`Failed to categorise ${failed} of ${ids.length} transactions`);
        }
        if (failed === ids.length) return;
      } else if (ids.length > 1) {
        // The other rows changed without being touched, so say so.
        toast.success(`Categorised ${ids.length} transactions`);
      }

      onDataChanged?.();
      if (categoryChangeLeavesFilter(categoryId, filters, scope)) {
        // The new category means these rows no longer match the active filter, so they
        // should drop from the list. Reconcile on the next navigation/action (see the
        // pagination handlers) rather than pulling them out from under the user.
        needsReconcile.current = true;
      }
    } catch (error) {
      console.error('Failed to update category:', error);
      // Revert on failure by refetching, in place (see above).
      fetchTransactions(true);
    }
  };

  const handleCategoryChange = (txId: string, categoryId: string | null) => {
    // Categorising a selected row categorises the whole selection, like delete does.
    if (!selectedIds.has(txId) || selectedIds.size < 2) {
      applyCategory([txId], categoryId);
      return;
    }

    const ids = Array.from(selectedIds);
    // The row the user changed is their explicit choice. The others are changed on
    // their behalf, so ask before replacing a category one of them already has.
    const overwriteCount = transactions.filter(tx =>
      tx.id !== txId &&
      selectedIds.has(tx.id) &&
      tx.sub_category_id !== null &&
      tx.sub_category_id !== categoryId
    ).length;

    if (overwriteCount > 0) {
      setPendingBulkCategory({ ids, categoryId, overwriteCount });
    } else {
      applyCategory(ids, categoryId);
    }
  };

  const confirmBulkCategory = () => {
    if (!pendingBulkCategory) return;
    const { ids, categoryId } = pendingBulkCategory;
    setPendingBulkCategory(null);
    applyCategory(ids, categoryId);
  };

  const handleSplitTransaction = (tx: TransactionWithCategory) => {
    // Can't split already-split transactions or child transactions
    if (tx.is_split || tx.parent_transaction_id) return;
    setSplittingTransaction(tx);
  };

  const handleUnsplitTransaction = async (tx: TransactionWithCategory) => {
    if (!tx.is_split) return;

    try {
      const result = await api.delete(`/api/transactions/${tx.id}/split`);

      // api.* resolves with { error } instead of rejecting, so check the value.
      if (result.error || !result.data) {
        toast.error('Failed to unsplit transaction', { description: result.error });
        return;
      }
      await refreshInPlace();
    } catch (error) {
      console.error('Failed to unsplit transaction:', error);
      toast.error('Failed to unsplit transaction');
    }
  };

  const handleSplitSuccess = async () => {
    await withScrollPreservation(async () => {
      await fetchTransactions(true);
      onDataChanged?.();
      setSplittingTransaction(null);
    });
  };

  const handleRuleCreated = async (_rule: unknown, appliedCount?: number) => {
    setCreatingRuleFromTransaction(null);
    // Refresh transactions if rule was applied to update categories
    if (appliedCount && appliedCount > 0) {
      await refreshInPlace();
    }
  };

  // Bulk selection
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(transactions.map(tx => tx.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (txId: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(txId);
      } else {
        next.delete(txId);
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const confirmBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsBulkDeleting(true);
    try {
      // allSettled, and an explicit check of result.error, because api.* resolves
      // with { error } instead of rejecting. A plain Promise.all skipped the
      // refetch on the first failure, leaving already-deleted rows on screen.
      const results = await Promise.allSettled(
        ids.map(id => api.delete(`/api/transactions/${id}`))
      );
      const failed = results.filter(
        r => r.status === 'rejected' || (r.status === 'fulfilled' && r.value.error)
      ).length;
      const deleted = ids.length - failed;

      setSelectedIds(new Set());
      await refreshInPlace();

      if (failed === 0) {
        toast.success(`Deleted ${deleted} transaction${deleted !== 1 ? 's' : ''}`);
      } else if (deleted === 0) {
        toast.error(`Failed to delete ${failed} transaction${failed !== 1 ? 's' : ''}`);
      } else {
        toast.warning(`Deleted ${deleted} of ${ids.length}`, {
          description: `${failed} could not be deleted.`,
        });
      }
    } catch (error) {
      console.error('Failed to delete transactions:', error);
      toast.error('Failed to delete transactions');
    } finally {
      setIsBulkDeleting(false);
      setShowBulkDeleteConfirm(false);
    }
  };

  const allSelected = transactions.length > 0 && selectedIds.size === transactions.length;

  return {
    // Data
    transactions,
    isLoading,
    total,
    totalPages,
    page,
    sortBy,
    sortOrder,
    fetchTransactions,
    refreshInPlace,

    // Search, filters, sort, paging
    searchInput,
    setSearchInput,
    setFilters,
    handleSort,
    handleNextPage,
    handlePrevPage,

    // Selection and bulk delete
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

    // Row actions and the dialogs they open
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
    pendingBulkCategory,
    setPendingBulkCategory,
    confirmBulkCategory,
    handleSplitTransaction,
    handleUnsplitTransaction,
    handleSplitSuccess,
    handleRuleCreated,
  };
}

export type TransactionList = ReturnType<typeof useTransactionList>;
