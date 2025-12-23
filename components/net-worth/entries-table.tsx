'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Edit2, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import type { NetWorthEntryParsed } from '@/types/net-worth';

interface EntriesTableProps {
  entries: NetWorthEntryParsed[];
  onEdit: (entry: NetWorthEntryParsed) => void;
  onDelete: () => void;
  isLoading?: boolean;
}

export function EntriesTable({ entries, onEdit, onDelete, isLoading }: EntriesTableProps) {
  const [deleteEntry, setDeleteEntry] = useState<NetWorthEntryParsed | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleDelete = async () => {
    if (!deleteEntry) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/net-worth/${deleteEntry.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onDelete();
        setDeleteEntry(null);
      }
    } catch (error) {
      console.error('Failed to delete entry:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p>No net worth entries yet</p>
        <p className="text-sm mt-1">Click "Record Net Worth" to add your first snapshot</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-3 px-4 text-slate-400 font-medium">Date</th>
              <th className="text-right py-3 px-4 text-slate-400 font-medium">Total Assets</th>
              <th className="text-right py-3 px-4 text-slate-400 font-medium">Total Liabilities</th>
              <th className="text-right py-3 px-4 text-slate-400 font-medium">Net Worth</th>
              <th className="text-right py-3 px-4 text-slate-400 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              // Calculate change from previous entry
              const prevEntry = entries[index + 1];
              const change = prevEntry ? entry.net_worth - prevEntry.net_worth : null;

              return (
                <tr
                  key={entry.id}
                  className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
                >
                  <td className="py-3 px-4 text-white">
                    {formatDate(entry.recorded_at)}
                    {entry.notes && (
                      <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]" title={entry.notes}>
                        {entry.notes}
                      </p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-emerald-400 font-mono">
                    {formatCurrency(entry.total_assets)}
                  </td>
                  <td className="py-3 px-4 text-right text-red-400 font-mono">
                    {formatCurrency(entry.total_liabilities)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className={`font-mono font-bold ${entry.net_worth >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                      {formatCurrency(entry.net_worth)}
                    </span>
                    {change !== null && (
                      <span className={`text-xs ml-2 ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {change >= 0 ? '+' : ''}{formatCurrency(change)}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onEdit(entry)}
                        className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-700"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteEntry(entry)}
                        className="h-8 w-8 text-slate-400 hover:text-red-400 hover:bg-red-900/20"
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteEntry} onOpenChange={open => !open && setDeleteEntry(null)}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Delete Net Worth Entry
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to delete this net worth entry?
            </DialogDescription>
          </DialogHeader>

          {deleteEntry && (
            <div className="py-4 space-y-2 bg-slate-800/50 rounded-lg p-4 border border-slate-700">
              <p className="text-slate-300">
                <span className="text-slate-500">Date:</span>{' '}
                {formatDate(deleteEntry.recorded_at)}
              </p>
              <p className="text-slate-300">
                <span className="text-slate-500">Net Worth:</span>{' '}
                <span className={deleteEntry.net_worth >= 0 ? 'text-cyan-400' : 'text-red-400'}>
                  {formatCurrency(deleteEntry.net_worth)}
                </span>
              </p>
            </div>
          )}

          <div className="bg-amber-900/20 border border-amber-800/50 rounded-lg p-3 mt-2">
            <p className="text-amber-300 text-sm flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <strong>Warning:</strong> This action cannot be undone. This will permanently
                delete this net worth snapshot from your records.
              </span>
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteEntry(null)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

