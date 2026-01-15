'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

interface MonthPickerProps {
  selected: Date;
  onSelect: (date: Date) => void;
  className?: string;
}

export function MonthPicker({ selected, onSelect, className }: MonthPickerProps) {
  const [displayYear, setDisplayYear] = React.useState(selected.getFullYear());

  // Sync displayYear when selected prop changes externally (e.g., arrow navigation)
  React.useEffect(() => {
    setDisplayYear(selected.getFullYear());
  }, [selected]);

  // Memoize current date values to avoid recalculating on every render
  const { currentMonth, currentYear } = React.useMemo(() => ({
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
  }), []);

  const selectedMonth = selected.getMonth();
  const selectedYear = selected.getFullYear();

  const handleMonthSelect = (monthIndex: number) => {
    onSelect(new Date(displayYear, monthIndex, 1));
  };

  const handlePrevYear = () => {
    setDisplayYear(prev => prev - 1);
  };

  const handleNextYear = () => {
    setDisplayYear(prev => prev + 1);
  };

  const handleThisMonth = () => {
    onSelect(new Date(currentYear, currentMonth, 1));
  };

  return (
    <div className={cn('p-3 bg-slate-900 border border-slate-700 rounded-lg', className)}>
      {/* Year navigation header */}
      <div className="flex items-center justify-between mb-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePrevYear}
          aria-label="Previous year"
          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="text-sm font-medium text-slate-200">{displayYear}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleNextYear}
          aria-label="Next year"
          className="h-7 w-7 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Month grid - 4 columns x 3 rows */}
      <div className="grid grid-cols-4 gap-1">
        {MONTHS.map((month, index) => {
          const isSelected = index === selectedMonth && displayYear === selectedYear;
          const isCurrent = index === currentMonth && displayYear === currentYear;

          return (
            <Button
              key={month}
              variant="ghost"
              size="sm"
              onClick={() => handleMonthSelect(index)}
              className={cn(
                'h-8 text-xs font-medium transition-colors',
                isSelected
                  ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30'
                  : isCurrent
                    ? 'text-cyan-400 hover:bg-slate-800'
                    : 'text-slate-300 hover:bg-slate-800'
              )}
            >
              {month}
            </Button>
          );
        })}
      </div>

      {/* This Month button */}
      <div className="mt-3 pt-3 border-t border-slate-700">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleThisMonth}
          className="w-full text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-500/10"
        >
          Go to This Month
        </Button>
      </div>
    </div>
  );
}
