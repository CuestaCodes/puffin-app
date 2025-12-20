'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, X, TrendingUp, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface InlineBudgetEditorProps {
  budgetId: string | null;
  subCategoryId: string;
  subCategoryName: string;
  currentAmount: number | null;
  year: number;
  month: number;
  onSave: (amount: number) => Promise<void>;
  onCancel: () => void;
  average3mo?: number;
  average6mo?: number;
  carryOver?: number;
  className?: string;
}

export function InlineBudgetEditor({
  budgetId,
  subCategoryId,
  subCategoryName,
  currentAmount,
  year,
  month,
  onSave,
  onCancel,
  average3mo = 0,
  average6mo = 0,
  carryOver = 0,
  className,
}: InlineBudgetEditorProps) {
  const [amount, setAmount] = useState<string>(currentAmount?.toFixed(2) || '');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleSave = async () => {
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return;
    }
    
    setIsSaving(true);
    try {
      await onSave(numAmount);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const hasHints = average3mo > 0 || average6mo > 0 || carryOver > 0;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="0.00"
          className="w-32 font-mono"
          disabled={isSaving}
        />
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || isNaN(parseFloat(amount)) || parseFloat(amount) < 0}
          className="h-9"
        >
          <Check className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isSaving}
          className="h-9"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      {hasHints && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          {carryOver > 0 && (
            <button
              onClick={() => {
                const newAmount = (currentAmount || 0) + carryOver;
                setAmount(newAmount.toFixed(2));
              }}
              className="flex items-center gap-1 hover:text-cyan-400 transition-colors"
              title="Add carry-over from previous month"
            >
              <TrendingUp className="w-3 h-3" />
              <span>Carry-over: {formatCurrency(carryOver)}</span>
            </button>
          )}
          {average3mo > 0 && (
            <button
              onClick={() => setAmount(average3mo.toFixed(2))}
              className="flex items-center gap-1 hover:text-cyan-400 transition-colors"
              title="Use 3-month average"
            >
              <Info className="w-3 h-3" />
              <span>3mo avg: {formatCurrency(average3mo)}</span>
            </button>
          )}
          {average6mo > 0 && (
            <button
              onClick={() => setAmount(average6mo.toFixed(2))}
              className="flex items-center gap-1 hover:text-cyan-400 transition-colors"
              title="Use 6-month average"
            >
              <Info className="w-3 h-3" />
              <span>6mo avg: {formatCurrency(average6mo)}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

