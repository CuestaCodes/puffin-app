'use client';

import { useState, useEffect } from 'react';
import { useTransactionsState } from '@/hooks/use-page-state';
import { api } from '@/lib/services';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Upload, Search, Filter, X, RotateCcw } from 'lucide-react';
import { ImportWizard, PasteImport } from '@/components/import';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileSpreadsheet, ClipboardPaste } from 'lucide-react';
import {
  FiltersPopover,
  CategoryProvider,
  TransactionTable,
  TransactionListDialogs,
  useTransactionList,
} from '@/components/transactions';
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
import type { ImportResult, UndoImportInfo, UndoImportResult } from '@/types/import';

function TransactionsPageContent() {
  // Persisted state from context (survives navigation)
  const { setTransactionsState, ...listState } = useTransactionsState();
  const { filters } = listState;

  // Fetching, paging, selection and every row action are shared with the Monthly
  // Budget list. What stays here is page chrome: import and undo-import.
  const list = useTransactionList({ state: listState, setState: setTransactionsState });
  const {
    transactions,
    isLoading,
    total,
    fetchTransactions,
    searchInput,
    setSearchInput,
    setFilters,
    handleAddTransaction,
  } = list;

  const [showImport, setShowImport] = useState(false);

  // Undo import state
  const [undoInfo, setUndoInfo] = useState<LastImportInfo | null>(null);
  const [undoTimeRemaining, setUndoTimeRemaining] = useState(0);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [undoBatchInfo, setUndoBatchInfo] = useState<UndoImportInfo | null>(null);
  const [isUndoing, setIsUndoing] = useState(false);

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

  const handleImportComplete = (_result: ImportResult) => {
    // Always refresh - covers both import and undo cases
    fetchTransactions();
    setShowImport(false);
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
    } catch (error) {
      console.error('Failed to get import info:', error);
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
    } catch (error) {
      console.error('Failed to undo import:', error);
      toast.error('Failed to undo import');
    } finally {
      setIsUndoing(false);
    }
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
              <FiltersPopover filters={filters} onChange={setFilters}>
                <Button variant="outline" className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                  <Filter className="w-4 h-4" />
                  Filters
                </Button>
              </FiltersPopover>
            </div>
          </CardContent>
        </Card>

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
              <TransactionTable list={list} />
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

      <TransactionListDialogs list={list} />

      {/* Undo Import Confirmation Dialog */}
      <AlertDialog open={showUndoConfirm} onOpenChange={setShowUndoConfirm}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100">
              Undo Last Import?
            </AlertDialogTitle>
            <AlertDialogDescription asChild className="text-slate-400 space-y-2">
              <div>
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
              </div>
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
