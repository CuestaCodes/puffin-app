'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/services';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Zap, CheckCircle, AlertTriangle } from 'lucide-react';
import type { SubCategoryWithUpper } from '@/types/database';
import { UPPER_CATEGORY_TEXT_COLORS } from '@/lib/constants';

interface AutoCategoryRule {
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

interface RuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (rule: AutoCategoryRule, appliedCount?: number) => void;
  editingRule?: AutoCategoryRule | null;
  defaultMatchText?: string;
  defaultCategoryId?: string;
}

export function RuleDialog({
  open,
  onOpenChange,
  onSuccess,
  editingRule = null,
  defaultMatchText = '',
  defaultCategoryId = '',
}: RuleDialogProps) {
  // Form state
  const [matchText, setMatchText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<SubCategoryWithUpper[]>([]);

  // Test/preview state
  const [testMatches, setTestMatches] = useState<Array<{ id: string; description: string; date: string; amount: number }>>([]);
  const [isTesting, setIsTesting] = useState(false);

  // Duplicate check state
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);
  const [duplicateRuleId, setDuplicateRuleId] = useState<string | null>(null);

  // Apply dialog state
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [savedRuleId, setSavedRuleId] = useState<string | null>(null);
  const [matchingCount, setMatchingCount] = useState(0);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ success: boolean; count: number } | null>(null);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize form when dialog opens
  useEffect(() => {
    if (open) {
      if (editingRule) {
        setMatchText(editingRule.match_text);
        setCategoryId(editingRule.sub_category_id);
      } else {
        setMatchText(defaultMatchText);
        setCategoryId(defaultCategoryId);
      }
      setTestMatches([]);
      setError(null);
      setShowDuplicateWarning(false);
      setDuplicateRuleId(null);

      // Test the default match text if provided
      if (defaultMatchText && !editingRule) {
        testRule(defaultMatchText);
      }
    }
  }, [open, editingRule, defaultMatchText, defaultCategoryId]);

  // Fetch categories when dialog opens
  useEffect(() => {
    if (open && categories.length === 0) {
      fetchCategories();
    }
  }, [open, categories.length]);

  const fetchCategories = async () => {
    try {
      const result = await api.get<{ categories: Array<{ subCategories: SubCategoryWithUpper[] }> }>('/api/categories');
      if (result.data) {
        const allSubs: SubCategoryWithUpper[] = [];
        for (const group of result.data.categories) {
          allSubs.push(...group.subCategories);
        }
        setCategories(allSubs);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    }
  };

  // Test rule against existing transactions
  const testRule = useCallback(async (text: string) => {
    if (!text.trim()) {
      setTestMatches([]);
      return;
    }

    setIsTesting(true);
    try {
      const result = await api.get<{ matches: Array<{ id: string; description: string; date: string; amount: number }> }>(
        `/api/rules?action=test&matchText=${encodeURIComponent(text)}&limit=5`
      );
      if (result.data) {
        setTestMatches(result.data.matches || []);
      }
    } catch (err) {
      console.error('Failed to test rule:', err);
    } finally {
      setIsTesting(false);
    }
  }, []);

  // Check for duplicate match_text
  const checkDuplicate = async (text: string): Promise<string | null> => {
    try {
      const result = await api.get<AutoCategoryRule[]>('/api/rules');
      if (result.data) {
        const normalizedText = text.toLowerCase().trim();
        const duplicate = result.data.find(
          rule => rule.match_text.toLowerCase().trim() === normalizedText && rule.id !== editingRule?.id
        );
        return duplicate?.id || null;
      }
    } catch (err) {
      console.error('Failed to check for duplicates:', err);
    }
    return null;
  };

  const handleSave = async () => {
    if (!matchText.trim() || !categoryId) return;

    // Check for duplicates first (only for new rules or when match_text changed)
    if (!editingRule || editingRule.match_text !== matchText) {
      const duplicateId = await checkDuplicate(matchText);
      if (duplicateId) {
        setDuplicateRuleId(duplicateId);
        setShowDuplicateWarning(true);
        return;
      }
    }

    await saveRule();
  };

  const saveRule = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const url = editingRule ? `/api/rules/${editingRule.id}` : '/api/rules';
      const isNewRule = !editingRule;

      const result = editingRule
        ? await api.patch<AutoCategoryRule>(url, {
            match_text: matchText,
            sub_category_id: categoryId,
          })
        : await api.post<AutoCategoryRule>(url, {
            match_text: matchText,
            sub_category_id: categoryId,
          });

      if (result.data) {
        const savedRule = result.data;
        setSavedRuleId(savedRule.id);

        // For new rules, check if there are existing transactions to apply to
        if (isNewRule) {
          const countResult = await api.get<{ count: number }>(
            `/api/rules?action=count&matchText=${encodeURIComponent(matchText)}`
          );
          if (countResult.data && countResult.data.count > 0) {
            setMatchingCount(countResult.data.count);
            setApplyResult(null);
            setShowApplyDialog(true);
            // Keep the main dialog open but hidden behind apply dialog
            return;
          }
        }

        // No matching transactions or editing - just close
        onOpenChange(false);
        onSuccess?.(savedRule);
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
    if (!savedRuleId) return;

    setIsApplying(true);
    try {
      const result = await api.post<{ updatedCount: number }>(`/api/rules/${savedRuleId}`, {});

      if (result.data) {
        setApplyResult({ success: true, count: result.data.updatedCount });
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
    onOpenChange(false);

    // Fetch the updated rule to get match_count
    if (savedRuleId) {
      api.get<AutoCategoryRule[]>('/api/rules').then(result => {
        if (result.data) {
          const rule = result.data.find(r => r.id === savedRuleId);
          if (rule) {
            onSuccess?.(rule, applyResult?.count);
          }
        }
      });
    }
  };

  const handleMatchTextChange = (value: string) => {
    setMatchText(value);
    testRule(value);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
    }).format(amount);
  };

  const getTypeColor = (type: string): string => {
    return UPPER_CATEGORY_TEXT_COLORS[type] || 'text-slate-400';
  };

  return (
    <>
      {/* Main Rule Dialog */}
      <Dialog open={open && !showApplyDialog} onOpenChange={onOpenChange}>
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
                value={matchText}
                onChange={(e) => handleMatchTextChange(e.target.value)}
                placeholder="e.g., COLES, NETFLIX, UBER"
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">
                Transactions containing this text will be matched (case-insensitive)
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
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
            {matchText.trim() && (
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
              onClick={() => onOpenChange(false)}
              className="border-slate-700 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !matchText.trim() || !categoryId}
              className="bg-violet-600 hover:bg-violet-700 text-white"
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingRule ? 'Save Changes' : 'Create Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Warning Dialog */}
      <AlertDialog open={showDuplicateWarning} onOpenChange={setShowDuplicateWarning}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Duplicate Rule
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              A rule with the match text &quot;{matchText}&quot; already exists.
              Each match text should be unique to avoid conflicts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300">
              OK
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Apply to Existing Transactions Dialog */}
      <Dialog open={showApplyDialog} onOpenChange={() => {}}>
        <DialogContent
          className="bg-slate-900 border-slate-700"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
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
    </>
  );
}
