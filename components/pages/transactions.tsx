'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Upload, Search, Filter, X, ChevronLeft, ChevronRight, Trash2, Edit2 } from 'lucide-react';
import { ImportWizard } from '@/components/import';
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

export function TransactionsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [transactions, setTransactions] = useState<TransactionWithCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;
  const isFirstRender = useRef(true);
  const prevSearchQuery = useRef(searchQuery);

  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy: 'date',
        sortOrder: 'desc',
      });

      if (searchQuery) {
        params.set('search', searchQuery);
      }

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
  }, [page, searchQuery]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Debounced search - only reset page when searchQuery actually changes (not on initial mount)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    
    if (prevSearchQuery.current === searchQuery) {
      return;
    }
    
    prevSearchQuery.current = searchQuery;
    const timer = setTimeout(() => {
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleImportComplete = (result: ImportResult) => {
    if (result.imported > 0) {
      fetchTransactions();
    }
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
            <Button 
              variant="outline" 
              onClick={() => setShowImport(true)}
              className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </Button>
            <Button className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20">
              <Plus className="w-4 h-4" />
              Add Transaction
            </Button>
          </div>
        </div>

        {/* Filters */}
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
              </div>
              <Button variant="outline" className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
                <Filter className="w-4 h-4" />
                Filters
              </Button>
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
                <p className="text-sm mt-1">Import a CSV file or add transactions manually to get started</p>
                <div className="flex justify-center gap-2 mt-4">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowImport(true)}
                    className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800"
                  >
                    <Upload className="w-4 h-4" />
                    Import CSV
                  </Button>
                  <Button className="gap-2 bg-cyan-600 hover:bg-cyan-500">
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
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Description
                        </th>
                        <th className="text-left py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 px-4 text-sm text-slate-300 whitespace-nowrap">
                            {formatDate(tx.date)}
                          </td>
                          <td className="py-3 px-4 text-sm text-slate-200 max-w-[300px] truncate">
                            {tx.description}
                          </td>
                          <td className="py-3 px-4 text-sm">
                            {tx.sub_category_name ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-slate-700 text-slate-300">
                                {tx.sub_category_name}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-xs">Uncategorized</span>
                            )}
                          </td>
                          <td className={cn(
                            'py-3 px-4 text-sm font-mono text-right whitespace-nowrap',
                            tx.amount < 0 ? 'text-red-400' : 'text-emerald-400'
                          )}>
                            {formatAmount(tx.amount)}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon-sm" className="text-slate-400 hover:text-slate-200">
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon-sm" className="text-slate-400 hover:text-red-400">
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
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
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowImport(false)}
          />
          
          {/* Modal content */}
          <div className="relative z-10 w-full max-w-4xl max-h-[90vh] overflow-y-auto m-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowImport(false)}
              className="absolute -top-12 right-0 text-slate-400 hover:text-white"
            >
              <X className="w-6 h-6" />
            </Button>
            <ImportWizard
              onComplete={handleImportComplete}
              onCancel={() => setShowImport(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
