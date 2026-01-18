'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/services';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { cn } from '@/lib/utils';
import { UPPER_CATEGORY_TEXT_COLORS } from '@/lib/constants';
import { RuleDialog } from '@/components/rules';
import { CategoryProvider } from '@/components/transactions';

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
  const [currentCounts, setCurrentCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Rule dialog state
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoCategoryRuleWithCategory | null>(null);

  // Delete state
  const [deletingRule, setDeletingRule] = useState<AutoCategoryRuleWithCategory | null>(null);

  // Apply to existing state (for Zap button on existing rules)
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [applyingRuleId, setApplyingRuleId] = useState<string | null>(null);
  const [matchingCounts, setMatchingCounts] = useState<{ uncategorized: number; alreadyCategorized: number; total: number }>({ uncategorized: 0, alreadyCategorized: 0, total: 0 });
  const [includeAlreadyCategorized, setIncludeAlreadyCategorized] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ success: boolean; count: number } | null>(null);

  // Drag state
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Saving state (for delete)
  const [isSaving, setIsSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const [rulesResult, countsResult] = await Promise.all([
        api.get<AutoCategoryRuleWithCategory[]>('/api/rules'),
        api.get<{ counts: Record<string, number> }>('/api/rules?action=current-counts'),
      ]);
      if (rulesResult.data) {
        setRules(rulesResult.data);
      }
      if (countsResult.data) {
        setCurrentCounts(countsResult.data.counts);
      }
    } catch (err) {
      console.error('Failed to fetch rules:', err);
    }
  }, []);

  useEffect(() => {
    fetchRules().finally(() => {
      setIsLoading(false);
    });
  }, [fetchRules]);

  // Handle rule dialog success
  const handleRuleDialogSuccess = () => {
    fetchRules();
  };

  // Apply rule to existing transactions
  const handleApplyToExisting = async () => {
    if (!applyingRuleId) return;

    setIsApplying(true);
    try {
      const result = await api.post<{ updatedCount: number }>(`/api/rules/${applyingRuleId}`, {
        includeAlreadyCategorized,
      });

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
    setMatchingCounts({ uncategorized: 0, alreadyCategorized: 0, total: 0 });
    setIncludeAlreadyCategorized(false);
    setApplyResult(null);
  };

  // Open apply dialog for an existing rule
  const openApplyDialog = async (rule: AutoCategoryRuleWithCategory) => {
    try {
      // Fetch with includeAlreadyCategorized=true to get both counts
      const result = await api.get<{ uncategorized: number; alreadyCategorized: number; total: number }>(
        `/api/rules?action=count&matchText=${encodeURIComponent(rule.match_text)}&includeAlreadyCategorized=true`
      );
      if (result.data) {
        setApplyingRuleId(rule.id);
        setMatchingCounts(result.data);
        setIncludeAlreadyCategorized(false);
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
    setShowRuleDialog(true);
  };

  const openEditRuleDialog = (rule: AutoCategoryRuleWithCategory) => {
    setEditingRule(rule);
    setShowRuleDialog(true);
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
    <CategoryProvider>
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
                      {currentCounts[rule.id] ?? 0} matching transactions
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
      <RuleDialog
        open={showRuleDialog}
        onOpenChange={setShowRuleDialog}
        editingRule={editingRule}
        onSuccess={handleRuleDialogSuccess}
      />

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
            <DialogDescription asChild>
              <div className="text-slate-400">
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
                  <div className="space-y-3">
                    <p>
                      Found <span className="text-violet-400 font-semibold">{matchingCounts.uncategorized}</span> uncategorized
                      transaction{matchingCounts.uncategorized !== 1 ? 's' : ''} that match{matchingCounts.uncategorized === 1 ? 'es' : ''} this rule.
                    </p>
                    {matchingCounts.alreadyCategorized > 0 && (
                      <div className="flex items-start space-x-2 pt-2 border-t border-slate-700">
                        <Checkbox
                          id="include-categorized-mgmt"
                          checked={includeAlreadyCategorized}
                          onCheckedChange={(checked) => setIncludeAlreadyCategorized(checked === true)}
                          className="mt-0.5"
                          aria-label="Include already categorized transactions"
                        />
                        <label
                          htmlFor="include-categorized-mgmt"
                          className="text-sm text-slate-300 cursor-pointer"
                        >
                          Also re-categorise <span className="text-amber-400 font-semibold">{matchingCounts.alreadyCategorized}</span> already
                          categorised transaction{matchingCounts.alreadyCategorized !== 1 ? 's' : ''}
                        </label>
                      </div>
                    )}
                    <p className="text-xs text-slate-500">
                      {includeAlreadyCategorized
                        ? `Will apply to ${matchingCounts.total} total transactions`
                        : 'Would you like to categorise them now?'}
                    </p>
                  </div>
                )}
              </div>
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
                  Cancel
                </Button>
                <Button
                  onClick={handleApplyToExisting}
                  disabled={isApplying || (matchingCounts.uncategorized === 0 && !includeAlreadyCategorized)}
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
    </CategoryProvider>
  );
}
