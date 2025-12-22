'use client';

import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, X, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useCategories } from './category-context';
import type { UpperCategory, SubCategoryWithUpper, UpperCategoryType } from '@/types/database';

interface CategorySelectorProps {
  value: string | null;
  onChange: (categoryId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  compact?: boolean; // For inline use in tables
}

interface CategoriesData {
  upperCategories: UpperCategory[];
  subCategories: SubCategoryWithUpper[];
}

export function CategorySelector({
  value,
  onChange,
  placeholder = 'Select category...',
  disabled = false,
  className,
  compact = false,
}: CategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { categories, isLoading, error, refetch } = useCategories();

  // Group sub-categories by upper category
  const groupedCategories = useMemo(() => {
    if (!categories) return new Map<string, SubCategoryWithUpper[]>();
    
    const grouped = new Map<string, SubCategoryWithUpper[]>();
    for (const upper of categories.upperCategories) {
      const subs = categories.subCategories.filter(
        sub => sub.upper_category_id === upper.id
      );
      if (subs.length > 0) {
        grouped.set(upper.id, subs);
      }
    }
    return grouped;
  }, [categories]);

  // Filter by search
  const filteredCategories = useMemo(() => {
    if (!search.trim()) return groupedCategories;
    
    const searchLower = search.toLowerCase();
    const filtered = new Map<string, SubCategoryWithUpper[]>();
    
    for (const [upperId, subs] of groupedCategories) {
      const matchingSubs = subs.filter(sub =>
        sub.name.toLowerCase().includes(searchLower) ||
        sub.upper_category_name.toLowerCase().includes(searchLower)
      );
      if (matchingSubs.length > 0) {
        filtered.set(upperId, matchingSubs);
      }
    }
    return filtered;
  }, [groupedCategories, search]);

  // Get selected category name
  const selectedCategory = useMemo(() => {
    if (!value || !categories) return null;
    return categories.subCategories.find(sub => sub.id === value) || null;
  }, [value, categories]);

  const handleSelect = (categoryId: string) => {
    onChange(categoryId);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  // Type-safe color mapping - exhaustive by construction
  const CATEGORY_TYPE_COLORS = {
    income: 'text-emerald-400',
    expense: 'text-red-400',
    saving: 'text-cyan-400',
    bill: 'text-orange-400',
    debt: 'text-purple-400',
    transfer: 'text-slate-400',
  } as const satisfies Record<UpperCategoryType, string>;

  const getCategoryTypeColor = (type: UpperCategoryType): string => {
    return CATEGORY_TYPE_COLORS[type];
  };

  if (compact) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={disabled}
            className={cn(
              'inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors',
              'hover:bg-slate-700/50 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-1 focus:ring-offset-slate-900',
              selectedCategory ? 'bg-slate-700 text-slate-300' : 'bg-slate-800/50 text-slate-500',
              disabled && 'opacity-50 cursor-not-allowed',
              className
            )}
          >
            {selectedCategory ? selectedCategory.name : 'Uncategorized'}
            <ChevronsUpDown className="w-3 h-3 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0 bg-slate-900 border-slate-700" align="start">
          <CategoryList
            search={search}
            setSearch={setSearch}
            filteredCategories={filteredCategories}
            categories={categories}
            value={value}
            handleSelect={handleSelect}
            getCategoryTypeColor={getCategoryTypeColor}
            isLoading={isLoading}
            error={error}
            onRetry={refetch}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full justify-between',
            'bg-slate-800/50 border-slate-700 text-slate-100 hover:bg-slate-800 hover:text-slate-50',
            !selectedCategory && 'text-slate-500',
            className
          )}
        >
          {selectedCategory ? (
            <span className="flex items-center gap-2 truncate">
              <span className={cn('text-xs', getCategoryTypeColor(selectedCategory.upper_category_type))}>
                {selectedCategory.upper_category_name}
              </span>
              <span className="text-slate-400">/</span>
              <span className="truncate">{selectedCategory.name}</span>
            </span>
          ) : (
            placeholder
          )}
          <div className="flex items-center gap-1">
            {selectedCategory && (
              <X
                className="w-4 h-4 text-slate-500 hover:text-slate-300"
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0 bg-slate-900 border-slate-700">
        <CategoryList
          search={search}
          setSearch={setSearch}
          filteredCategories={filteredCategories}
          categories={categories}
          value={value}
          handleSelect={handleSelect}
          getCategoryTypeColor={getCategoryTypeColor}
          isLoading={isLoading}
          error={error}
          onRetry={refetch}
        />
      </PopoverContent>
    </Popover>
  );
}

// Extracted list component for reuse
function CategoryList({
  search,
  setSearch,
  filteredCategories,
  categories,
  value,
  handleSelect,
  getCategoryTypeColor,
  isLoading,
  error,
  onRetry,
}: {
  search: string;
  setSearch: (s: string) => void;
  filteredCategories: Map<string, SubCategoryWithUpper[]>;
  categories: CategoriesData | null;
  value: string | null;
  handleSelect: (id: string) => void;
  getCategoryTypeColor: (type: UpperCategoryType) => string;
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="p-2 border-b border-slate-700">
        <Input
          placeholder="Search categories..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 bg-slate-800/50 border-slate-700 text-sm"
          autoFocus
        />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-slate-500 text-sm">
            Loading categories...
          </div>
        ) : error ? (
          <div className="p-4 text-center">
            <p className="text-red-400 text-sm mb-2">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              className="text-slate-400 hover:text-slate-200"
            >
              <RefreshCw className="w-3 h-3 mr-1" />
              Retry
            </Button>
          </div>
        ) : filteredCategories.size === 0 ? (
          <div className="p-4 text-center text-slate-500 text-sm">
            No categories found
          </div>
        ) : (
          Array.from(filteredCategories.entries()).map(([upperId, subs]) => {
            const upper = categories?.upperCategories.find(u => u.id === upperId);
            if (!upper) return null;
            
            return (
              <div key={upperId} className="py-1">
                <div className={cn(
                  'px-3 py-1 text-xs font-semibold uppercase tracking-wider',
                  getCategoryTypeColor(upper.type)
                )}>
                  {upper.name}
                </div>
                {subs.map(sub => (
                  <button
                    key={sub.id}
                    onClick={() => handleSelect(sub.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left',
                      'hover:bg-slate-800 transition-colors',
                      value === sub.id && 'bg-slate-800'
                    )}
                  >
                    <Check
                      className={cn(
                        'w-4 h-4',
                        value === sub.id ? 'opacity-100 text-cyan-400' : 'opacity-0'
                      )}
                    />
                    <span className="text-slate-200">{sub.name}</span>
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
