'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/services';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
  Plus,
  Edit2,
  Trash2,
  GripVertical,
  Loader2,
  ArrowLeft,
  Sparkles,
  Search,
  AlertTriangle,
  CheckCircle,
  Zap,
} from 'lucide-react';
import type { SubCategoryWithUpper } from '@/types/database';
import { cn } from '@/lib/utils';
import { UPPER_CATEGORY_TEXT_COLORS } from '@/lib/constants';

interface AutoCategoryRuleWithCategory {
  id: string;
  match_text: string;
  sub_category_id: string;
  priority: number;
  is_active: boolean;
  match_count: number;
  created_at: string;
  updated_at: string;
  sub_category_name: string;
  upper_category_name: string;
  upper_category_type: string;
}

interface RulesManagementProps {
  onBack?: () => void;
}

export function RulesManagement({ onBack }: RulesManagementProps) {
  // Data
  const [rules, setRules] = useState<AutoCategoryRuleWithCategory[]>([]);
  const [categories, setCategories] = useState<SubCategoryWithUpper[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // New/Edit rule state
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoCategoryRuleWithCategory | null>(null);
  const [ruleMatchText, setRuleMatchText] = useState('');
  const [ruleCategoryId, setRuleCategoryId] = useState('');

  // Test rule state
  const [testMatches, setTestMatches] = useState<Array<{ id: string; description: string; date: string; amount: number }>>([]);
  const [isTesting, setIsTesting] = useState(false);

  // Delete state
  const [deletingRule, setDeletingRule] = useState<AutoCategoryRuleWithCategory | null>(null);

  // Apply to existing state
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyingRuleId, setApplyingRuleId] = useState<string | null>(null);
  const [matchingCount, setMatchingCount] = useState(0);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ success: boolean; count: number } | null>(null);

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    try {
      const result = await api.get<AutoCategoryRuleWithCategory[]>('/api/rules');
      if (result.data) {
        setRules(result.data);
      }
    } catch (err) {
      console.error('Failed to fetch rules:', err);
      setError('Failed to load rules');
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const result = await api.get<{ categories: Array<{ subCategories: SubCategoryWithUpper[] }> }>('/api/categories');
      if (result.data) {
        // Flatten categories for the dropdown
        const allSubs: SubCategoryWithUpper[] = [];
        for (const group of result.data.categories) {
          allSubs.push(...group.subCategories);
        }
        setCategories(allSubs);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchRules(), fetchCategories()]).finally(() => {
      setIsLoading(false);
    });
  }, [fetchRules, fetchCategories]);

  // Test rule against existing transactions
  const testRule = async (matchText: string) => {
    if (!matchText.trim()) {
      setTestMatches([]);
      return;
    }

    setIsTesting(true);
    try {
      const result = await api.get<{ matches: Array<{ id: string; description: string; date: string; amount: number }> }>(`/api/rules?action=test&matchText=${encodeURIComponent(matchText)}&limit=5`);
      if (result.data) {
        setTestMatches(result.data.matches || []);
      }
    } catch (err) {
      console.error('Failed to test rule:', err);
    } finally {
      setIsTesting(false);
    }
  };

  // Create or update rule
  const handleSaveRule = async () => {
    if (!ruleMatchText.trim() || !ruleCategoryId) return;

    setIsSaving(true);
    setError(null);

    try {
      const url = editingRule ? `/api/rules/${editingRule.id}` : '/api/rules';
      const isNewRule = !editingRule;
      const matchText = ruleMatchText;

      const result = editingRule
        ? await api.patch<AutoCategoryRuleWithCategory>(url, {
            match_text: matchText,
            sub_category_id: ruleCategoryId,
          })
        : await api.post<AutoCategoryRuleWithCategory>(url, {
            match_text: matchText,
            sub_category_id: ruleCategoryId,
          });

      if (result.data) {
        const savedRule = result.data;
        await fetchRules();
        closeRuleDialog();

        // For new rules, check if there are existing transactions to apply to
        if (isNewRule) {
          const countResult = await api.get<{ count: number }>(`/api/rules?action=count&matchText=${encodeURIComponent(matchText)}`);
          if (countResult.data && countResult.data.count > 0) {
            setApplyingRuleId(savedRule.id);
            setMatchingCount(countResult.data.count);
            setApplyResult(null);
            setShowApplyDialog(true);
          }
        }
      } else {
        setError(result.error || 'Failed to save rule');
      }
    } catch (err) {
      console.error('Failed to save rule:', err);
      setError('Failed to save rule');
    } finally {
      setIsSaving(false);
    }
  };

  // Apply rule to existing transactions
  const handleApplyToExisting = async () => {
    if (!applyingRuleId) return;

    setIsApplying(true);
    try {
      const result = await api.post<{ updatedCount: number }>(`/api/rules/${applyingRuleId}`, {});

      if (result.data) {
        setApplyResult({ success: true, count: result.data.updatedCount });
        await fetchRules(); // Refresh to get updated match counts
      } else {
        setApplyResult({ success: false, count: 0 });
      }
    } catch (err) {
      console.error('Failed to apply rule:', err);
      setApplyResult({ success: false, count: 0 });
    } finally {
      setIsApplying(false);
    }
  };

  const closeApplyDialog = () => {
    setShowApplyDialog(false);
    setApplyingRuleId(null);
    setMatchingCount(0);
    setApplyResult(null);
  };

  // Open apply dialog for an existing rule
  const openApplyDialog = async (rule: AutoCategoryRuleWithCategory) => {
    try {
      const result = await api.get<{ count: number }>(`/api/rules?action=count&matchText=${encodeURIComponent(rule.match_text)}`);
      if (result.data) {
        setApplyingRuleId(rule.id);
        setMatchingCount(result.data.count);
        setApplyResult(null);
        setShowApplyDialog(true);
      }
    } catch (err) {
      console.error('Failed to get matching count:', err);
    }
  };

  // Toggle rule active state
  const handleToggleActive = async (rule: AutoCategoryRuleWithCategory) => {
    try {
      const result = await api.patch(`/api/rules/${rule.id}`, { is_active: !rule.is_active });

      if (result.data) {
        setRules(rules.map(r =>
          r.id === rule.id ? { ...r, is_active: !r.is_active } : r
        ));
      }
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  // Delete rule
  const handleDeleteRule = async () => {
    if (!deletingRule) return;

    setIsSaving(true);
    try {
      const result = await api.delete(`/api/rules/${deletingRule.id}`);

      if (result.data) {
        setRules(rules.filter(r => r.id !== deletingRule.id));
        setDeletingRule(null);
      }
    } catch (err) {
      console.error('Failed to delete rule:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex === null || dragOverIndex === null || draggedIndex === dragOverIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    // Reorder the rules array
    const newRules = [...rules];
    const [draggedRule] = newRules.splice(draggedIndex, 1);
    newRules.splice(dragOverIndex, 0, draggedRule);
    setRules(newRules);

    setDraggedIndex(null);
    setDragOverIndex(null);

    // Update priorities on server
    try {
      await api.patch('/api/rules', { ruleIds: newRules.map(r => r.id) });
    } catch (err) {
      console.error('Failed to update rule priorities:', err);
      // Refresh to get correct order
      await fetchRules();
    }
  };

  const openNewRuleDialog = () => {
    setEditingRule(null);
    setRuleMatchText('');
    setRuleCategoryId('');
    setTestMatches([]);
    setShowRuleDialog(true);
  };

  const openEditRuleDialog = (rule: AutoCategoryRuleWithCategory) => {
    setEditingRule(rule);
    setRuleMatchText(rule.match_text);
    setRuleCategoryId(rule.sub_category_id);
    setTestMatches([]);
    setShowRuleDialog(true);
  };

  const closeRuleDialog = () => {
    setShowRuleDialog(false);
    setEditingRule(null);
    setRuleMatchText('');
    setRuleCategoryId('');
    setTestMatches([]);
    setError(null);
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(amount);
  };

  // Get category type color from shared constants
  const getTypeColor = (type: string): string => {
    return UPPER_CATEGORY_TEXT_COLORS[type] || 'text-slate-400';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
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
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">Auto-Categorisation Rules</h1>
          <p className="text-slate-400 mt-1">
            Create rules to automatically categorise transactions during import
          </p>
        </div>
        <Button
          onClick={openNewRuleDialog}
          className="bg-violet-600 hover:bg-violet-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Rule
        </Button>
      </div>

      {/* Rules list */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-400" />
            Rules ({rules.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No rules yet</p>
              <p className="text-sm mt-1">Create a rule to automatically categorise transactions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {rules.map((rule, index) => (
                <div
                  key={rule.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-lg border transition-colors',
                    dragOverIndex === index
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600',
                    !rule.is_active && 'opacity-50'
                  )}
                >
                  {/* Drag handle */}
                  <div className="cursor-grab text-slate-500 hover:text-slate-300">
                    <GripVertical className="w-5 h-5" />
                  </div>

                  {/* Priority badge */}
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-medium text-slate-300">
                    {index + 1}
                  </div>

                  {/* Rule content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-white bg-slate-700 px-2 py-0.5 rounded">
                        {rule.match_text}
                      </span>
                      <span className="text-slate-500">→</span>
                      <span className={cn('text-sm font-medium', getTypeColor(rule.upper_category_type))}>
                        {rule.upper_category_name}
                      </span>
                      <span className="text-slate-400 text-sm">
                        / {rule.sub_category_name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      {rule.match_count} matches
                    </div>
                  </div>

                  {/* Active toggle */}
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={() => handleToggleActive(rule)}
                  />

                  {/* Actions */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openApplyDialog(rule)}
                    className="text-slate-400 hover:text-violet-400"
                    title="Apply to existing transactions"
                  >
                    <Zap className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEditRuleDialog(rule)}
                    className="text-slate-400 hover:text-white"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeletingRule(rule)}
                    className="text-slate-400 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info card */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-violet-950/30 border border-violet-900/50">
              <Search className="w-5 h-5 text-violet-400" />
            </div>
            <div className="text-sm text-slate-400">
              <p className="font-medium text-slate-200 mb-1">How rules work</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Rules are applied during CSV import in priority order (drag to reorder)</li>
                <li>First matching rule wins - the transaction gets that category</li>
                <li>Rules use &quot;contains&quot; matching (case-insensitive)</li>
                <li>Manually categorised transactions are not affected</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Rule Dialog */}
      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingRule ? 'Edit Rule' : 'Create Rule'}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Enter text to match and select a category
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-950/50 border border-red-900 rounded-lg text-red-400 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-slate-200">Match Text</Label>
              <Input
                value={ruleMatchText}
                onChange={(e) => {
                  setRuleMatchText(e.target.value);
                  testRule(e.target.value);
                }}
                placeholder="e.g., COLES, NETFLIX, UBER"
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">
                Transactions containing this text will be matched (case-insensitive)
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Category</Label>
              <Select value={ruleCategoryId} onValueChange={setRuleCategoryId}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {categories.map((cat) => (
                    <SelectItem
                      key={cat.id}
                      value={cat.id}
                      className="text-white hover:bg-slate-700"
                    >
                      <span className={getTypeColor(cat.upper_category_type)}>
                        {cat.upper_category_name}
                      </span>
                      <span className="text-slate-400 ml-1">/ {cat.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Test results */}
            {ruleMatchText.trim() && (
              <div className="space-y-2">
                <Label className="text-slate-200 flex items-center gap-2">
                  Preview Matches
                  {isTesting && <Loader2 className="w-3 h-3 animate-spin" />}
                </Label>
                {testMatches.length > 0 ? (
                  <div className="bg-slate-800 rounded-lg p-2 space-y-1 max-h-32 overflow-y-auto">
                    {testMatches.map((tx) => (
                      <div key={tx.id} className="text-xs flex items-center justify-between">
                        <span className="text-slate-300 truncate flex-1">{tx.description}</span>
                        <span className={tx.amount < 0 ? 'text-red-400' : 'text-emerald-400'}>
                          {formatCurrency(tx.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    No uncategorized transactions match this text
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeRuleDialog}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveRule}
              disabled={isSaving || !ruleMatchText.trim() || !ruleCategoryId}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {editingRule ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingRule} onOpenChange={() => setDeletingRule(null)}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Delete Rule
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to delete the rule matching &quot;{deletingRule?.match_text}&quot;?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingRule(null)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteRule}
              disabled={isSaving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Delete Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply to Existing Transactions Dialog */}
      <Dialog open={showApplyDialog} onOpenChange={closeApplyDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-violet-400" />
              Apply to Existing Transactions
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {applyResult ? (
                applyResult.success ? (
                  <span className="flex items-center gap-2 text-emerald-400">
                    <CheckCircle className="w-4 h-4" />
                    Successfully categorised {applyResult.count} transaction{applyResult.count !== 1 ? 's' : ''}!
                  </span>
                ) : (
                  <span className="text-red-400">Failed to apply rule. Please try again.</span>
                )
              ) : (
                <>
                  Found <span className="text-violet-400 font-semibold">{matchingCount}</span> uncategorized
                  transaction{matchingCount !== 1 ? 's' : ''} that match{matchingCount === 1 ? 'es' : ''} this rule.
                  Would you like to categorise them now?
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            {applyResult ? (
              <Button
                onClick={closeApplyDialog}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={closeApplyDialog}
                  className="border-slate-700 text-slate-300"
                >
                  Skip
                </Button>
                <Button
                  onClick={handleApplyToExisting}
                  disabled={isApplying}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  {isApplying ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Zap className="w-4 h-4 mr-2" />
                  )}
                  Apply Now
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
