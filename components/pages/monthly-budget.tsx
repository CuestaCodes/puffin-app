'use client';

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/services';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, ChevronDown, Calendar, X, TrendingDown, TrendingUp, Wallet, Edit2, Plus, Save, Copy, BarChart2 } from 'lucide-react';
import { CategoryProvider, MonthlyTransactionList } from '@/components/transactions';
import { InlineBudgetEditor } from '@/components/budgets/inline-budget-editor';
import { MonthPicker } from '@/components/ui/month-picker';
import { cn, withScrollPreservation } from '@/lib/utils';
import type { BudgetWithCategory, BudgetTemplate } from '@/types/database';

interface IncomeCategory {
  sub_category_id: string;
  sub_category_name: string;
  upper_category_name: string;
  upper_category_type: string;
  actual_amount: number;
}

interface BudgetSummaryResponse {
  budgets: Array<BudgetWithCategory & { actual_amount: number }>;
  totalBudgeted: number;
  totalSpent: number;
  totalIncome: number;
  incomeCategories: IncomeCategory[];
  year: number;
  month: number;
}

// Category with budget info for display
interface CategoryWithBudget {
  sub_category_id: string;
  sub_category_name: string;
  upper_category_name: string;
  upper_category_type: string;
  budget_id: string | null;
  budget_amount: number | null;
  actual_amount: number;
  average_3mo: number;
  average_6mo: number;
  carry_over: number;
}

// Group categories by upper category
interface CategoryGroup {
  upperCategoryId: string;
  upperCategoryName: string;
  upperCategoryType: string;
  categories: CategoryWithBudget[];
  totalBudgeted: number;
  totalSpent: number;
}

