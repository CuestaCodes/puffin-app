'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Plus, Search, X, ChevronLeft, ChevronRight, 
  Trash2, Edit2, ArrowUpDown, ArrowUp, ArrowDown, Split, Undo2, Filter
} from 'lucide-react';
import { 
  TransactionForm, 
  DeleteDialog, 
  CategorySelector,
  SplitModal,
  FiltersPopover,
  type FilterValues,
} from '@/components/transactions';
import type { TransactionWithCategory } from '@/types/database';
import { cn } from '@/lib/utils';

interface TransactionListResponse {
  transactions: TransactionWithCategory[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

type SortField = 'date' | 'description' | 'amount';
type SortOrder = 'asc' | 'desc';

interface MonthlyTransactionListProps {
  year: number;
  month: number;
  categoryFilter: string | null;
  onClearCategoryFilter?: () => void;
  onCategoryChange?: () => void;
}

// Empty filter values - date range is managed by the month view, so those are always null
const emptyFilters: FilterValues = {
  startDate: null,
  endDate: null,
  categoryId: null,
  sourceId: null,
  minAmount: null,
  maxAmount: null,
  uncategorized: false,
};

function SortIcon({ field, sortBy, sortOrder }: { field: SortField; sortBy: SortField; sortOrder: SortOrder }) {
  if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
  return sortOrder === 'asc' 
    ? <ArrowUp className="w-3 h-3 text-cyan-400" />
    : <ArrowDown className="w-3 h-3 text-cyan-400" />;
}

export function MonthlyTransactionList({ 
  year, 
  month, 
  categoryFilter, 
  onClearCategoryFilter,
  onCategoryChange 
}: MonthlyTransactionListProps) {
  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterValues>(emptyFilters);
  
  // Modals
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithCategory | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<TransactionWithCategory | null>(null);
  const [splittingTransaction, setSplittingTransaction] = useState<TransactionWithCategory | null>(null);
  
  // Data
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  
  // Sorting
  const [sortBy, setSortBy] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  // Refs for debouncing
  const isFirstRender = useRef(true);
  const prevSearchQuery = useRef(searchQuery);

  // Calculate date range for the month
  const getMonthDateRange = useCallback(() => {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate, endDate };
  }, [year, month]);

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      const { startDate, endDate } = getMonthDateRange();
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder,
        startDate,
        endDate,
      });

      if (searchQuery) params.set('search', searchQuery);
      if (categoryFilter) params.set('categoryId', categoryFilter);
      
      // Apply additional filters (excluding date range which is controlled by month view)
      if (filters.sourceId) params.set('sourceId', filters.sourceId);
      if (filters.minAmount !== null) params.set('minAmount', filters.minAmount.toString());
      if (filters.maxAmount !== null) params.set('maxAmount', filters.maxAmount.toString());
      if (filters.uncategorized) params.set('uncategorized', 'true');

      const response = await fetch(`/api/transactions?${params}`);
      if (response.ok) {
        const data: TransactionListResponse = await response.json();
        setTransactions(data.transactions);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, searchQuery, sortBy, sortOrder, categoryFilter, filters, getMonthDateRange]);

  // Reset page when month, category, or filters change
  useEffect(() => {
    setPage(1);
  }, [year, month, categoryFilter, filters]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Debounced search - reset page when search changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    
    if (prevSearchQuery.current === searchQuery) return;
    prevSearchQuery.current = searchQuery;
    
    const timer = setTimeout(() => setPage(1), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Clear selection when data changes
  useEffect(() => {
    setSelectedIds(new Set());
  }, [transactions]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleAddTransaction = () => {
    setEditingTransaction(null);
    setShowTransactionForm(true);
  };

  const handleEditTransaction = (tx: TransactionWithCategory) => {
    setEditingTransaction(tx);
    setShowTransactionForm(true);
  };

  const handleDeleteTransaction = (tx: TransactionWithCategory) => {
    setDeletingTransaction(tx);
  };

  const handleTransactionSaved = () => {
    fetchTransactions();
    onCategoryChange?.();
  };

  const handleTransactionDeleted = () => {
    fetchTransactions();
    setDeletingTransaction(null);
    onCategoryChange?.();
  };

  const handleCategoryChange = async (txId: string, newCategoryId: string | null) => {
    // Optimistically update the UI first
    setTransactions(prev => prev.map(tx => 
      tx.id === txId 
        ? { ...tx, sub_category_id: newCategoryId }
        : tx
    ));
    
    try {
      const response = await fetch(`/api/transactions/${txId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sub_category_id: newCategoryId }),
      });
      
      if (response.ok) {
        // Notify parent to refresh budget summary
        onCategoryChange?.();
      } else {
        // Revert on failure by refetching
        fetchTransactions();
      }
    } catch (error) {
      console.error('Failed to update category:', error);
      // Revert on failure by refetching
      fetchTransactions();
    }
  };

  const handleSplitTransaction = (tx: TransactionWithCategory) => {
    // Can't split already-split transactions or child transactions
    if (tx.is_split || tx.parent_transaction_id) return;
    setSplittingTransaction(tx);
  };

  const handleUnsplitTransaction = async (tx: TransactionWithCategory) => {
    if (!tx.is_split) return;
    
    try {
      const response = await fetch(`/api/transactions/${tx.id}/split`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        fetchTransactions();
        onCategoryChange?.();
      }
    } catch (error) {
      console.error('Failed to unsplit transaction:', error);
    }
  };

  const handleSplitSuccess = () => {
    fetchTransactions();
    onCategoryChange?.();
    setSplittingTransaction(null);
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    
    const confirmed = window.confirm(`Delete ${selectedIds.size} transaction(s)? The transactions will be removed from your view.`);
    if (!confirmed) return;
    
    try {
      await Promise.all(
        Array.from(selectedIds).map(id =>
          fetch(`/api/transactions/${id}`, { method: 'DELETE' })
        )
      );
      fetchTransactions();
      onCategoryChange?.();
    } catch (error) {
      console.error('Failed to delete transactions:', error);
    }
  };

  const allSelected = transactions.length > 0 && selectedIds.size === transactions.length;

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
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-cyan-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <FiltersPopover 
              filters={filters} 
              onChange={setFilters}
              hideDateRange
            >
              <Button variant="outline" className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                <Filter className="w-4 h-4" />
                Filters
              </Button>
            </FiltersPopover>
            {categoryFilter && onClearCategoryFilter && (
              <Button
                variant="outline"
                size="sm"
                onClick={onClearCategoryFilter}
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
                onClick={() => setSelectedIds(new Set())}
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
                            <div className="flex items-center gap-2">
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
                            {/* Split/Unsplit button */}
                            {tx.is_split ? (
                              <Button 
                                variant="ghost" 
                                size="icon-sm" 
                                className="text-violet-400 hover:text-violet-300"
                                onClick={() => handleUnsplitTransaction(tx)}
                                title="Unsplit transaction"
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
                              >
                                <Split className="w-4 h-4" />
                              </Button>
                            )}
                            <Button 
                              variant="ghost" 
                              size="icon-sm" 
                              className="text-slate-400 hover:text-slate-200"
                              onClick={() => handleEditTransaction(tx)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon-sm" 
                              className="text-slate-400 hover:text-red-400"
                              onClick={() => handleDeleteTransaction(tx)}
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
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="border-slate-700"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
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
        onOpenChange={setShowTransactionForm}
        transaction={editingTransaction}
        onSuccess={handleTransactionSaved}
        defaultDate={editingTransaction?.date || `${year}-${String(month).padStart(2, '0')}-15`}
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
    </>
  );
}

