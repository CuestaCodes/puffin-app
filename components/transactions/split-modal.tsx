'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Plus, Trash2, AlertTriangle, Split } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CategorySelector } from './category-selector';
import type { TransactionWithCategory } from '@/types/database';
import { cn } from '@/lib/utils';

interface SplitPart {
  amount: string;
  sub_category_id: string | null;
  description: string;
}

interface SplitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: TransactionWithCategory | null;
  onSuccess?: () => void;
}

export function SplitModal({
  open,
  onOpenChange,
  transaction,
  onSuccess,
}: SplitModalProps) {
  const [splits, setSplits] = useState<SplitPart[]>([
    { amount: '', sub_category_id: null, description: '' },
    { amount: '', sub_category_id: null, description: '' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when transaction changes
  useEffect(() => {
    if (transaction && open) {
      const total = Math.abs(transaction.amount);
      // Handle odd amounts by giving remainder to first split (ceil vs floor)
      // This ensures firstHalf + secondHalf always equals total
      const firstHalf = Math.ceil(total * 100 / 2) / 100;
      const secondHalf = Math.round((total - firstHalf) * 100) / 100;
      setSplits([
        { amount: firstHalf.toFixed(2), sub_category_id: transaction.sub_category_id, description: '' },
        { amount: secondHalf.toFixed(2), sub_category_id: null, description: '' },
      ]);
      setError(null);
    }
  }, [transaction, open]);

  const originalAmount = transaction ? Math.abs(transaction.amount) : 0;
  
  const totalSplit = useMemo(() => {
    return splits.reduce((sum, s) => {
      const val = parseFloat(s.amount) || 0;
      return sum + val;
    }, 0);
  }, [splits]);

  const remaining = originalAmount - totalSplit;
  const isBalanced = Math.abs(remaining) < 0.01;

  // Keyboard shortcuts: Enter to submit when balanced, Escape handled by Dialog
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && isBalanced && !isSubmitting && open) {
      e.preventDefault();
      // Trigger submit - we'll call handleSubmit via ref or state
    }
  }, [isBalanced, isSubmitting, open]);

  useEffect(() => {
    if (open) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const handleAmountChange = (index: number, value: string) => {
    // Allow only valid number input
    const sanitized = value.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 2) return;

    setSplits(prev => prev.map((s, i) => 
      i === index ? { ...s, amount: sanitized } : s
    ));
  };

  const handleCategoryChange = (index: number, categoryId: string | null) => {
    setSplits(prev => prev.map((s, i) => 
      i === index ? { ...s, sub_category_id: categoryId } : s
    ));
  };

  const handleDescriptionChange = (index: number, description: string) => {
    setSplits(prev => prev.map((s, i) => 
      i === index ? { ...s, description } : s
    ));
  };

  const addSplit = () => {
    if (splits.length >= 3) return;
    setSplits(prev => [...prev, { amount: '', sub_category_id: null, description: '' }]);
  };

  const removeSplit = (index: number) => {
    if (splits.length <= 2) return;
    setSplits(prev => prev.filter((_, i) => i !== index));
  };

  const handleAutoBalance = () => {
    if (splits.length === 0) return;
    
    // Find splits with amounts already set
    let filledTotal = 0;
    let emptyCount = 0;
    
    for (const s of splits) {
      const val = parseFloat(s.amount) || 0;
      if (val > 0) {
        filledTotal += val;
      } else {
        emptyCount++;
      }
    }
    
    if (emptyCount === 0) {
      // All filled - distribute remaining to last
      const lastIndex = splits.length - 1;
      const lastAmount = parseFloat(splits[lastIndex].amount) || 0;
      const newAmount = (lastAmount + remaining).toFixed(2);
      setSplits(prev => prev.map((s, i) => 
        i === lastIndex ? { ...s, amount: newAmount } : s
      ));
    } else {
      // Distribute remaining among empty splits
      const amountPerEmpty = ((originalAmount - filledTotal) / emptyCount).toFixed(2);
      setSplits(prev => prev.map(s => {
        const val = parseFloat(s.amount) || 0;
        if (val === 0) {
          return { ...s, amount: amountPerEmpty };
        }
        return s;
      }));
    }
  };

  const handleSubmit = async () => {
    if (!transaction) return;
    
    // Validate
    const validSplits = splits.filter(s => parseFloat(s.amount) > 0);
    if (validSplits.length < 2) {
      setError('Please enter at least 2 split amounts');
      return;
    }
    
    if (!isBalanced) {
      setError(`Split amounts must equal ${formatCurrency(originalAmount)}`);
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/transactions/${transaction.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          splits: validSplits.map(s => ({
            amount: parseFloat(s.amount),
            sub_category_id: s.sub_category_id,
            description: s.description || undefined,
          })),
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to split transaction');
      }
      
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to split transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!transaction) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100 flex items-center gap-2">
            <Split className="w-5 h-5 text-cyan-400" />
            Split Transaction
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Divide this transaction into {splits.length} parts. Amounts must sum to the original.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Original transaction info */}
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-slate-400">Original Transaction</p>
                <p className="text-slate-200 font-medium">{transaction.description}</p>
              </div>
              <p className={cn(
                'text-lg font-mono font-bold',
                transaction.amount < 0 ? 'text-red-400' : 'text-emerald-400'
              )}>
                {formatCurrency(originalAmount)}
              </p>
            </div>
          </div>

          {/* Split parts */}
          <div className="space-y-3">
            {splits.map((split, index) => (
              <div 
                key={index} 
                className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <Label className="text-slate-300 font-medium">
                    Part {index + 1}
                  </Label>
                  {splits.length > 2 && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeSplit(index)}
                      className="text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500">Amount</Label>
                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                      <Input
                        value={split.amount}
                        onChange={(e) => handleAmountChange(index, e.target.value)}
                        placeholder="0.00"
                        className="pl-7 bg-slate-800/50 border-slate-700 text-slate-100 font-mono text-right"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Category</Label>
                    <div className="mt-1">
                      <CategorySelector
                        value={split.sub_category_id}
                        onChange={(id) => handleCategoryChange(index, id)}
                        compact
                      />
                    </div>
                  </div>
                </div>
                
                <div>
                  <Label className="text-xs text-slate-500">Description (optional)</Label>
                  <Input
                    value={split.description}
                    onChange={(e) => handleDescriptionChange(index, e.target.value)}
                    placeholder={`${transaction.description} (Part ${index + 1})`}
                    className="mt-1 bg-slate-800/50 border-slate-700 text-slate-100 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Add split button */}
          {splits.length < 3 && (
            <Button
              variant="outline"
              onClick={addSplit}
              className="w-full gap-2 border-slate-700 text-slate-400 hover:text-slate-200 border-dashed"
            >
              <Plus className="w-4 h-4" />
              Add Part
            </Button>
          )}

          {/* Balance indicator */}
          <div className={cn(
            'p-3 rounded-lg border flex items-center justify-between',
            isBalanced 
              ? 'bg-emerald-500/10 border-emerald-500/30' 
              : 'bg-amber-500/10 border-amber-500/30'
          )}>
            <div>
              <p className="text-sm text-slate-400">
                {isBalanced ? 'Splits are balanced' : 'Remaining to allocate'}
              </p>
              <p className={cn(
                'text-lg font-mono font-bold',
                isBalanced ? 'text-emerald-400' : 'text-amber-400'
              )}>
                {isBalanced ? '✓ Balanced' : formatCurrency(Math.abs(remaining))}
              </p>
            </div>
            {!isBalanced && remaining > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleAutoBalance}
                className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
              >
                Auto-balance
              </Button>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/50 p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !isBalanced}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500"
          >
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Split Transaction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

