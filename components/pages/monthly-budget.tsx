'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar, X, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { CategoryProvider, MonthlyTransactionList } from '@/components/transactions';
import { cn } from '@/lib/utils';
import type { BudgetWithCategory } from '@/types/database';

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

function MonthlyBudgetContent() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [budgetData, setBudgetData] = useState<BudgetSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedCategoryName, setSelectedCategoryName] = useState<string | null>(null);
  
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
                      
                      return (
                        <button
                          key={budget.id}
                          onClick={() => handleCategoryClick(budget.sub_category_id, budget.sub_category_name)}
                          className={cn(
                            'w-full p-3 rounded-lg transition-all text-left',
                            'hover:bg-slate-800/70 cursor-pointer',
                            isSelected 
                              ? 'bg-cyan-500/10 border border-cyan-500/30 ring-1 ring-cyan-500/20' 
                              : 'bg-slate-800/30 border border-transparent'
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className={cn(
                              'font-medium',
                              isSelected ? 'text-cyan-300' : 'text-slate-200'
                            )}>
                              {budget.sub_category_name}
                            </span>
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
                        </button>
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
