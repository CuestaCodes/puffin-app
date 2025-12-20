'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronLeft, ChevronRight, Calendar, X, TrendingDown, TrendingUp, Wallet, Edit2, Plus, Save, Copy, FileText } from 'lucide-react';
import { CategoryProvider, MonthlyTransactionList } from '@/components/transactions';
import { InlineBudgetEditor } from '@/components/budgets/inline-budget-editor';
import { cn } from '@/lib/utils';
import type { BudgetWithCategory, BudgetTemplate } from '@/types/database';

interface BudgetSummaryResponse {
  budgets: Array<BudgetWithCategory & { actual_amount: number }>;
  totalBudgeted: number;
  totalSpent: number;
  year: number;
  month: number;
}

// Group budgets by upper category
interface BudgetGroup {
  upperCategoryId: string;
  upperCategoryName: string;
  upperCategoryType: string;
  budgets: Array<BudgetWithCategory & { actual_amount: number }>;
  totalBudgeted: number;
  totalSpent: number;
}

interface CategoryHints {
  average3mo: number;
  average6mo: number;
  carryOver: number;
}

function MonthlyBudgetContent() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [budgetData, setBudgetData] = useState<BudgetSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [creatingBudgetForCategory, setCreatingBudgetForCategory] = useState<string | null>(null);
  const [categoryHints, setCategoryHints] = useState<Record<string, CategoryHints>>({});
  const [allCategories, setAllCategories] = useState<Array<{
    sub_category_id: string;
    sub_category_name: string;
    upper_category_name: string;
    upper_category_type: string;
    current_budget: number | null;
    average_3mo: number;
    average_6mo: number;
    carry_over: number;
  }>>([]);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isApplyingTemplate, setIsApplyingTemplate] = useState(false);
  
  // Ref for smooth scrolling to transactions
  const transactionsRef = useRef<HTMLDivElement>(null);
  
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1; // 1-12

  const monthYear = currentDate.toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  const goToPrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setSelectedCategoryId(null);
    setSelectedCategoryName(null);
  };

  const goToNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setSelectedCategoryId(null);
    setSelectedCategoryName(null);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
    setSelectedCategoryId(null);
    setSelectedCategoryName(null);
  };

  const fetchBudgetSummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        year: year.toString(),
        month: month.toString(),
        summary: 'true',
      });
      
      const response = await fetch(`/api/budgets?${params}`);
      if (response.ok) {
        const data: BudgetSummaryResponse = await response.json();
        setBudgetData(data);
        
        // Fetch hints for all categories
        const hints: Record<string, CategoryHints> = {};
        for (const budget of data.budgets) {
          try {
            const [avg3Res, avg6Res, carryOverRes] = await Promise.all([
              fetch(`/api/budgets?categoryId=${budget.sub_category_id}&averageMonths=3`),
              fetch(`/api/budgets?categoryId=${budget.sub_category_id}&averageMonths=6`),
              fetch(`/api/budgets?categoryId=${budget.sub_category_id}&carryOver=true&year=${year}&month=${month}`),
            ]);
            
            const avg3 = avg3Res.ok ? (await avg3Res.json()).average : 0;
            const avg6 = avg6Res.ok ? (await avg6Res.json()).average : 0;
            const carryOver = carryOverRes.ok ? (await carryOverRes.json()).carryOver : 0;
            
            hints[budget.sub_category_id] = { average3mo: avg3, average6mo: avg6, carryOver };
          } catch (err) {
            console.error('Failed to fetch hints for category:', budget.sub_category_id, err);
          }
        }
        setCategoryHints(hints);
      }
    } catch (error) {
      console.error('Failed to fetch budget summary:', error);
    } finally {
      setIsLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchBudgetSummary();
  }, [fetchBudgetSummary]);

  const fetchAllCategories = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        year: year.toString(),
        month: month.toString(),
        forEntry: 'true',
      });
      
      const response = await fetch(`/api/budgets?${params}`);
      if (response.ok) {
        const data = await response.json();
        setAllCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, [year, month]);

  useEffect(() => {
    if (showAllCategories) {
      fetchAllCategories();
    }
  }, [showAllCategories, fetchAllCategories]);

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch('/api/budgets/templates');
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
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
      const response = await fetch('/api/budgets/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName.trim(),
          year,
          month,
        }),
      });
      
      if (response.ok) {
        setTemplateDialogOpen(false);
        setTemplateName('');
        await fetchTemplates();
        alert('Template saved successfully!');
      } else {
        const error = await response.json();
        alert('Failed to save template: ' + (error.error || 'Unknown error'));
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
      const response = await fetch('/api/budgets/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'apply',
          templateId,
          year,
          month,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        await fetchBudgetSummary();
        alert(`Template applied to ${data.appliedCount} categories`);
      } else {
        const error = await response.json();
        alert('Failed to apply template: ' + (error.error || 'Unknown error'));
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
    
    if (!confirm(`Copy budgets from ${prevMonth}/${prevYear} to ${month}/${year}?`)) {
      return;
    }
    
    try {
      const response = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'copy',
          fromYear: prevYear,
          fromMonth: prevMonth,
          toYear: year,
          toMonth: month,
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        await fetchBudgetSummary();
        alert(`Copied ${data.copiedCount} budgets from previous month`);
      } else {
        const error = await response.json();
        alert('Failed to copy budgets: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error copying budgets:', error);
      alert('Failed to copy budgets');
    }
  };

  // Group budgets by upper category
  const groupedBudgets: BudgetGroup[] = budgetData?.budgets ? 
    Object.values(
      budgetData.budgets.reduce((acc, budget) => {
        const key = budget.upper_category_name;
        if (!acc[key]) {
          acc[key] = {
            upperCategoryId: key, // Using name as key since we don't have the actual ID
            upperCategoryName: budget.upper_category_name,
            upperCategoryType: budget.upper_category_type,
            budgets: [],
            totalBudgeted: 0,
            totalSpent: 0,
          };
        }
        acc[key].budgets.push(budget);
        acc[key].totalBudgeted += budget.amount;
        acc[key].totalSpent += budget.actual_amount;
        return acc;
      }, {} as Record<string, BudgetGroup>)
    ) : [];

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

  const clearCategoryFilter = () => {
    setSelectedCategoryId(null);
    setSelectedCategoryName(null);
  };

  // Handle budget refresh when transactions change
  const handleCategoryChange = () => {
    fetchBudgetSummary();
  };

  const handleSaveBudget = async (subCategoryId: string, amount: number) => {
    try {
      const response = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sub_category_id: subCategoryId,
          year,
          month,
          amount,
        }),
      });
      
      if (response.ok) {
        setEditingBudgetId(null);
        setCreatingBudgetForCategory(null);
        await fetchBudgetSummary();
      } else {
        const error = await response.json();
        console.error('Failed to save budget:', error);
        alert('Failed to save budget: ' + (error.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving budget:', error);
      alert('Failed to save budget');
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
    <div className="space-y-6">
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
          <Button variant="outline" onClick={goToToday} className="min-w-[180px] border-slate-700 text-slate-300 hover:bg-slate-800">
            <Calendar className="w-4 h-4 mr-2" />
            {monthYear}
          </Button>
          <Button variant="outline" size="icon" onClick={goToNextMonth} className="border-slate-700 hover:bg-slate-800">
            <ChevronRight className="w-4 h-4" />
          </Button>
          
          {/* Quick-fill buttons */}
          <div className="ml-4 flex items-center gap-2 border-l border-slate-700 pl-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyFromPreviousMonth}
              className="gap-1.5"
              disabled={isApplyingTemplate}
            >
              <Copy className="w-3.5 h-3.5" />
              Copy from Last Month
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      spentPercentage > 80 ? 'bg-amber-500' : 'bg-cyan-500'
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowAllCategories(!showAllCategories);
                if (!showAllCategories) {
                  fetchAllCategories();
                }
              }}
              className="gap-1.5"
            >
              <Plus className="w-3 h-3" />
              {showAllCategories ? 'Hide' : 'Add'} Categories
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-16 text-slate-500">
              <div className="w-8 h-8 mx-auto mb-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
              <p>Loading budget data...</p>
            </div>
          ) : groupedBudgets.length === 0 ? (
            <div className="text-center py-16 text-slate-500">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
                <Calendar className="w-8 h-8 text-slate-500" />
              </div>
              <p className="font-medium text-slate-400">No budgets set</p>
              <p className="text-sm mt-1">Create categories and set budgets in Settings</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Show categories without budgets if enabled */}
              {showAllCategories && allCategories.length > 0 && (
                <div className="mb-6 pb-6 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
                    Categories Without Budgets
                  </h3>
                  <div className="space-y-2">
                    {allCategories
                      .filter(cat => !budgetData?.budgets.some(b => b.sub_category_id === cat.sub_category_id))
                      .map((category) => {
                        const isCreating = creatingBudgetForCategory === category.sub_category_id;
                        
                        if (isCreating) {
                          return (
                            <div
                              key={category.sub_category_id}
                              className="w-full p-3 rounded-lg bg-slate-800/50 border border-cyan-500/30"
                            >
                              <div className="mb-2">
                                <span className="font-medium text-slate-200">
                                  {category.sub_category_name}
                                </span>
                                <span className="text-xs text-slate-500 ml-2">
                                  ({category.upper_category_name})
                                </span>
                              </div>
                              <InlineBudgetEditor
                                budgetId={null}
                                subCategoryId={category.sub_category_id}
                                subCategoryName={category.sub_category_name}
                                currentAmount={null}
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
                        
                        return (
                          <div
                            key={category.sub_category_id}
                            className="w-full p-3 rounded-lg bg-slate-800/20 border border-slate-700/50 hover:border-slate-600 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="font-medium text-slate-300">
                                  {category.sub_category_name}
                                </span>
                                <span className="text-xs text-slate-500 ml-2">
                                  ({category.upper_category_name})
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleCreateBudget(category.sub_category_id)}
                                className="gap-1.5"
                              >
                                <Plus className="w-3 h-3" />
                                Add Budget
                              </Button>
                            </div>
                            {(category.average_3mo > 0 || category.average_6mo > 0 || category.carry_over > 0) && (
                              <div className="mt-2 text-xs text-slate-500">
                                {category.carry_over > 0 && (
                                  <span>Carry-over: {formatCurrency(category.carry_over)} • </span>
                                )}
                                {category.average_3mo > 0 && (
                                  <span>3mo avg: {formatCurrency(category.average_3mo)}</span>
                                )}
                                {category.average_6mo > 0 && category.average_3mo > 0 && (
                                  <span> • 6mo avg: {formatCurrency(category.average_6mo)}</span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              
              {groupedBudgets.map((group) => (
                <div key={group.upperCategoryName}>
                  {/* Upper category header */}
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                      {group.upperCategoryName}
                    </h3>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-slate-400">
                        Spent: <span className="font-mono text-slate-200">{formatCurrency(group.totalSpent)}</span>
                      </span>
                      <span className="text-slate-400">
                        of <span className="font-mono text-slate-200">{formatCurrency(group.totalBudgeted)}</span>
                      </span>
                    </div>
                  </div>
                  
                  {/* Sub-category rows */}
                  <div className="space-y-2">
                    {group.budgets.map((budget) => {
                      const percentage = budget.amount > 0 
                        ? (budget.actual_amount / budget.amount) * 100 
                        : 0;
                      const isOverBudget = percentage > 100;
                      const isSelected = selectedCategoryId === budget.sub_category_id;
                      const isEditing = editingBudgetId === budget.id;
                      const hints = categoryHints[budget.sub_category_id] || { average3mo: 0, average6mo: 0, carryOver: 0 };
                      
                      if (isEditing) {
                        return (
                          <div
                            key={budget.id}
                            className="w-full p-3 rounded-lg bg-slate-800/50 border border-cyan-500/30"
                          >
                            <div className="mb-2">
                              <span className="font-medium text-slate-200">
                                {budget.sub_category_name}
                              </span>
                            </div>
                            <InlineBudgetEditor
                              budgetId={budget.id}
                              subCategoryId={budget.sub_category_id}
                              subCategoryName={budget.sub_category_name}
                              currentAmount={budget.amount}
                              year={year}
                              month={month}
                              onSave={(amount) => handleSaveBudget(budget.sub_category_id, amount)}
                              onCancel={handleCancelEdit}
                              average3mo={hints.average3mo}
                              average6mo={hints.average6mo}
                              carryOver={hints.carryOver}
                            />
                          </div>
                        );
                      }
                      
                      return (
                        <div
                          key={budget.id}
                          className={cn(
                            'w-full p-3 rounded-lg transition-all',
                            'bg-slate-800/30 border',
                            isSelected 
                              ? 'bg-cyan-500/10 border-cyan-500/30 ring-1 ring-cyan-500/20' 
                              : 'border-transparent hover:border-slate-700'
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <button
                              onClick={() => handleCategoryClick(budget.sub_category_id, budget.sub_category_name)}
                              className="flex-1 text-left"
                            >
                              <span className={cn(
                                'font-medium',
                                isSelected ? 'text-cyan-300' : 'text-slate-200'
                              )}>
                                {budget.sub_category_name}
                              </span>
                            </button>
                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-3 text-sm">
                                <span className={cn(
                                  'font-mono',
                                  isOverBudget ? 'text-red-400' : 'text-slate-300'
                                )}>
                                  {formatCurrency(budget.actual_amount)}
                                </span>
                                <span className="text-slate-500">/</span>
                                <span className="font-mono text-slate-400">
                                  {formatCurrency(budget.amount)}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditBudget(budget.id);
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
                                Over by {formatCurrency(budget.actual_amount - budget.amount)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
