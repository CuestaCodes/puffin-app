'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

export function MonthlyBudgetPage() {
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthYear = currentDate.toLocaleDateString('en-US', { 
    month: 'long', 
    year: 'numeric' 
  });

  const goToPrevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

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
            <p className="text-sm text-slate-400">Budgeted</p>
            <p className="text-2xl font-bold mt-1 tabular-nums text-white">$0.00</p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Spent</p>
            <p className="text-2xl font-bold mt-1 tabular-nums text-white">$0.00</p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Remaining</p>
            <p className="text-2xl font-bold mt-1 tabular-nums text-emerald-400">$0.00</p>
          </CardContent>
        </Card>
      </div>

      {/* Budget categories */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100">Budget by Category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-16 text-slate-500">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <Calendar className="w-8 h-8 text-slate-500" />
            </div>
            <p className="font-medium text-slate-400">No budgets set</p>
            <p className="text-sm mt-1">Create categories and set budgets in Settings</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
