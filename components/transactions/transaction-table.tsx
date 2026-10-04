'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ChevronLeft, ChevronRight, Trash2, Edit2, ArrowUpDown, ArrowUp, ArrowDown,
  Split, Undo2, Sparkles, Copy
} from 'lucide-react';
import { CategorySelector } from './category-selector';
import type { TransactionList } from './use-transaction-list';
import type { SortField, SortOrder } from '@/types/transaction-list';
import { cn } from '@/lib/utils';

function SortIcon({ field, sortBy, sortOrder }: { field: SortField; sortBy: SortField; sortOrder: SortOrder }) {
  if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
  return sortOrder === 'asc'
    ? <ArrowUp className="w-3 h-3 text-cyan-400" />
    : <ArrowDown className="w-3 h-3 text-cyan-400" />;
}

function formatAmount(amount: number): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Math.abs(amount));
  return amount < 0 ? `-${formatted}` : formatted;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The rows, pager and bulk-selection bar of a transaction list. Shared by the
 * Transactions page and the Monthly Budget list; requires `CategoryProvider`.
 *
 * Render it only when there are rows - each screen owns its own loading and empty states.
 */
export function TransactionTable({ list }: { list: TransactionList }) {
  const {
    transactions,
    page,
    totalPages,
    sortBy,
    sortOrder,
    handleSort,
    handleNextPage,
    handlePrevPage,
    selectedIds,
    allSelected,
    handleSelectAll,
    handleSelectOne,
    clearSelection,
    handleBulkDelete,
    setCreatingRuleFromTransaction,
    handleEditTransaction,
    handleDuplicateTransaction,
    handleDeleteTransaction,
    handleCategoryChange,
    handleSplitTransaction,
    handleUnsplitTransaction,
  } = list;

  return (
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

      {/* Bulk actions bar. It floats over the foot of the list rather than sitting above
          it: a bar that appears and disappears above the rows moves every row by its own
          height, which is the jump seen when a bulk delete cleared the selection. */}
      {selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-10 mt-4 flex items-center gap-4 p-3 rounded-lg bg-slate-900 border border-cyan-500/50 shadow-lg shadow-black/40">
          <span className="shrink-0 text-sm text-cyan-400 font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleBulkDelete}
            className="shrink-0 gap-1 border-red-500/50 text-red-400 hover:bg-red-500/10"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </Button>
          {selectedIds.size > 1 && (
            <span className="min-w-0 truncate text-xs text-slate-400">
              Changing the category of a selected row changes all {selectedIds.size}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={clearSelection}
            className="ml-auto shrink-0 text-slate-400 hover:text-slate-200"
          >
            Clear selection
          </Button>
        </div>
      )}
    </>
  );
}