function MonthlyBudgetContent() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [budgetData, setBudgetData] = useState<BudgetSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [creatingBudgetForCategory, setCreatingBudgetForCategory] = useState<string | null>(null);
  const [allCategories, setAllCategories] = useState<Array<{
    sub_category_id: string;
    sub_category_name: string;
    upper_category_name: string;
    upper_category_type: string;
    current_budget: number | null;
    average_3mo: number;
    average_6mo: number;
    carry_over: number;
    actual_amount: number;
  }>>([]);
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  const [showAverageConfirm, setShowAverageConfirm] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  // Ref for smooth scrolling to transactions
  const transactionsRef = useRef<HTMLDivElement>(null);
  // Ref to preserve scroll position during month navigation
  const savedScrollY = useRef<number | null>(null);

  // Handle escape key to cancel editing
  useEffect(() => {
    const handleEscKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingBudgetId(null);
        setCreatingBudgetForCategory(null);
      }
    };
    
    window.addEventListener('keydown', handleEscKey);
    return () => window.removeEventListener('keydown', handleEscKey);
  }, []);
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // 1-12

  const monthYear = currentDate.toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  // Save scroll position and blur before navigation
  const prepareForNavigation = () => {
    savedScrollY.current = window.scrollY;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const goToPrevMonth = () => {
    prepareForNavigation();
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setSelectedCategoryId(null);
    setSelectedCategoryName(null);
    setEditingBudgetId(null);
    setCreatingBudgetForCategory(null);
  };

  const goToNextMonth = () => {
    prepareForNavigation();
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setSelectedCategoryId(null);
    setSelectedCategoryName(null);
    setEditingBudgetId(null);
    setCreatingBudgetForCategory(null);
  };

  const _goToToday = () => {
    prepareForNavigation();
    setCurrentDate(new Date());
    setSelectedCategoryId(null);
    setSelectedCategoryName(null);
    setEditingBudgetId(null);
    setCreatingBudgetForCategory(null);
  };

  const handleMonthSelect = (date: Date) => {
    prepareForNavigation();
    setCurrentDate(date);
    setSelectedCategoryId(null);
    setSelectedCategoryName(null);
    setEditingBudgetId(null);
    setCreatingBudgetForCategory(null);
    setMonthPickerOpen(false);
  };

  const fetchBudgetSummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        year: year.toString(),
        month: month.toString(),
        summary: 'true',
      });

      const result = await api.get<BudgetSummaryResponse>(`/api/budgets?${params}`);
      if (result.data) {
        setBudgetData(result.data);
      } else {
        console.error('Failed to fetch budget summary:', result.error);
        setBudgetData(null);
      }
    } catch (error) {
      console.error('Failed to fetch budget summary:', error);
      setBudgetData(null);
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchBudgetSummary();
  }, [fetchBudgetSummary]);

  // Restore scroll position after data loads to prevent view jumping
  // useLayoutEffect runs synchronously before browser paint
  useLayoutEffect(() => {
    if (!isLoading && savedScrollY.current !== null) {
      window.scrollTo(0, savedScrollY.current);
      savedScrollY.current = null;
    }
  }, [isLoading]);

  const fetchAllCategories = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        year: year.toString(),
        month: month.toString(),
        forEntry: 'true',
      });

      const result = await api.get<{ categories: typeof allCategories }>(`/api/budgets?${params}`);
      if (result.data) {
        setAllCategories(result.data.categories || []);
      } else {
        console.error('Failed to fetch categories:', result.error);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, [year, month]);

  // Initialize $0 budgets for categories without budgets
  const initializeBudgets = useCallback(async () => {
    try {
      await api.post('/api/budgets', {
        action: 'initialize',
        year,
        month,
      });
    } catch (error) {
      console.error('Failed to initialize budgets:', error);
    }
  }, [year, month]);

  // Fetch all categories on mount and when month changes, then initialize missing budgets
  useEffect(() => {
    const initializeMonth = async () => {
      await fetchAllCategories();
      await initializeBudgets();
    };
    initializeMonth();
  }, [fetchAllCategories, initializeBudgets]);

  const fetchTemplates = useCallback(async () => {
    try {
      const result = await api.get<{ templates: BudgetTemplate[] }>('/api/budgets/templates');
      if (result.data) {
        setTemplates(result.data.templates || []);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleSaveAsTemplate = async () => {
    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    setIsSavingTemplate(true);
    try {
      const result = await api.post<{ success: boolean }>('/api/budgets/templates', {
        name: templateName.trim(),
        year,
        month,
      });

      if (result.data) {
        setTemplateDialogOpen(false);
        setTemplateName('');
        await fetchTemplates();
        alert('Template saved successfully!');
      } else {
        alert('Failed to save template: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const handleApplyTemplate = async (templateId: string) => {
    setIsApplyingTemplate(true);
    try {
      const result = await api.post<{ appliedCount: number }>('/api/budgets/templates', {
        action: 'apply',
        templateId,
        year,
        month,
      });

      if (result.data) {
        await Promise.all([fetchBudgetSummary(), fetchAllCategories()]);
        alert(`Template applied to ${result.data.appliedCount} categories`);
      } else {
        alert('Failed to apply template: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error applying template:', error);
      alert('Failed to apply template');
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  const handleCopyFromPreviousMonth = async () => {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    setShowCopyConfirm(false);
    setIsApplyingTemplate(true);

    try {
      const result = await api.post<{ copiedCount: number }>('/api/budgets', {
        action: 'copy',
        fromYear: prevYear,
        fromMonth: prevMonth,
        toYear: year,
        toMonth: month,
      });

      if (result.data) {
        await Promise.all([fetchBudgetSummary(), fetchAllCategories()]);
      }
    } catch (error) {
      console.error('Error copying budgets:', error);
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  const handleUse12MonthAverage = async () => {
    setShowAverageConfirm(false);
    setIsApplyingTemplate(true);

    try {
      const result = await api.post<{ updatedCount: number }>('/api/budgets', {
        action: 'useAverage',
        year,
        month,
      });

      if (result.data) {
        await Promise.all([fetchBudgetSummary(), fetchAllCategories()]);
      }
    } catch (error) {
      console.error('Error applying 12-month averages:', error);
    } finally {
      setIsApplyingTemplate(false);
    }
  };

  // Group all categories by upper category, merging with budget data
  // Exclude income and transfer categories (they're shown separately as read-only)
  const groupedCategories: CategoryGroup[] = allCategories.length > 0 ? 
    Object.values(
      allCategories
        .filter(cat => cat.upper_category_type !== 'income' && cat.upper_category_type !== 'transfer') // Exclude income and transfer
        .reduce((acc, cat) => {
          const key = cat.upper_category_name;
          if (!acc[key]) {
            acc[key] = {
              upperCategoryId: key,
              upperCategoryName: cat.upper_category_name,
              upperCategoryType: cat.upper_category_type,
              categories: [],
              totalBudgeted: 0,
              totalSpent: 0,
            };
          }
          
          // Find matching budget if exists
          const budget = budgetData?.budgets?.find(b => b.sub_category_id === cat.sub_category_id);
          
          const categoryWithBudget: CategoryWithBudget = {
            sub_category_id: cat.sub_category_id,
            sub_category_name: cat.sub_category_name,
            upper_category_name: cat.upper_category_name,
            upper_category_type: cat.upper_category_type,
            budget_id: budget?.id || null,
            budget_amount: budget?.amount ?? cat.current_budget,
            actual_amount: Math.abs(cat.actual_amount), // Expenses are negative, so take absolute value
            average_3mo: cat.average_3mo,
            average_6mo: cat.average_6mo,
            carry_over: cat.carry_over,
          };
          
          acc[key].categories.push(categoryWithBudget);
          acc[key].totalBudgeted += categoryWithBudget.budget_amount || 0;
          acc[key].totalSpent += categoryWithBudget.actual_amount;
          return acc;
        }, {} as Record<string, CategoryGroup>)
    ) : [];
  
  // Get income categories with their totals
  const incomeCategories = allCategories
    .filter(cat => cat.upper_category_type === 'income')
    .map(cat => ({
      ...cat,
      actual_amount: cat.actual_amount, // Income is positive, keep as-is
    }));

  // Get transfer categories with their totals (read-only, not contributing to budget)
  const transferCategories = allCategories
    .filter(cat => cat.upper_category_type === 'transfer')
    .map(cat => ({
      ...cat,
      actual_amount: Math.abs(cat.actual_amount), // Take absolute value for display
    }));
  
  // Calculate transfer totals
  const totalTransfers = transferCategories.reduce((sum, c) => sum + c.actual_amount, 0);

  const handleCategoryClick = (categoryId: string, categoryName: string) => {
    if (selectedCategoryId === categoryId) {
      // Toggle off if same category clicked
      setSelectedCategoryId(null);
      setSelectedCategoryName(null);
    } else {
      setSelectedCategoryId(categoryId);
      setSelectedCategoryName(categoryName);
      // Smooth scroll to transactions section
      setTimeout(() => {
        transactionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  };

  const clearCategoryFilter = useCallback(() => {
    setSelectedCategoryId(null);
    setSelectedCategoryName(null);
  }, []);

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  // Handle budget refresh when transactions change
  // Memoized to prevent unnecessary re-renders of MonthlyTransactionList
  const handleCategoryChange = useCallback(async () => {
    await withScrollPreservation(async () => {
      await Promise.all([fetchBudgetSummary(), fetchAllCategories()]);
    });
  }, [fetchBudgetSummary, fetchAllCategories]);

  const handleSaveBudget = async (subCategoryId: string, amount: number) => {
    try {
      const result = await api.post<{ budget: unknown }>('/api/budgets', {
        sub_category_id: subCategoryId,
        year,
        month,
        amount,
      });

      if (result.data) {
        setEditingBudgetId(null);
        setCreatingBudgetForCategory(null);
        // Refetch both budget summary and categories to update the UI
        await Promise.all([fetchBudgetSummary(), fetchAllCategories()]);
      } else {
        alert('Failed to save budget: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving budget:', error);
      alert('Failed to save budget: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleEditBudget = (budgetId: string) => {
    setEditingBudgetId(budgetId);
    setCreatingBudgetForCategory(null);
  };

  const handleCreateBudget = (subCategoryId: string) => {
    setCreatingBudgetForCategory(subCategoryId);
    setEditingBudgetId(null);
  };

  const handleCancelEdit = () => {
    setEditingBudgetId(null);
    setCreatingBudgetForCategory(null);
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const remaining = (budgetData?.totalBudgeted || 0) - (budgetData?.totalSpent || 0);
  const spentPercentage = budgetData?.totalBudgeted 
    ? Math.min(100, (budgetData.totalSpent / budgetData.totalBudgeted) * 100)
    : 0;

  return (
    <div className="space-y-6" style={{ overflowAnchor: 'none' }}>
      {/* Page header with month navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Monthly Budget</h1>
          <p className="text-slate-400 mt-1">
            Track your spending against your budget
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={goToPrevMonth} className="border-slate-700 hover:bg-slate-800">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="min-w-[180px] border-slate-700 text-slate-300 hover:bg-slate-800">
                <Calendar className="w-4 h-4 mr-2" />
                {monthYear}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <MonthPicker
                selected={currentDate}
                onSelect={handleMonthSelect}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={goToNextMonth} className="border-slate-700 hover:bg-slate-800">
            <ChevronRight className="w-4 h-4" />
          </Button>
          
          {/* Quick-fill buttons */}
          <div className="ml-4 flex items-center gap-2 border-l border-slate-700 pl-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCopyConfirm(true)}
              className="gap-1.5"
              disabled={isApplyingTemplate}
            >
              <Copy className="w-3.5 h-3.5" />
              Copy from Last Month
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAverageConfirm(true)}
              className="gap-1.5"
              disabled={isApplyingTemplate}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Use 12-Month Average
            </Button>
            
            {templates.length > 0 && (
              <Select
                value=""
                onValueChange={handleApplyTemplate}
                disabled={isApplyingTemplate}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Apply template..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Save className="w-3.5 h-3.5" />
                  Save as Template
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save Budget as Template</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="template-name">Template Name</Label>
                    <Input
                      id="template-name"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="e.g., Monthly Budget 2024"
                      className="mt-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveAsTemplate();
                        }
                      }}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setTemplateDialogOpen(false);
                        setTemplateName('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSaveAsTemplate}
                      disabled={!templateName.trim() || isSavingTemplate}
                    >
                      {isSavingTemplate ? 'Saving...' : 'Save Template'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Budget overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Income tile */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-pink-500/10">
                <TrendingUp className="w-4 h-4 text-pink-400" />
              </div>
              <p className="text-sm text-slate-400">Income</p>
            </div>
            <p className="text-2xl font-bold mt-1 tabular-nums text-pink-400">
              {isLoading ? '—' : formatCurrency(budgetData?.totalIncome || 0)}
            </p>
          </CardContent>
        </Card>
        {/* Budgeted tile */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Wallet className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-sm text-slate-400">Budgeted</p>
            </div>
            <p className="text-2xl font-bold mt-1 tabular-nums text-white">
              {isLoading ? '—' : formatCurrency(budgetData?.totalBudgeted || 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-red-500/10">
                <TrendingDown className="w-4 h-4 text-red-400" />
              </div>
              <p className="text-sm text-slate-400">Spent</p>
            </div>
            <p className="text-2xl font-bold mt-1 tabular-nums text-white">
              {isLoading ? '—' : formatCurrency(budgetData?.totalSpent || 0)}
            </p>
            {!isLoading && budgetData?.totalBudgeted !== undefined && budgetData.totalBudgeted > 0 && (
              <div className="mt-3">
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div 
                    className={cn(
                      'h-full rounded-full transition-all duration-500',
                      spentPercentage > 100 ? 'bg-red-500' :
                      spentPercentage > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                    )}
                    style={{ width: `${Math.min(100, spentPercentage)}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {spentPercentage.toFixed(0)}% of budget
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn(
                "p-2 rounded-lg",
                remaining >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'
              )}>
                <TrendingUp className={cn(
                  "w-4 h-4",
                  remaining >= 0 ? 'text-emerald-400' : 'text-red-400'
                )} />
              </div>
              <p className="text-sm text-slate-400">Remaining</p>
            </div>
            <p className={cn(
              "text-2xl font-bold mt-1 tabular-nums",
              remaining >= 0 ? 'text-emerald-400' : 'text-red-400'
            )}>
              {isLoading ? '—' : formatCurrency(remaining)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget categories */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg text-slate-100">Budget by Category</CardTitle>
          <div className="flex items-center gap-2">
            {selectedCategoryName && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearCategoryFilter}
                className="gap-1.5 border-cyan-500/50 text-cyan-400 hover:bg-cyan-500/10"
              >
                <X className="w-3 h-3" />
                Clear filter: {selectedCategoryName}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-16 text-slate-500">
              <div className="w-8 h-8 mx-auto mb-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <p>Loading budget data...</p>
            </div>
          ) : allCategories.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                <Calendar className="w-8 h-8 text-slate-500" />
              </div>
              <p className="font-medium text-slate-400">No categories found</p>
              <p className="text-sm mt-1">Create categories in Settings to start budgeting</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Income categories (read-only, collapsible) */}
              {incomeCategories.length > 0 && (
                <div>
                  <button
                    onClick={() => toggleSection('income')}
                    className="w-full flex items-center justify-between mb-3 pb-2 border-b border-pink-500/30 hover:bg-pink-500/5 -mx-2 px-2 rounded transition-colors"
                    aria-label={collapsedSections.has('income') ? 'Expand income section' : 'Collapse income section'}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown className={cn(
                        'w-4 h-4 text-pink-400 transition-transform',
                        collapsedSections.has('income') && '-rotate-90'
                      )} />
                      <h3 className="text-sm font-semibold text-pink-400 uppercase tracking-wider">
                        Income
                      </h3>
                    </div>
                    <span className="text-sm text-pink-400 font-mono">
                      {formatCurrency(budgetData?.totalIncome || incomeCategories.reduce((sum, c) => sum + c.actual_amount, 0))}
                    </span>
                  </button>
                  {!collapsedSections.has('income') && (
                    <div className="space-y-2">
                      {incomeCategories.map((category) => {
                        const isSelected = selectedCategoryId === category.sub_category_id;

                        return (
                          <Tooltip key={category.sub_category_id}>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleCategoryClick(category.sub_category_id, category.sub_category_name)}
                                className={cn(
                                  'w-full p-3 rounded-lg transition-all text-left',
                                  'bg-pink-500/5 border',
                                  isSelected
                                    ? 'bg-pink-500/10 border-pink-500/30 ring-1 ring-pink-500/20'
                                    : 'border-pink-500/10 hover:border-pink-500/20'
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={cn(
                                    'font-medium',
                                    isSelected ? 'text-pink-300' : 'text-slate-200'
                                  )}>
                                    {category.sub_category_name}
                                  </span>
                                  <span className="font-mono text-pink-400">
                                    {formatCurrency(category.actual_amount)}
                                  </span>
                                </div>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              Click to filter transactions
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              
              {/* Transfer categories (read-only, collapsible) */}
              {transferCategories.length > 0 && (
                <div>
                  <button
                    onClick={() => toggleSection('transfer')}
                    className="w-full flex items-center justify-between mb-3 pb-2 border-b border-stone-500/30 hover:bg-stone-500/5 -mx-2 px-2 rounded transition-colors"
                    aria-label={collapsedSections.has('transfer') ? 'Expand transfers section' : 'Collapse transfers section'}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown className={cn(
                        'w-4 h-4 text-stone-400 transition-transform',
                        collapsedSections.has('transfer') && '-rotate-90'
                      )} />
                      <h3 className="text-sm font-semibold text-stone-400 uppercase tracking-wider">
                        Transfers
                      </h3>
                    </div>
                    <span className="text-sm text-stone-400 font-mono">
                      {formatCurrency(totalTransfers)}
                    </span>
                  </button>
                  {!collapsedSections.has('transfer') && (
                    <div className="space-y-2">
                      {transferCategories.map((category) => {
                        const isSelected = selectedCategoryId === category.sub_category_id;

                        return (
                          <Tooltip key={category.sub_category_id}>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => handleCategoryClick(category.sub_category_id, category.sub_category_name)}
                                className={cn(
                                  'w-full p-3 rounded-lg transition-all text-left',
                                  'bg-stone-500/5 border',
                                  isSelected
                                    ? 'bg-stone-500/10 border-stone-500/30 ring-1 ring-stone-500/20'
                                    : 'border-stone-500/10 hover:border-stone-500/20'
                                )}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={cn(
                                    'font-medium',
                                    isSelected ? 'text-stone-300' : 'text-slate-200'
                                  )}>
                                    {category.sub_category_name}
                                  </span>
                                  <span className="font-mono text-stone-400">
                                    {formatCurrency(category.actual_amount)}
                                  </span>
                                </div>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              Click to filter transactions
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
              
              {/* Expense/other categories (budgetable) */}
              {groupedCategories.map((group) => (
                <div key={group.upperCategoryName}>
                  {/* Upper category header */}
                  <button
                    onClick={() => toggleSection(`expense-${group.upperCategoryName}`)}
                    className="w-full flex items-center justify-between mb-3 pb-2 border-b border-slate-800 hover:bg-slate-800/30 -mx-2 px-2 rounded transition-colors"
                    aria-label={collapsedSections.has(`expense-${group.upperCategoryName}`) ? `Expand ${group.upperCategoryName} section` : `Collapse ${group.upperCategoryName} section`}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown className={cn(
                        'w-4 h-4 text-slate-400 transition-transform',
                        collapsedSections.has(`expense-${group.upperCategoryName}`) && '-rotate-90'
                      )} />
                      <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                        {group.upperCategoryName}
                      </h3>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-slate-400">
                        Spent: <span className="font-mono text-slate-200">{formatCurrency(group.totalSpent)}</span>
                      </span>
                      <span className="text-slate-400">
                        of <span className="font-mono text-slate-200">{formatCurrency(group.totalBudgeted)}</span>
                      </span>
                    </div>
                  </button>

                  {/* Sub-category rows */}
                  {!collapsedSections.has(`expense-${group.upperCategoryName}`) && (
                  <div className="space-y-2">
                    {group.categories.map((category) => {
                      const hasBudget = category.budget_amount !== null && category.budget_amount > 0;
                      const percentage = hasBudget 
                        ? (category.actual_amount / category.budget_amount!) * 100 
                        : 0;
                      const isOverBudget = hasBudget && percentage > 100;
                      const isSelected = selectedCategoryId === category.sub_category_id;
                      const isEditing = editingBudgetId !== null && editingBudgetId === category.budget_id;
                      const isCreating = creatingBudgetForCategory === category.sub_category_id;
                      
                      // Editing mode
                      if (isEditing || isCreating) {
                        return (
                          <div
                            key={category.sub_category_id}
                            className="w-full p-3 rounded-lg bg-slate-800/50 border border-cyan-500/30"
                          >
                            <div className="mb-2">
                              <span className="font-medium text-slate-200">
                                {category.sub_category_name}
                              </span>
                            </div>
                            <InlineBudgetEditor
                              budgetId={category.budget_id}
                              subCategoryId={category.sub_category_id}
                              subCategoryName={category.sub_category_name}
                              currentAmount={category.budget_amount}
                              year={year}
                              month={month}
                              onSave={(amount) => handleSaveBudget(category.sub_category_id, amount)}
                              onCancel={handleCancelEdit}
                              average3mo={category.average_3mo}
                              average6mo={category.average_6mo}
                              carryOver={category.carry_over}
                            />
                          </div>
                        );
                      }
                      
                      // Category with budget - show comparison display
                      if (hasBudget) {
                        return (
                          <div
                            key={category.sub_category_id}
                            className={cn(
                              'w-full p-3 rounded-lg transition-all',
                              'bg-slate-800/30 border',
                              isSelected
                                ? 'bg-cyan-500/10 border-cyan-500/30 ring-1 ring-cyan-500/20'
                                : 'border-transparent hover:border-slate-700'
                            )}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => handleCategoryClick(category.sub_category_id, category.sub_category_name)}
                                    className="flex-1 text-left"
                                  >
                                    <span className={cn(
                                      'font-medium',
                                      isSelected ? 'text-cyan-300' : 'text-slate-200'
                                    )}>
                                      {category.sub_category_name}
                                    </span>
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <div className="text-center">
                                    <div>Click to filter transactions</div>
                                    {(category.average_3mo > 0 || category.average_6mo > 0) && (
                                      <div className="mt-1 text-slate-400">
                                        {category.average_3mo > 0 && `3mo avg: ${formatCurrency(category.average_3mo)}`}
                                        {category.average_3mo > 0 && category.average_6mo > 0 && ' • '}
                                        {category.average_6mo > 0 && `6mo avg: ${formatCurrency(category.average_6mo)}`}
                                      </div>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-3 text-sm">
                                  <span className={cn(
                                    'font-mono',
                                    isOverBudget ? 'text-red-400' : 'text-slate-300'
                                  )}>
                                    {formatCurrency(category.actual_amount)}
                                  </span>
                                  <span className="text-slate-500">/</span>
                                  <span className="font-mono text-slate-400">
                                    {formatCurrency(category.budget_amount!)}
                                  </span>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (category.budget_id) {
                                      handleEditBudget(category.budget_id);
                                    } else {
                                      handleCreateBudget(category.sub_category_id);
                                    }
                                  }}
                                  className="h-7 w-7 p-0"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className={cn(
                                  'h-full rounded-full transition-all duration-300',
                                  isOverBudget ? 'bg-red-500' :
                                  percentage > 80 ? 'bg-amber-500' : 
                                  isSelected ? 'bg-cyan-400' : 'bg-cyan-500'
                                )}
                                style={{ width: `${Math.min(100, percentage)}%` }}
                              />
                            </div>
                            <div className="flex items-center justify-between mt-1">
                              <span className="text-xs text-slate-500">
                                {percentage.toFixed(0)}% used
                              </span>
                              {isOverBudget && (
                                <span className="text-xs text-red-400">
                                  Over by {formatCurrency(category.actual_amount - category.budget_amount!)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      }
                      
                      // Category without budget - show add budget option
                      return (
                        <div
                          key={category.sub_category_id}
                          className={cn(
                            'w-full p-3 rounded-lg transition-all',
                            'bg-slate-800/20 border',
                            isSelected
                              ? 'bg-cyan-500/10 border-cyan-500/30 ring-1 ring-cyan-500/20'
                              : 'border-slate-700/30 hover:border-slate-600'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => handleCategoryClick(category.sub_category_id, category.sub_category_name)}
                                  className="flex-1 text-left"
                                >
                                  <span className={cn(
                                    'font-medium',
                                    isSelected ? 'text-cyan-300' : 'text-slate-300'
                                  )}>
                                    {category.sub_category_name}
                                  </span>
                                  {category.actual_amount > 0 && (
                                    <span className="ml-2 text-sm text-slate-500">
                                      ({formatCurrency(category.actual_amount)} spent)
                                    </span>
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <div className="text-center">
                                  <div>Click to filter transactions</div>
                                  {(category.average_3mo > 0 || category.average_6mo > 0) && (
                                    <div className="mt-1 text-slate-400">
                                      {category.average_3mo > 0 && `3mo avg: ${formatCurrency(category.average_3mo)}`}
                                      {category.average_3mo > 0 && category.average_6mo > 0 && ' • '}
                                      {category.average_6mo > 0 && `6mo avg: ${formatCurrency(category.average_6mo)}`}
                                    </div>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateBudget(category.sub_category_id);
                              }}
                              className="gap-1.5 text-xs"
                            >
                              <Plus className="w-3 h-3" />
                              Set Budget
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transactions for this month */}
      <div ref={transactionsRef}>
        <MonthlyTransactionList
          year={year}
          month={month}
          categoryFilter={selectedCategoryId}
          onClearCategoryFilter={clearCategoryFilter}
          onCategoryChange={handleCategoryChange}
        />
      </div>

      {/* Copy from Last Month Confirmation */}
      <AlertDialog open={showCopyConfirm} onOpenChange={setShowCopyConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy from Last Month</AlertDialogTitle>
            <AlertDialogDescription>
              This will copy all budget amounts from {month === 1 ? 'December' : new Date(year, month - 2).toLocaleString('default', { month: 'long' })} {month === 1 ? year - 1 : year} to {new Date(year, month - 1).toLocaleString('default', { month: 'long' })} {year}.
              Existing budgets will be overwritten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCopyFromPreviousMonth}>
              Copy Budgets
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Use 12-Month Average Confirmation */}
      <AlertDialog open={showAverageConfirm} onOpenChange={setShowAverageConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use 12-Month Average</AlertDialogTitle>
            <AlertDialogDescription>
              This will update all budget amounts based on your average spending over the past 12 months.
              Existing budgets will be overwritten with the calculated averages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUse12MonthAverage}>
              Apply Averages
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Wrapper component that provides CategoryContext
export function MonthlyBudgetPage() {
  return (
    <CategoryProvider>
      <MonthlyBudgetContent />
    </CategoryProvider>
  );
}
