'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/services';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Plus, Upload, Search, Filter, X, ChevronLeft, ChevronRight,
  Trash2, Edit2, ArrowUpDown, ArrowUp, ArrowDown, Split, Undo2,
  Sparkles, RotateCcw
} from 'lucide-react';
import { ImportWizard, PasteImport } from '@/components/import';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileSpreadsheet, ClipboardPaste } from 'lucide-react';
import {
  TransactionForm,
  DeleteDialog,
  FiltersPopover,
  CategorySelector,
  CategoryProvider,
  SplitModal,
  type FilterValues
} from '@/components/transactions';
import { RuleDialog } from '@/components/rules';
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
import {
  getLastImport,
  clearLastImport,
  getUndoTimeRemaining,
  formatTimeRemaining,
  type LastImportInfo,
} from '@/lib/import-undo';
import type { UndoImportInfo, UndoImportResult } from '@/app/api/transactions/undo-import/route';
import type { TransactionWithCategory } from '@/types/database';
import type { ImportResult } from '@/types/import';
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

const emptyFilters: FilterValues = {
  startDate: null,
  endDate: null,
  categoryId: null,
  sourceId: null,
  minAmount: null,
  maxAmount: null,
  uncategorized: false,
};

// Moved outside component to prevent recreation on every render
function SortIcon({ field, sortBy, sortOrder }: { field: SortField; sortBy: SortField; sortOrder: SortOrder }) {
  if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
  return sortOrder === 'asc' 
    ? <ArrowUp className="w-3 h-3 text-cyan-400" />
    : <ArrowDown className="w-3 h-3 text-cyan-400" />;
}

