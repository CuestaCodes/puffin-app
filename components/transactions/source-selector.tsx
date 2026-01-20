'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/services';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import type { Source } from '@/types/database';

interface SourceSelectorProps {
  value: string | null;
  onChange: (sourceId: string | null) => void;
  placeholder?: string;
  compact?: boolean;
  allowCreate?: boolean;
}

/**
 * Source selector component for picking transaction sources.
 * 
 * Note: Unlike CategorySelector which uses a shared Context, this component fetches
 * sources on each mount. This is acceptable because:
 * 1. Sources are typically few (5-10 max) and the API call is lightweight
 * 2. SourceSelector is rarely rendered multiple times on the same page
 * 3. The simplicity of self-contained state outweighs the minor duplicate fetches
 * 
 * If performance becomes an issue with many selectors, consider creating a SourceContext.
 */
export function SourceSelector({
  value,
  onChange,
  placeholder = 'Select source...',
  compact = false,
  allowCreate = true,
}: SourceSelectorProps) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [newSourceName, setNewSourceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const fetchSources = useCallback(async () => {
    try {
      const result = await api.get<{ sources: Source[] }>('/api/sources');
      if (result.data) {
        setSources(result.data.sources || []);
      }
    } catch (error) {
      console.error('Failed to fetch sources:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const selectedSource = sources.find(s => s.id === value);

  const handleCreateSource = async () => {
    if (!newSourceName.trim()) return;

    setIsCreating(true);
    try {
      const result = await api.post<{ source: Source }>('/api/sources', { name: newSourceName.trim() });

      if (result.data?.source) {
        const newSource = result.data.source;
        setSources(prev => [...prev, newSource]);
        onChange(newSource.id);
        setNewSourceName('');
        setShowCreateForm(false);
        setOpen(false);
      }
    } catch (error) {
      console.error('Failed to create source:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  const handleSelect = (sourceId: string | null) => {
    onChange(sourceId);
    setOpen(false);
  };

  if (loading) {
    return (
      <Button
        variant="outline"
        disabled
        className={cn(
          'justify-between bg-slate-800/50 border-slate-700 text-slate-500',
          compact ? 'h-8 text-xs px-2' : 'w-full'
        )}
      >
        Loading...
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            'justify-between bg-slate-800/50 border-slate-700 text-slate-100 hover:bg-slate-800',
            compact ? 'h-8 text-xs px-2' : 'w-full'
          )}
        >
          {selectedSource ? (
            <span className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {selectedSource.name}
              </span>
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleClear(e as unknown as React.MouseEvent); }}
                className="ml-1 text-slate-400 hover:text-slate-200 cursor-pointer"
                aria-label="Clear source selection"
              >
                <X className="h-3 w-3" />
              </span>
            </span>
          ) : (
            <span className="text-slate-500">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0 bg-slate-900 border-slate-700">
        <div className="max-h-[300px] overflow-auto">
          {/* No source option */}
          <button
            onClick={() => handleSelect(null)}
            className={cn(
              'w-full px-3 py-2 text-left text-sm hover:bg-slate-800 transition-colors',
              value === null ? 'text-blue-400 bg-slate-800/50' : 'text-slate-400'
            )}
          >
            No source
          </button>

          {/* Source list */}
          {sources.map((source) => (
            <button
              key={source.id}
              onClick={() => handleSelect(source.id)}
              className={cn(
                'w-full px-3 py-2 text-left text-sm hover:bg-slate-800 transition-colors flex items-center gap-2',
                value === source.id ? 'bg-slate-800/50' : ''
              )}
            >
              <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                {source.name}
              </span>
            </button>
          ))}

          {/* Divider */}
          {allowCreate && <div className="border-t border-slate-700 my-1" />}

          {/* Create new source */}
          {allowCreate && (
            <div className="p-2">
              {showCreateForm ? (
                <div className="space-y-2">
                  <Input
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    placeholder="New source name..."
                    className="h-8 bg-slate-800/50 border-slate-700 text-slate-100"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateSource();
                      }
                      if (e.key === 'Escape') {
                        setShowCreateForm(false);
                        setNewSourceName('');
                      }
                    }}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 h-7 text-xs bg-blue-600 hover:bg-blue-500"
                      onClick={handleCreateSource}
                      disabled={isCreating || !newSourceName.trim()}
                    >
                      {isCreating ? 'Creating...' : 'Create'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-slate-700"
                      onClick={() => {
                        setShowCreateForm(false);
                        setNewSourceName('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="w-full px-2 py-1.5 text-sm text-blue-400 hover:text-blue-300 flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create new source
                </button>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
