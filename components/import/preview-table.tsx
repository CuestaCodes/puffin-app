'use client';

import React, { useState, useMemo } from 'react';
import { Check, X, AlertCircle, CheckCircle, Copy, Loader2, ArrowLeftRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ImportPreview } from '@/types/import';
import { formatDateForDisplay } from '@/lib/csv/date-parser';
import { MAX_IMPORT_TRANSACTIONS } from '@/lib/validations';
import { describeSignSplit } from '@/lib/import-amount';

interface PreviewTableProps {
  preview: ImportPreview;
  onRowToggle: (rowIndex: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  /** Swap one row's amount between expense and income */
  onAmountSwap: (rowIndex: number) => void;
  /** Swap the sign of every amount */
  onSwapAllSigns: () => void;
  onContinue: () => void;
  onBack: () => void;
  isLoading?: boolean;
  showNotes?: boolean;
}

export function PreviewTable({
  preview,
  onRowToggle,
  onSelectAll,
  onDeselectAll,
  onAmountSwap,
  onSwapAllSigns,
  onContinue,
  onBack,
  isLoading,
  showNotes = false,
}: PreviewTableProps) {
  const [filter, setFilter] = useState<'all' | 'valid' | 'errors' | 'duplicates'>('all');

  const filteredRows = useMemo(() => {
    switch (filter) {
      case 'valid':
        return preview.rows.filter(r => r.errors.length === 0 && !r.isDuplicate);
      case 'errors':
        return preview.rows.filter(r => r.errors.length > 0);
      case 'duplicates':
        return preview.rows.filter(r => r.isDuplicate);
      default:
        return preview.rows;
    }
  }, [preview.rows, filter]);

  const selectedCount = preview.rows.filter(r => r.isSelected).length;
  const selectedValidCount = preview.rows.filter(r => r.isSelected && r.errors.length === 0).length;
  // Shown beside the selection count so an import with its signs the wrong way round is
  // visible before it happens, not after
  const signSplit = describeSignSplit(
    preview.rows.filter(r => r.isSelected && r.errors.length === 0).map(r => r.parsed.amount)
  );

  const formatAmount = (amount: number | null): string => {
    if (amount === null) return '-';
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Math.abs(amount));
    return amount < 0 ? `-${formatted}` : formatted;
  };

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-3">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            'p-3 rounded-lg border text-left transition-colors',
            filter === 'all'
              ? 'bg-slate-700 border-slate-500'
              : 'bg-slate-800/50 border-slate-700 hover:bg-slate-700/50'
          )}
        >
          <p className="text-2xl font-semibold text-slate-100">{preview.rows.length}</p>
          <p className="text-xs text-slate-400">Total rows <span className="text-slate-500">(max {MAX_IMPORT_TRANSACTIONS.toLocaleString()})</span></p>
        </button>
        
        <button
          onClick={() => setFilter('valid')}
          className={cn(
            'p-3 rounded-lg border text-left transition-colors',
            filter === 'valid' 
              ? 'bg-emerald-500/20 border-emerald-500/50' 
              : 'bg-slate-800/50 border-slate-700 hover:bg-slate-700/50'
          )}
        >
          <p className="text-2xl font-semibold text-emerald-400">{preview.validCount}</p>
          <p className="text-xs text-slate-400">Valid</p>
        </button>
        
        <button
          onClick={() => setFilter('duplicates')}
          className={cn(
            'p-3 rounded-lg border text-left transition-colors',
            filter === 'duplicates' 
              ? 'bg-amber-500/20 border-amber-500/50' 
              : 'bg-slate-800/50 border-slate-700 hover:bg-slate-700/50'
          )}
        >
          <p className="text-2xl font-semibold text-amber-400">{preview.duplicateCount}</p>
          <p className="text-xs text-slate-400">Duplicates</p>
        </button>
        
        <button
          onClick={() => setFilter('errors')}
          className={cn(
            'p-3 rounded-lg border text-left transition-colors',
            filter === 'errors' 
              ? 'bg-red-500/20 border-red-500/50' 
              : 'bg-slate-800/50 border-slate-700 hover:bg-slate-700/50'
          )}
        >
          <p className="text-2xl font-semibold text-red-400">{preview.errorCount}</p>
          <p className="text-xs text-slate-400">Errors</p>
        </button>
      </div>

      {/* Selection Actions */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">
          {selectedCount} of {preview.rows.length} rows selected
          {selectedValidCount !== selectedCount && (
            <span className="text-amber-400 ml-2">
              ({selectedValidCount} valid)
            </span>
          )}
          {selectedValidCount > 0 && (
            <span className="ml-2 text-slate-300">· {signSplit}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onSwapAllSigns}>
            <ArrowLeftRight className="w-3 h-3 mr-1" />
            Swap all signs
          </Button>
          <Button variant="outline" size="sm" onClick={onSelectAll}>
            <Check className="w-3 h-3 mr-1" />
            Select All Valid
          </Button>
          <Button variant="outline" size="sm" onClick={onDeselectAll}>
            <X className="w-3 h-3 mr-1" />
            Deselect All
          </Button>
        </div>
      </div>

      <p className="flex items-center gap-1 text-xs text-slate-400">
        <ArrowLeftRight className="w-3 h-3" aria-hidden="true" />
        Click an amount to swap its sign
      </p>

      {/* Data Table */}
      <div className="border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-800 sticky top-0 z-10">
              <tr>
                <th className="w-12 px-3 py-2 text-left">
                  <span className="sr-only">Select</span>
                </th>
                <th className="w-12 px-3 py-2 text-left text-slate-400 font-medium">#</th>
                <th className="px-3 py-2 text-left text-slate-400 font-medium">Date</th>
                <th className="px-3 py-2 text-left text-slate-400 font-medium">Description</th>
                <th className="px-3 py-2 text-right text-slate-400 font-medium">Amount</th>
                {showNotes && (
                  <th className="px-3 py-2 text-left text-slate-400 font-medium">Notes</th>
                )}
                <th className="w-20 px-3 py-2 text-center text-slate-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredRows.map((row) => (
                <tr
                  key={row.rowIndex}
                  onClick={() => onRowToggle(row.rowIndex)}
                  className={cn(
                    'cursor-pointer transition-colors',
                    row.isSelected 
                      ? 'bg-emerald-500/10 hover:bg-emerald-500/15' 
                      : 'hover:bg-slate-800/50',
                    row.errors.length > 0 && 'bg-red-500/5',
                    row.isDuplicate && !row.errors.length && 'bg-amber-500/5'
                  )}
                >
                  <td className="px-3 py-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRowToggle(row.rowIndex);
                      }}
                      className={cn(
                        'w-5 h-5 rounded border flex items-center justify-center transition-colors',
                        row.isSelected
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'border-slate-600 hover:border-slate-500'
                      )}
                    >
                      {row.isSelected && <Check className="w-3 h-3" />}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-500">{row.rowIndex + 1}</td>
                  <td className="px-3 py-2 text-slate-200">
                    {row.parsed.date ? formatDateForDisplay(row.parsed.date) : (
                      <span className="text-red-400">Invalid</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-200 max-w-[300px] truncate">
                    {row.hasDefaultDescription ? (
                      <span className="text-slate-400 italic" title="Default description applied">
                        {row.parsed.description}
                      </span>
                    ) : (
                      row.parsed.description || (
                        <span className="text-red-400">Missing</span>
                      )
                    )}
                  </td>
                  <td className={cn(
                    'px-3 py-2 text-right font-mono',
                    row.parsed.amount === null
                      ? 'text-red-400'
                      : row.parsed.amount < 0
                        ? 'text-red-400'
                        : 'text-emerald-400'
                  )}>
                    {row.parsed.amount !== null && row.errors.length === 0 ? (
                      <button
                        onClick={() => onAmountSwap(row.rowIndex)}
                        className="group inline-flex items-center gap-1.5 px-2 py-0.5 rounded border border-transparent hover:border-slate-600 hover:bg-slate-700/50 transition-colors"
                        title="Click to swap between expense and income"
                        aria-label={`Swap sign of ${formatAmount(row.parsed.amount)}`}
                      >
                        <ArrowLeftRight
                          className="w-3 h-3 text-slate-500 group-hover:text-slate-300"
                          aria-hidden="true"
                        />
                        <span className="underline decoration-dotted decoration-slate-500 underline-offset-4">
                          {formatAmount(row.parsed.amount)}
                        </span>
                      </button>
                    ) : row.parsed.amount !== null ? (
                      formatAmount(row.parsed.amount)
                    ) : (
                      'Invalid'
                    )}
                  </td>
                  {showNotes && (
                    <td className="px-3 py-2 text-slate-400 max-w-[150px] truncate" title={row.parsed.notes || undefined}>
                      {row.parsed.notes || '-'}
                    </td>
                  )}
                  <td className="px-3 py-2 text-center">
                    {row.errors.length > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs text-red-400" title={row.errors.join(', ')}>
                        <AlertCircle className="w-4 h-4" />
                      </span>
                    ) : row.isDuplicate ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-400" title="Possible duplicate">
                        <Copy className="w-4 h-4" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                        <CheckCircle className="w-4 h-4" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredRows.length === 0 && (
          <div className="p-8 text-center text-slate-500">
            No rows match the current filter
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex justify-between pt-4 border-t border-slate-700">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {selectedValidCount > MAX_IMPORT_TRANSACTIONS && (
            <span className="text-sm text-red-400">
              Exceeds {MAX_IMPORT_TRANSACTIONS.toLocaleString()} limit
            </span>
          )}
          <Button
            onClick={onContinue}
            disabled={selectedValidCount === 0 || selectedValidCount > MAX_IMPORT_TRANSACTIONS || isLoading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing {selectedValidCount.toLocaleString()} transaction{selectedValidCount !== 1 ? 's' : ''}...
              </>
            ) : (
              <>Import {selectedValidCount.toLocaleString()} Transaction{selectedValidCount !== 1 ? 's' : ''}</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