function TransactionsPageContent() {
  // Search and filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<FilterValues>(emptyFilters);
  
  // Modals
  const [showImport, setShowImport] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<TransactionWithCategory | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<TransactionWithCategory | null>(null);
  const [splittingTransaction, setSplittingTransaction] = useState<TransactionWithCategory | null>(null);
  const [creatingRuleFromTransaction, setCreatingRuleFromTransaction] = useState<TransactionWithCategory | null>(null);
  
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

  // Undo import state
  const [undoInfo, setUndoInfo] = useState<LastImportInfo | null>(null);
  const [undoTimeRemaining, setUndoTimeRemaining] = useState(0);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [undoBatchInfo, setUndoBatchInfo] = useState<UndoImportInfo | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder,
      });

      if (searchQuery) params.set('search', searchQuery);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.categoryId) params.set('categoryId', filters.categoryId);
      if (filters.sourceId) params.set('sourceId', filters.sourceId);
      if (filters.minAmount !== null) params.set('minAmount', filters.minAmount.toString());
      if (filters.maxAmount !== null) params.set('maxAmount', filters.maxAmount.toString());
      if (filters.uncategorized) params.set('uncategorized', 'true');

      const result = await api.get<TransactionListResponse>(`/api/transactions?${params}`);
      if (result.data) {
        setTransactions(result.data.transactions);
        setTotalPages(result.data.totalPages);
        setTotal(result.data.total);
      }
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [page, searchQuery, sortBy, sortOrder, filters]);

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

  // Check for available undo import and update timer
  useEffect(() => {
    const checkUndo = () => {
      const info = getLastImport();
      setUndoInfo(info);
      setUndoTimeRemaining(getUndoTimeRemaining());
    };

    checkUndo();
    const interval = setInterval(checkUndo, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleImportComplete = (_result: ImportResult) => {
    // Always refresh - covers both import and undo cases
    fetchTransactions();
    setShowImport(false);
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
    // If this transaction is selected and there are multiple selections, do bulk delete
    if (selectedIds.has(tx.id) && selectedIds.size > 1) {
      handleBulkDelete();
    } else {
      setDeletingTransaction(tx);
    }
  };

  const handleTransactionSaved = () => {
    fetchTransactions();
  };

  const handleTransactionDeleted = () => {
    fetchTransactions();
    setDeletingTransaction(null);
  };

  const handleCategoryChange = async (txId: string, categoryId: string | null) => {
    // Optimistically update the UI first
    setTransactions(prev => prev.map(tx =>
      tx.id === txId
        ? { ...tx, sub_category_id: categoryId }
        : tx
    ));

    try {
      const result = await api.patch(`/api/transactions/${txId}`, { sub_category_id: categoryId });

      if (result.error) {
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
      const result = await api.delete(`/api/transactions/${tx.id}/split`);

      if (result.data) {
        fetchTransactions();
      }
    } catch (error) {
      console.error('Failed to unsplit transaction:', error);
    }
  };

  const handleSplitSuccess = () => {
    fetchTransactions();
    setSplittingTransaction(null);
  };

  // Undo import handlers
  const handleUndoImportClick = async () => {
    if (!undoInfo) return;

    try {
      // First, get info about the batch (without confirming)
      const result = await api.post<UndoImportInfo>('/api/transactions/undo-import', {
        batchId: undoInfo.batchId,
        confirm: false,
      });

      if (result.data) {
        setUndoBatchInfo(result.data);
        setShowUndoConfirm(true);
      } else {
        toast.error('Failed to get import info');
      }
    } catch {
      toast.error('Failed to get import info');
    }
  };

  const handleConfirmUndo = async () => {
    if (!undoInfo) return;

    setIsUndoing(true);
    try {
      const result = await api.post<UndoImportResult>('/api/transactions/undo-import', {
        batchId: undoInfo.batchId,
        confirm: true,
      });

      if (result.data?.success) {
        clearLastImport();
        setUndoInfo(null);
        setShowUndoConfirm(false);
        setUndoBatchInfo(null);
        toast.success(result.data.message);
        fetchTransactions();
      } else {
        toast.error('Failed to undo import');
      }
    } catch {
      toast.error('Failed to undo import');
    } finally {
      setIsUndoing(false);
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    const confirmed = window.confirm(`Delete ${selectedIds.size} transaction(s)? The transactions will be removed from your view.`);
    if (!confirmed) return;

    try {
      await Promise.all(
        Array.from(selectedIds).map(id => api.delete(`/api/transactions/${id}`))
      );
      setSelectedIds(new Set());
      fetchTransactions();
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
      year: 'numeric',
    });
  };

  return (
    <>
      <div className="space-y-6">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Transactions</h1>
            <p className="text-slate-400 mt-1">
              {total > 0 ? `${total} transaction${total !== 1 ? 's' : ''}` : 'View and manage all your transactions'}
            </p>
          </div>
          <div className="flex gap-2">
            {/* Undo Import button - only shown when undo is available */}
            {undoInfo && undoTimeRemaining > 0 && (
              <Button
                variant="outline"
                onClick={handleUndoImportClick}
                className="gap-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300"
              >
                <RotateCcw className="w-4 h-4" />
                Undo Import ({formatTimeRemaining(undoTimeRemaining)})
              </Button>
            )}
            <Button
              variant="outline"
              onClick={() => setShowImport(true)}
              className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <Upload className="w-4 h-4" />
              Import
            </Button>
            <Button
              onClick={handleAddTransaction}
              className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20"
            >
              <Plus className="w-4 h-4" />
              Add Transaction
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
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
              <FiltersPopover filters={filters} onChange={setFilters}>
                <Button variant="outline" className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                  <Filter className="w-4 h-4" />
                  Filters
                </Button>
              </FiltersPopover>
            </div>
          </CardContent>
        </Card>

        {/* Bulk actions bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-4 p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
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

        {/* Transactions list */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">All Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-16 text-slate-500">
                <div className="w-8 h-8 mx-auto mb-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
                <p>Loading transactions...</p>
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-16 text-slate-500">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <Upload className="w-8 h-8 text-slate-500" />
                </div>
                <p className="font-medium text-slate-400">No transactions yet</p>
                <p className="text-sm mt-1">Import transactions or add them manually to get started</p>
                <div className="flex justify-center gap-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowImport(true)}
                    className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    <Upload className="w-4 h-4" />
                    Import
                  </Button>
                  <Button
                    onClick={handleAddTransaction}
                    className="gap-2 bg-cyan-600 hover:bg-cyan-500"
                  >
                    <Plus className="w-4 h-4" />
                    Add Transaction
                  </Button>
                </div>
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
                            isGreyedOut && 'opacity-50' // Greyed out - excluded from totals
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
                                {tx.upper_category_type === 'transfer' && (
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
                              onChange={(categoryId) => handleCategoryChange(tx.id, categoryId)}
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
      </div>

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowImport(false)}
          />
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowImport(false)}
              className="absolute -top-12 right-0 text-slate-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </Button>
            <Tabs defaultValue="csv" className="w-full">
              <TabsList className="grid w-full grid-cols-2 bg-slate-800/50 mb-4">
                <TabsTrigger value="csv" className="gap-2 data-[state=active]:bg-slate-700">
                  <FileSpreadsheet className="w-4 h-4" />
                  CSV File
                </TabsTrigger>
                <TabsTrigger value="paste" className="gap-2 data-[state=active]:bg-slate-700">
                  <ClipboardPaste className="w-4 h-4" />
                  Paste from PDF
                </TabsTrigger>
              </TabsList>
              <TabsContent value="csv">
                <ImportWizard
                  onComplete={handleImportComplete}
                  onCancel={() => setShowImport(false)}
                />
              </TabsContent>
              <TabsContent value="paste">
                <PasteImport
                  onComplete={handleImportComplete}
                  onCancel={() => setShowImport(false)}
                />
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      {/* Transaction Form Modal */}
      <TransactionForm
        open={showTransactionForm}
        onOpenChange={setShowTransactionForm}
        transaction={editingTransaction}
        onSuccess={handleTransactionSaved}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteDialog
        open={!!deletingTransaction}
        onOpenChange={(open) => !open && setDeletingTransaction(null)}
        transaction={deletingTransaction}
        onSuccess={handleTransactionDeleted}
      />

      {/* Split Transaction Modal */}
      <SplitModal
        open={!!splittingTransaction}
        onOpenChange={(open) => !open && setSplittingTransaction(null)}
        transaction={splittingTransaction}
        onSuccess={handleSplitSuccess}
      />

      {/* Create Rule from Transaction Dialog */}
      <RuleDialog
        open={!!creatingRuleFromTransaction}
        onOpenChange={(open) => !open && setCreatingRuleFromTransaction(null)}
        defaultMatchText={creatingRuleFromTransaction?.description || ''}
        defaultCategoryId={creatingRuleFromTransaction?.sub_category_id || ''}
        onSuccess={(rule, appliedCount) => {
          setCreatingRuleFromTransaction(null);
          // Refresh transactions if rule was applied to update categories
          if (appliedCount && appliedCount > 0) {
            fetchTransactions();
          }
        }}
      />

      {/* Undo Import Confirmation Dialog */}
      <AlertDialog open={showUndoConfirm} onOpenChange={setShowUndoConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">
              Undo Last Import?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400 space-y-2">
              {undoBatchInfo && (
                <>
                  <p>
                    This will remove {undoBatchInfo.totalCount - undoBatchInfo.alreadyDeletedCount} transaction
                    {(undoBatchInfo.totalCount - undoBatchInfo.alreadyDeletedCount) !== 1 ? 's' : ''} from the last import
                    {undoInfo?.sourceName ? ` (${undoInfo.sourceName})` : ''}.
                  </p>
                  {undoBatchInfo.modifiedCount > 0 && (
                    <p className="text-amber-400 font-medium">
                      Warning: {undoBatchInfo.modifiedCount} transaction
                      {undoBatchInfo.modifiedCount !== 1 ? 's have' : ' has'} been modified since import.
                      {undoBatchInfo.modifiedCount !== 1 ? ' These changes' : ' This change'} will be lost.
                    </p>
                  )}
                  {undoBatchInfo.alreadyDeletedCount > 0 && (
                    <p className="text-slate-500 text-sm">
                      {undoBatchInfo.alreadyDeletedCount} transaction
                      {undoBatchInfo.alreadyDeletedCount !== 1 ? 's were' : ' was'} already deleted.
                    </p>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
              disabled={isUndoing}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmUndo}
              disabled={isUndoing}
              className="bg-amber-600 hover:bg-amber-500 text-white"
            >
              {isUndoing ? 'Undoing...' : 'Yes, Undo Import'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Wrapper component that provides CategoryContext
export function TransactionsPage() {
  return (
    <CategoryProvider>
      <TransactionsPageContent />
    </CategoryProvider>
  );
}
