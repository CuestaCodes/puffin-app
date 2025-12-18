'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CategorySelector } from './category-selector';

export interface FilterValues {
  startDate: string | null;
  endDate: string | null;
  categoryId: string | null;
  minAmount: number | null;
  maxAmount: number | null;
  uncategorized: boolean;
}

interface FiltersPopoverProps {
  filters: FilterValues;
  onChange: (filters: FilterValues) => void;
  children: React.ReactNode;
}

export function FiltersPopover({ filters, onChange, children }: FiltersPopoverProps) {
  const [open, setOpen] = useState(false);
  const [local, setLocal] = useState<FilterValues>(filters);
  const [startCalOpen, setStartCalOpen] = useState(false);
  const [endCalOpen, setEndCalOpen] = useState(false);

  useEffect(() => {
    setLocal(filters);
  }, [filters]);

  const handleApply = () => {
    onChange(local);
    setOpen(false);
  };

  const handleClear = () => {
    const cleared: FilterValues = {
      startDate: null,
      endDate: null,
      categoryId: null,
      minAmount: null,
      maxAmount: null,
      uncategorized: false,
    };
    setLocal(cleared);
    onChange(cleared);
    setOpen(false);
  };

  const activeFilterCount = [
    filters.startDate,
    filters.endDate,
    filters.categoryId,
    filters.minAmount,
    filters.maxAmount,
    filters.uncategorized,
  ].filter(Boolean).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative">
          {children}
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 text-xs bg-cyan-500 text-slate-900 rounded-full flex items-center justify-center font-medium">
              {activeFilterCount}
            </span>
          )}
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-slate-900 border-slate-700" align="end">
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-slate-200">Filters</h4>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                className="h-auto py-1 px-2 text-xs text-slate-400 hover:text-slate-200"
              >
                Clear all
              </Button>
            )}
          </div>
          
          {/* Date range */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Date Range</Label>
            <div className="flex gap-2">
              <Popover open={startCalOpen} onOpenChange={setStartCalOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'flex-1 justify-start text-left font-normal',
                      'bg-slate-800/50 border-slate-700 text-slate-100 hover:bg-slate-800',
                      !local.startDate && 'text-slate-500'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {local.startDate ? format(new Date(local.startDate), 'MMM d') : 'Start'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-slate-900 border-slate-700" align="start">
                  <Calendar
                    mode="single"
                    selected={local.startDate ? new Date(local.startDate) : undefined}
                    onSelect={(d) => {
                      setLocal(prev => ({ ...prev, startDate: d ? format(d, 'yyyy-MM-dd') : null }));
                      setStartCalOpen(false);
                    }}
                    className="bg-slate-900"
                  />
                </PopoverContent>
              </Popover>
              
              <span className="text-slate-500 self-center">to</span>
              
              <Popover open={endCalOpen} onOpenChange={setEndCalOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'flex-1 justify-start text-left font-normal',
                      'bg-slate-800/50 border-slate-700 text-slate-100 hover:bg-slate-800',
                      !local.endDate && 'text-slate-500'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-3 w-3" />
                    {local.endDate ? format(new Date(local.endDate), 'MMM d') : 'End'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-slate-900 border-slate-700" align="start">
                  <Calendar
                    mode="single"
                    selected={local.endDate ? new Date(local.endDate) : undefined}
                    onSelect={(d) => {
                      setLocal(prev => ({ ...prev, endDate: d ? format(d, 'yyyy-MM-dd') : null }));
                      setEndCalOpen(false);
                    }}
                    className="bg-slate-900"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          
          {/* Amount range */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Amount Range</Label>
            <div className="flex gap-2 items-center">
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                <Input
                  type="number"
                  placeholder="Min"
                  value={local.minAmount ?? ''}
                  onChange={(e) => setLocal(prev => ({
                    ...prev,
                    minAmount: e.target.value ? parseFloat(e.target.value) : null
                  }))}
                  className="h-8 pl-6 text-sm bg-slate-800/50 border-slate-700"
                />
              </div>
              <span className="text-slate-500">to</span>
              <div className="relative flex-1">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                <Input
                  type="number"
                  placeholder="Max"
                  value={local.maxAmount ?? ''}
                  onChange={(e) => setLocal(prev => ({
                    ...prev,
                    maxAmount: e.target.value ? parseFloat(e.target.value) : null
                  }))}
                  className="h-8 pl-6 text-sm bg-slate-800/50 border-slate-700"
                />
              </div>
            </div>
          </div>
          
          {/* Category filter */}
          <div className="space-y-2">
            <Label className="text-slate-300 text-sm">Category</Label>
            <CategorySelector
              value={local.categoryId}
              onChange={(id) => setLocal(prev => ({ ...prev, categoryId: id, uncategorized: false }))}
              placeholder="Any category"
            />
          </div>
          
          {/* Uncategorized only */}
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={local.uncategorized}
              onCheckedChange={(checked) => setLocal(prev => ({
                ...prev,
                uncategorized: !!checked,
                categoryId: checked ? null : prev.categoryId,
              }))}
              className="border-slate-600"
            />
            <span className="text-sm text-slate-300">Show uncategorized only</span>
          </label>
          
          {/* Apply button */}
          <Button
            onClick={handleApply}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500"
          >
            Apply Filters
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
