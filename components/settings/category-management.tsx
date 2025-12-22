'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Plus, Edit2, Trash2, ChevronDown, ChevronRight, 
  Loader2, AlertTriangle, ArrowLeft 
} from 'lucide-react';
import type { UpperCategory, SubCategoryWithUpper } from '@/types/database';
import { cn } from '@/lib/utils';
import { SourceManagement } from './source-management';

interface CategoryGroup {
  id: string;
  name: string;
  type: string;
  sort_order: number;
  subCategories: SubCategoryWithUpper[];
}

interface CategoryManagementProps {
  onBack?: () => void;
}

export function CategoryManagement({ onBack }: CategoryManagementProps) {
  // Data
  const [categories, setCategories] = useState<CategoryGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // UI State
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  // Editing state
  const [editingUpper, setEditingUpper] = useState<UpperCategory | null>(null);
  const [editingUpperName, setEditingUpperName] = useState('');
  const [editingSub, setEditingSub] = useState<SubCategoryWithUpper | null>(null);
  const [editingSubName, setEditingSubName] = useState('');
  
  // New category state
  const [showNewSubDialog, setShowNewSubDialog] = useState(false);
  const [newSubUpperId, setNewSubUpperId] = useState<string>('');
  const [newSubName, setNewSubName] = useState('');
  
  // Delete state
  const [deletingSub, setDeletingSub] = useState<SubCategoryWithUpper | null>(null);
  const [reassignTarget, setReassignTarget] = useState<string>('null');
  const [transactionCount, setTransactionCount] = useState<number>(0);
  const [checkingTransactions, setCheckingTransactions] = useState(false);
  
  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const response = await fetch('/api/categories');
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories);
        // Expand all groups by default
        setExpandedGroups(new Set(data.categories.map((c: CategoryGroup) => c.id)));
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
      setError('Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Upper category rename
  const handleEditUpper = (upper: UpperCategory) => {
    setEditingUpper(upper);
    setEditingUpperName(upper.name);
  };

  const handleSaveUpperName = async () => {
    if (!editingUpper || !editingUpperName.trim()) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/categories/${editingUpper.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingUpperName.trim() }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update category');
      }
      
      setEditingUpper(null);
      fetchCategories();
    } catch {
      setError('Failed to update category name');
    } finally {
      setIsSaving(false);
    }
  };

  // Sub-category edit
  const handleEditSub = (sub: SubCategoryWithUpper) => {
    setEditingSub(sub);
    setEditingSubName(sub.name);
  };

  const handleSaveSubName = async () => {
    if (!editingSub || !editingSubName.trim()) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/categories/${editingSub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingSubName.trim() }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to update category');
      }
      
      setEditingSub(null);
      fetchCategories();
    } catch {
      setError('Failed to update category name');
    } finally {
      setIsSaving(false);
    }
  };

  // New sub-category
  const handleShowNewSub = (upperId: string) => {
    setNewSubUpperId(upperId);
    setNewSubName('');
    setShowNewSubDialog(true);
  };

  const handleCreateSub = async () => {
    if (!newSubUpperId || !newSubName.trim()) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          upper_category_id: newSubUpperId,
          name: newSubName.trim(),
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create category');
      }
      
      setShowNewSubDialog(false);
      fetchCategories();
    } catch {
      setError('Failed to create category');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete sub-category - check for transactions first before attempting delete
  const handleDeleteClick = async (sub: SubCategoryWithUpper) => {
    setDeletingSub(sub);
    setReassignTarget('null');
    setCheckingTransactions(true);
    
    try {
      // First, check if category has transactions
      const countResponse = await fetch(`/api/transactions?categoryId=${sub.id}&limit=1`);
      if (!countResponse.ok) {
        throw new Error('Failed to check transactions');
      }
      
      const countData = await countResponse.json();
      const txCount = countData.total || 0;
      
      if (txCount > 0) {
        // Has transactions - show reassign dialog
        setTransactionCount(txCount);
      } else {
        // No transactions - proceed with delete directly
        const response = await fetch(`/api/categories/${sub.id}`, {
          method: 'DELETE',
        });
        
        if (response.ok) {
          setDeletingSub(null);
          fetchCategories();
        } else {
          const data = await response.json();
          setError(data.error || 'Failed to delete category');
          setDeletingSub(null);
        }
      }
    } catch {
      setError('Failed to delete category');
      setDeletingSub(null);
    } finally {
      setCheckingTransactions(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingSub) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      const response = await fetch(
        `/api/categories/${deletingSub.id}?reassignTo=${reassignTarget}`,
        { method: 'DELETE' }
      );
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete category');
      }
      
      setDeletingSub(null);
      fetchCategories();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete category');
    } finally {
      setIsSaving(false);
    }
  };

  // Get all sub-categories for reassignment dropdown (excluding the one being deleted)
  const getReassignOptions = () => {
    const options: { id: string; name: string; group: string }[] = [];
    for (const group of categories) {
      for (const sub of group.subCategories) {
        if (deletingSub && sub.id !== deletingSub.id) {
          options.push({
            id: sub.id,
            name: sub.name,
            group: group.name,
          });
        }
      }
    }
    return options;
  };

  const getCategoryTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'income': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'expense': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'saving': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'bill': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'debt': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'transfer': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-slate-800 animate-pulse" />
          <div className="space-y-2">
            <div className="h-7 w-48 bg-slate-800 rounded animate-pulse" />
            <div className="h-4 w-64 bg-slate-800/50 rounded animate-pulse" />
          </div>
        </div>
        {/* Category group skeletons */}
        {[1, 2, 3].map((i) => (
          <Card key={i} className="border-slate-800 bg-slate-900/50">
            <CardHeader className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-slate-800 rounded animate-pulse" />
                  <div className="h-5 w-32 bg-slate-800 rounded animate-pulse" />
                  <div className="h-5 w-16 bg-slate-800/50 rounded-full animate-pulse" />
                </div>
                <div className="flex gap-2">
                  <div className="h-8 w-20 bg-slate-800 rounded animate-pulse" />
                  <div className="h-8 w-16 bg-slate-800 rounded animate-pulse" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 pb-4">
              <div className="space-y-2">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-10 bg-slate-800/30 rounded animate-pulse" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">Category Management</h1>
          <p className="text-slate-400 mt-1">
            Organize your income and expense categories
          </p>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/50 p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Sources section */}
      <SourceManagement className="mb-6" />

      {/* Category groups */}
      <div className="space-y-4">
        {categories.map((group) => (
          <Card key={group.id} className="border-slate-800 bg-slate-900/50">
            <CardHeader className="py-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="flex items-center gap-3 text-left"
                >
                  {expandedGroups.has(group.id) ? (
                    <ChevronDown className="w-5 h-5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  )}
                  <CardTitle className="text-lg text-slate-100">{group.name}</CardTitle>
                  <span className={cn(
                    'px-2 py-0.5 text-xs font-medium rounded-full border',
                    getCategoryTypeBadgeColor(group.type)
                  )}>
                    {group.type}
                  </span>
                  <span className="text-sm text-slate-500">
                    ({group.subCategories.length} categories)
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditUpper(group as unknown as UpperCategory)}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    <Edit2 className="w-4 h-4 mr-1" />
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleShowNewSub(group.id)}
                    className="text-cyan-400 hover:text-cyan-300"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            {expandedGroups.has(group.id) && (
              <CardContent className="pt-0 pb-4">
                {group.subCategories.length === 0 ? (
                  <p className="text-sm text-slate-500 italic py-2">
                    No categories yet. Click &quot;Add&quot; to create one.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {group.subCategories.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800/50 group"
                      >
                        <span className="text-slate-200">{sub.name}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleEditSub(sub)}
                            className="text-slate-400 hover:text-slate-200"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDeleteClick(sub)}
                            className="text-slate-400 hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {/* Edit Upper Category Dialog */}
      <Dialog open={!!editingUpper} onOpenChange={(open) => !open && setEditingUpper(null)}>
        <DialogContent className="sm:max-w-[400px] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Rename Category Group</DialogTitle>
            <DialogDescription className="text-slate-400">
              Update the name for this category group.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="upper-name" className="text-slate-300">Name</Label>
            <Input
              id="upper-name"
              value={editingUpperName}
              onChange={(e) => setEditingUpperName(e.target.value)}
              className="mt-2 bg-slate-800/50 border-slate-700 text-slate-100"
              placeholder="Category group name"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingUpper(null)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveUpperName}
              disabled={isSaving || !editingUpperName.trim()}
              className="bg-cyan-600 hover:bg-cyan-500"
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Sub-Category Dialog */}
      <Dialog open={!!editingSub} onOpenChange={(open) => !open && setEditingSub(null)}>
        <DialogContent className="sm:max-w-[400px] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Rename Category</DialogTitle>
            <DialogDescription className="text-slate-400">
              Update the name for this category.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="sub-name" className="text-slate-300">Name</Label>
            <Input
              id="sub-name"
              value={editingSubName}
              onChange={(e) => setEditingSubName(e.target.value)}
              className="mt-2 bg-slate-800/50 border-slate-700 text-slate-100"
              placeholder="Category name"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingSub(null)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSubName}
              disabled={isSaving || !editingSubName.trim()}
              className="bg-cyan-600 hover:bg-cyan-500"
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Sub-Category Dialog */}
      <Dialog open={showNewSubDialog} onOpenChange={setShowNewSubDialog}>
        <DialogContent className="sm:max-w-[400px] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Add Category</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a new category in {categories.find(c => c.id === newSubUpperId)?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="new-sub-name" className="text-slate-300">Name</Label>
            <Input
              id="new-sub-name"
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              className="mt-2 bg-slate-800/50 border-slate-700 text-slate-100"
              placeholder="Category name"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewSubDialog(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSub}
              disabled={isSaving || !newSubName.trim()}
              className="bg-cyan-600 hover:bg-cyan-500"
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Sub-Category Dialog */}
      <Dialog open={!!deletingSub && transactionCount > 0} onOpenChange={(open) => !open && setDeletingSub(null)}>
        <DialogContent className="sm:max-w-[450px] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Category Has Transactions
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              <strong className="text-slate-200">{deletingSub?.name}</strong> has{' '}
              <strong className="text-amber-400">{transactionCount}</strong> transactions.
              Choose where to move them before deleting.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reassign" className="text-slate-300">Move transactions to:</Label>
            <Select value={reassignTarget} onValueChange={setReassignTarget}>
              <SelectTrigger className="mt-2 bg-slate-800/50 border-slate-700 text-slate-100">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="null" className="text-slate-300">
                  Uncategorized
                </SelectItem>
                {getReassignOptions().map((opt) => (
                  <SelectItem key={opt.id} value={opt.id} className="text-slate-300">
                    {opt.group} → {opt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingSub(null)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={isSaving || checkingTransactions}
              variant="destructive"
              className="bg-red-600 hover:bg-red-500"
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Move & Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

