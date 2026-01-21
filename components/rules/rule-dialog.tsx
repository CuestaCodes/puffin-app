'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '@/lib/services';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Zap, CheckCircle, AlertTriangle } from 'lucide-react';
import { CategorySelector } from '@/components/transactions/category-selector';
import { MAX_RULE_MATCH_TEXT_LENGTH } from '@/lib/validations';

// Pure function - doesn't need to be inside component
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount);
};

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
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [addToTop, setAddToTop] = useState(false);

  // Test/preview state
  const [testMatches, setTestMatches] = useState<Array<{ id: string; description: string; date: string; amount: number }>>([]);
  const [isTesting, setIsTesting] = useState(false);

  // Duplicate check state
  const [showDuplicateWarning, setShowDuplicateWarning] = useState(false);

  // Debounce ref for test rule
  const testDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Apply dialog state
  const [showApplyDialog, setShowApplyDialog] = useState(false);
  const [savedRuleId, setSavedRuleId] = useState<string | null>(null);
  const [matchingCounts, setMatchingCounts] = useState<{ uncategorized: number; alreadyCategorized: number; total: number }>({ uncategorized: 0, alreadyCategorized: 0, total: 0 });
  const [includeAlreadyCategorized, setIncludeAlreadyCategorized] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<{ success: boolean; count: number } | null>(null);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Initialize form when dialog opens
  useEffect(() => {
    if (open) {
      if (editingRule) {
        setMatchText(editingRule.match_text);
        setCategoryId(editingRule.sub_category_id);
      } else {
        setMatchText(defaultMatchText);
        setCategoryId(defaultCategoryId || null);
      }
      setTestMatches([]);
      setError(null);
      setShowDuplicateWarning(false);
      setAddToTop(false);

      // Test the default match text if provided
      if (defaultMatchText && !editingRule) {
        testRule(defaultMatchText);
      }
    }
  }, [open, editingRule, defaultMatchText, defaultCategoryId, testRule]);

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
            add_to_top: addToTop,
          });

      if (result.data) {
        const savedRule = result.data;
        setSavedRuleId(savedRule.id);

        // For new rules, check if there are existing transactions to apply to
        if (isNewRule) {
          // Always fetch with includeAlreadyCategorized=true to get both counts
          const countResult = await api.get<{ uncategorized: number; alreadyCategorized: number; total: number }>(
            `/api/rules?action=count&matchText=${encodeURIComponent(matchText)}&includeAlreadyCategorized=true`
          );
          if (countResult.data && countResult.data.total > 0) {
            setMatchingCounts(countResult.data);
            setIncludeAlreadyCategorized(false); // Reset checkbox
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
      const result = await api.post<{ updatedCount: number }>(`/api/rules/${savedRuleId}`, {
        includeAlreadyCategorized,
      });

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
      void api.get<AutoCategoryRule[]>('/api/rules').then(result => {
        if (result.data) {
          const rule = result.data.find(r => r.id === savedRuleId);
          if (rule) {
            onSuccess?.(rule, applyResult?.count);
          }
        }
      }).catch(err => {
        console.error('Failed to fetch updated rule:', err);
      });
    }
  };

  const handleMatchTextChange = (value: string) => {
    setMatchText(value);

    // Debounce test rule calls
    if (testDebounceRef.current) {
      clearTimeout(testDebounceRef.current);
    }
    testDebounceRef.current = setTimeout(() => {
      testRule(value);
    }, 300);
  };

  // Memoize test matches display to prevent re-rendering on every keystroke
  const testMatchesDisplay = useMemo(() => {
    if (testMatches.length === 0) return null;
    return (
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
    );
  }, [testMatches]);

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
                maxLength={MAX_RULE_MATCH_TEXT_LENGTH}
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-500">
                Transactions containing this text will be matched (case-insensitive)
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-200">Category</Label>
              <CategorySelector
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Search categories..."
              />
            </div>

            {/* Add to top option - only for new rules */}
            {!editingRule && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="add-to-top"
                  checked={addToTop}
                  onCheckedChange={(checked) => setAddToTop(checked === true)}
                />
                <label
                  htmlFor="add-to-top"
                  className="text-sm text-slate-300 cursor-pointer"
                >
                  Add to top of list (highest priority)
                </label>
              </div>
            )}

            {/* Test results */}
            {matchText.trim() && (
              <div className="space-y-2">
                <Label className="text-slate-200 flex items-center gap-2">
                  Preview Matches
                  {isTesting && <Loader2 className="w-3 h-3 animate-spin" />}
                </Label>
                {testMatchesDisplay || (
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
                          id="include-categorized"
                          checked={includeAlreadyCategorized}
                          onCheckedChange={(checked) => setIncludeAlreadyCategorized(checked === true)}
                          className="mt-0.5"
                          aria-label="Include already categorized transactions"
                        />
                        <label
                          htmlFor="include-categorized"
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
                  Skip
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
    </>
  );
}
