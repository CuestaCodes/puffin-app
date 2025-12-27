'use client';

import { useState } from 'react';
import { api } from '@/lib/services';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { TransactionWithCategory } from '@/types/database';

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionWithCategory | null;
  onSuccess?: () => void;
}

export function DeleteDialog({
  open,
  onOpenChange,
  transaction,
  onSuccess,
}: DeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!transaction) return;

    setIsDeleting(true);
    setError(null);

    try {
      const result = await api.delete(`/api/transactions/${transaction.id}`);

      if (result.error) {
        throw new Error(result.error || 'Failed to delete transaction');
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete transaction');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Math.abs(amount));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-100">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            Delete Transaction
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Are you sure you want to delete this transaction? The transaction will be removed from your view.
          </DialogDescription>
        </DialogHeader>
        
        {transaction && (
          <div className="rounded-md bg-slate-800/50 border border-slate-700 p-4 my-2">
            <div className="text-sm text-slate-300">
              <p className="font-medium">{transaction.description}</p>
              <p className="text-slate-500 mt-1">
                {new Date(transaction.date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
                <span className="mx-2">•</span>
                <span className={transaction.amount < 0 ? 'text-red-400' : 'text-emerald-400'}>
                  {transaction.amount < 0 ? '-' : '+'}{formatAmount(transaction.amount)}
                </span>
              </p>
            </div>
          </div>
        )}
        
        {error && (
          <div className="rounded-md bg-red-500/10 border border-red-500/50 p-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
        
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

