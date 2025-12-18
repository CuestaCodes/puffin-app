'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CategorySelector } from './category-selector';
import type { TransactionWithCategory } from '@/types/database';

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: TransactionWithCategory | null; // Null for new, populated for edit
  onSuccess?: (transaction: TransactionWithCategory) => void;
  defaultDate?: string; // YYYY-MM-DD format for new transactions
}

interface FormErrors {
  date?: string;
  description?: string;
  amount?: string;
  general?: string;
}

export function TransactionForm({
  open,
  onOpenChange,
  transaction,
  onSuccess,
  defaultDate,
}: TransactionFormProps) {
  const isEditing = !!transaction;
  
  // Form state
  const [date, setDate] = useState<Date>(new Date());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [isExpense, setIsExpense] = useState(true);
  const [notes, setNotes] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [calendarOpen, setCalendarOpen] = useState(false);

  // Populate form when editing
  useEffect(() => {
    if (transaction) {
      setDate(new Date(transaction.date));
      setDescription(transaction.description);
      setAmount(Math.abs(transaction.amount).toFixed(2));
      setIsExpense(transaction.amount < 0);
      setNotes(transaction.notes || '');
      setCategoryId(transaction.sub_category_id);
    } else {
      // Reset for new transaction - use defaultDate if provided
      const initialDate = defaultDate ? new Date(defaultDate + 'T12:00:00') : new Date();
      setDate(initialDate);
      setDescription('');
      setAmount('');
      setIsExpense(true);
      setNotes('');
      setCategoryId(null);
    }
    setErrors({});
  }, [transaction, open, defaultDate]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!description.trim()) {
      newErrors.description = 'Description is required';
    }
    
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      newErrors.amount = 'Please enter a valid positive amount';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsSubmitting(true);
    setErrors({});
    
    try {
      const numAmount = parseFloat(amount);
      const finalAmount = isExpense ? -Math.abs(numAmount) : Math.abs(numAmount);
      
      const payload = {
        date: format(date, 'yyyy-MM-dd'),
        description: description.trim(),
        amount: finalAmount,
        notes: notes.trim() || null,
        sub_category_id: categoryId,
      };
      
      let response: Response;
      
      if (isEditing && transaction) {
        // Update existing
        response = await fetch(`/api/transactions/${transaction.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new
        response = await fetch('/api/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save transaction');
      }
      
      const saved = await response.json();
      onSuccess?.(saved.transaction || saved);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save transaction:', error);
      setErrors({
        general: error instanceof Error ? error.message : 'Failed to save transaction',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow only valid number input
    const value = e.target.value.replace(/[^0-9.]/g, '');
    // Prevent multiple decimal points
    const parts = value.split('.');
    if (parts.length > 2) return;
    if (parts[1] && parts[1].length > 2) return;
    setAmount(value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-700">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="text-slate-100">
              {isEditing ? 'Edit Transaction' : 'Add Transaction'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {isEditing
                ? 'Update the transaction details below.'
                : 'Enter the details for your new transaction.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            {/* Date picker */}
            <div className="grid gap-2">
              <Label htmlFor="date" className="text-slate-300">Date</Label>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="date"
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      'bg-slate-800/50 border-slate-700 text-slate-100 hover:bg-slate-800',
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(date, 'PPP')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-slate-900 border-slate-700" align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={(d) => {
                      if (d) setDate(d);
                      setCalendarOpen(false);
                    }}
                    initialFocus
                    className="bg-slate-900"
                  />
                </PopoverContent>
              </Popover>
            </div>
            
            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description" className="text-slate-300">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Grocery shopping"
                className={cn(
                  'bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500',
                  errors.description && 'border-red-500'
                )}
              />
              {errors.description && (
                <p className="text-xs text-red-400">{errors.description}</p>
              )}
            </div>
            
            {/* Amount and type toggle */}
            <div className="grid gap-2">
              <Label className="text-slate-300">Amount</Label>
              <div className="flex gap-2">
                <div className="flex rounded-md overflow-hidden border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setIsExpense(true)}
                    className={cn(
                      'px-3 py-2 text-sm font-medium transition-colors',
                      isExpense
                        ? 'bg-red-500/20 text-red-400 border-r border-slate-700'
                        : 'bg-slate-800/50 text-slate-400 hover:text-slate-300 border-r border-slate-700'
                    )}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsExpense(false)}
                    className={cn(
                      'px-3 py-2 text-sm font-medium transition-colors',
                      !isExpense
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-slate-800/50 text-slate-400 hover:text-slate-300'
                    )}
                  >
                    Income
                  </button>
                </div>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">$</span>
                  <Input
                    value={amount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    className={cn(
                      'pl-7 bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500',
                      'font-mono text-right',
                      errors.amount && 'border-red-500'
                    )}
                  />
                </div>
              </div>
              {errors.amount && (
                <p className="text-xs text-red-400">{errors.amount}</p>
              )}
            </div>
            
            {/* Category */}
            <div className="grid gap-2">
              <Label className="text-slate-300">Category (optional)</Label>
              <CategorySelector
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Select a category..."
              />
            </div>
            
            {/* Notes */}
            <div className="grid gap-2">
              <Label htmlFor="notes" className="text-slate-300">Notes (optional)</Label>
              <Input
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any additional notes..."
                className="bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500"
              />
            </div>
            
            {/* General error */}
            {errors.general && (
              <div className="rounded-md bg-red-500/10 border border-red-500/50 p-3">
                <p className="text-sm text-red-400">{errors.general}</p>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500"
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Add Transaction'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

