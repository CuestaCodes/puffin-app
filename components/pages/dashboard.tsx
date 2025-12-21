'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Loader2 } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import type { TransactionWithCategory } from '@/types/database';

interface DashboardSummary {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  totalSavings: number;
  incomeChange: number;
  expenseChange: number;
  netChange: number;
  savingsChange: number;
}

interface MonthlyTrend {
  month: string;
  monthLabel: string;
  income: number;
  expenses: number;
  savings: number;
  net: number;
}

interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  upperCategoryName: string;
  upperCategoryType: string;
  amount: number;
  percentage: number;
}

interface DashboardData {
  summary: DashboardSummary;
  trends: MonthlyTrend[];
  expenseBreakdown: CategoryBreakdown[];
  incomeBreakdown: CategoryBreakdown[];
  recentTransactions: TransactionWithCategory[];
}

const CHART_COLORS = [
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6', // teal
];

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [months, setMonths] = useState(6);

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/analytics/dashboard?months=${months}`);
      if (response.ok) {
        const result = await response.json();
        setData(result);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [months]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatChange = (change: number) => {
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change}%`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const summary = data?.summary || {
    totalIncome: 0,
    totalExpenses: 0,
    netBalance: 0,
    totalSavings: 0,
    incomeChange: 0,
    expenseChange: 0,
    netChange: 0,
    savingsChange: 0,
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 mt-1">
            Overview of your financial health
          </p>
        </div>
        {/* Period selector */}
        <div className="flex gap-2">
          {[3, 6, 12].map((m) => (
            <Button
              key={m}
              variant={months === m ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMonths(m)}
              className={
                months === m
                  ? 'bg-cyan-600 hover:bg-cyan-500'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }
            >
              {m}M
            </Button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Income"
          value={formatCurrency(summary.totalIncome)}
          change={formatChange(summary.incomeChange)}
          trend={summary.incomeChange >= 0 ? 'up' : 'down'}
          icon={TrendingUp}
          iconColor="text-emerald-400"
          bgColor="bg-emerald-950/30 border border-emerald-900/50"
        />
        <SummaryCard
          title="Total Expenses"
          value={formatCurrency(summary.totalExpenses)}
          change={formatChange(summary.expenseChange)}
          trend={summary.expenseChange <= 0 ? 'up' : 'down'}
          icon={TrendingDown}
          iconColor="text-red-400"
          bgColor="bg-red-950/30 border border-red-900/50"
        />
        <SummaryCard
          title="Net Balance"
          value={formatCurrency(summary.netBalance)}
          change={formatChange(summary.netChange)}
          trend={summary.netChange >= 0 ? 'up' : 'down'}
          icon={Wallet}
          iconColor="text-cyan-400"
          bgColor="bg-cyan-950/30 border border-cyan-900/50"
        />
        <SummaryCard
          title="Savings"
          value={formatCurrency(summary.totalSavings)}
          change={formatChange(summary.savingsChange)}
          trend={summary.savingsChange >= 0 ? 'up' : 'down'}
          icon={PiggyBank}
          iconColor="text-violet-400"
          bgColor="bg-violet-950/30 border border-violet-900/50"
        />
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending Trends Line Chart */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Spending Trends</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.trends && data.trends.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.trends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis
                    dataKey="monthLabel"
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#f1f5f9' }}
                    formatter={(value: number) => [formatCurrency(value), '']}
                  />
                  <Line
                    type="monotone"
                    dataKey="income"
                    name="Income"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: '#10b981', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="savings"
                    name="Savings"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ fill: '#8b5cf6', strokeWidth: 2 }}
                  />
                  <Legend />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-500 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <p>Import transactions to see trends</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Expense Breakdown Pie Chart */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.expenseBreakdown && data.expenseBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={data.expenseBreakdown.slice(0, 8)}
                    dataKey="amount"
                    nameKey="categoryName"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ categoryName, percentage }) =>
                      `${categoryName} (${percentage}%)`
                    }
                    labelLine={{ stroke: '#64748b' }}
                  >
                    {data.expenseBreakdown.slice(0, 8).map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [formatCurrency(value), 'Amount']}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-500 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <p>No expense data for this period</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Income Breakdown Bar Chart */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100">Income Sources</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.incomeBreakdown && data.incomeBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={data.incomeBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  type="number"
                  stroke="#64748b"
                  fontSize={12}
                  tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="categoryName"
                  stroke="#64748b"
                  fontSize={12}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [formatCurrency(value), 'Amount']}
                />
                <Bar dataKey="amount" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-slate-500 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <p>No income data for this period</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent transactions */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.recentTransactions && data.recentTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 px-3 text-xs font-medium text-slate-400">Date</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-slate-400">Description</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-slate-400">Category</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-slate-400">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.recentTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-800/50">
                      <td className="py-2 px-3 text-sm text-slate-300">
                        {new Date(tx.date).toLocaleDateString('en-AU', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </td>
                      <td className="py-2 px-3 text-sm text-slate-200 max-w-[200px] truncate">
                        {tx.description}
                      </td>
                      <td className="py-2 px-3 text-sm text-slate-400">
                        {tx.sub_category_name || 'Uncategorized'}
                      </td>
                      <td
                        className={`py-2 px-3 text-sm font-mono text-right ${
                          tx.amount < 0 ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {formatCurrency(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <p>No transactions yet</p>
              <p className="text-sm mt-1">Import a CSV file or add transactions manually</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface SummaryCardProps {
  title: string;
  value: string;
  change: string;
  trend: 'up' | 'down';
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
}

function SummaryCard({ title, value, change, trend, icon: Icon, iconColor, bgColor }: SummaryCardProps) {
  return (
    <Card className="border-slate-800 bg-slate-900/50">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-400">{title}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums text-white">{value}</p>
            <p className={`text-xs mt-1 ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
              {change} from last month
            </p>
          </div>
          <div className={`p-3 rounded-xl ${bgColor}`}>
            <Icon className={`w-6 h-6 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
