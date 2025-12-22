'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Wallet, PiggyBank, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
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
  ComposedChart,
  Area,
} from 'recharts';
import type { TransactionWithCategory } from '@/types/database';

interface DashboardSummary {
  totalIncome: number;
  totalSpend: number;
  netBalance: number;
  totalSavings: number;
  savingsRate: number;
  incomeChange: number;
  spendChange: number;
  netChange: number;
  savingsChange: number;
}

interface MonthlyTrend {
  month: string;
  monthLabel: string;
  income: number;
  expenses: number;
  savings: number;
  bills: number;
  debt: number;
  net: number;
}

interface UpperCategoryBreakdown {
  type: string;
  label: string;
  amount: number;
  percentage: number;
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
  upperCategoryBreakdown: UpperCategoryBreakdown[];
  expenseBreakdown: CategoryBreakdown[];
  recentTransactions: TransactionWithCategory[];
}

// Extended color palette for category breakdown (20 distinct colors)
const CHART_COLORS = [
  '#06b6d4', // cyan-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#ef4444', // red-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#f97316', // orange-500
  '#84cc16', // lime-500
  '#a855f7', // purple-500
  '#22d3ee', // cyan-400
  '#fbbf24', // amber-400
  '#34d399', // emerald-400
  '#fb7185', // rose-400
  '#818cf8', // indigo-400
  '#2dd4bf', // teal-400
  '#facc15', // yellow-400
  '#a78bfa', // violet-400
  '#4ade80', // green-400
];

// Colors for upper category types - ensure distinct colors
const UPPER_CATEGORY_COLORS: Record<string, string> = {
  expense: '#ef4444', // red
  bill: '#f59e0b',    // amber/orange
  debt: '#a855f7',    // purple (distinct from red)
  saving: '#06b6d4',  // cyan
};

// Format Y axis with decimal values for smaller scales
const formatYAxis = (value: number): string => {
  if (value === 0) return '$0';
  if (value >= 1000) {
    const k = value / 1000;
    return k % 1 === 0 ? `$${k}k` : `$${k.toFixed(1)}k`;
  }
  return `$${value}`;
};

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());

  const fetchDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      console.log('Dashboard: Fetching data for year', year);
      const response = await fetch(`/api/analytics/dashboard?year=${year}`);
      if (response.ok) {
        const result = await response.json();
        console.log('Dashboard: Received data:', {
          hasSummary: !!result.summary,
          trendsCount: result.trends?.length,
          upperBreakdownCount: result.upperCategoryBreakdown?.length,
          expenseBreakdownCount: result.expenseBreakdown?.length,
          upperBreakdown: result.upperCategoryBreakdown,
          expenseBreakdown: result.expenseBreakdown?.slice(0, 3),
        });
        setData(result);
      } else {
        console.error('Dashboard: API error', response.status, response.statusText);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [year]);

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
    totalSpend: 0,
    netBalance: 0,
    totalSavings: 0,
    savingsRate: 0,
    incomeChange: 0,
    spendChange: 0,
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
        {/* Year selector */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setYear(year - 1)}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 h-8 w-8"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-lg font-semibold text-white min-w-[60px] text-center">
            {year}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setYear(year + 1)}
            disabled={year >= new Date().getFullYear()}
            className="border-slate-700 text-slate-300 hover:bg-slate-800 h-8 w-8 disabled:opacity-50"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
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
          title="Total Spent"
          value={formatCurrency(summary.totalSpend)}
          change={formatChange(summary.spendChange)}
          trend={summary.spendChange <= 0 ? 'up' : 'down'}
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
          badge={`${summary.savingsRate}% of income`}
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
                    tickFormatter={formatYAxis}
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
                    dataKey="expenses"
                    name="Expenses"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ fill: '#ef4444', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="bills"
                    name="Bills"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ fill: '#f59e0b', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="debt"
                    name="Debt"
                    stroke="#a855f7"
                    strokeWidth={2}
                    dot={{ fill: '#a855f7', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="savings"
                    name="Savings"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    dot={{ fill: '#06b6d4', strokeWidth: 2 }}
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

        {/* Income & Spend Chart */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Income & Spend</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.trends && data.trends.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={data.trends.map(t => ({
                  ...t,
                  // Total Spend includes expenses, bills, debt, AND savings
                  totalSpend: t.expenses + t.bills + t.debt + t.savings
                }))}>
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
                    tickFormatter={formatYAxis}
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
                  <Area
                    type="monotone"
                    dataKey="totalSpend"
                    name="Total Spend"
                    fill="#ef4444"
                    fillOpacity={0.2}
                    stroke="#ef4444"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <Line
                    type="monotone"
                    dataKey="income"
                    name="Income"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: '#10b981', strokeWidth: 2 }}
                  />
                  <Legend />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-500 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <p>Import transactions to see income trends</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pie Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Spending by Type Pie Chart */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Spending by Type</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.upperCategoryBreakdown && data.upperCategoryBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.upperCategoryBreakdown}
                    dataKey="amount"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={2}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={{ stroke: '#64748b', strokeWidth: 1 }}
                  >
                    {data.upperCategoryBreakdown.map((item) => (
                      <Cell
                        key={`type-${item.type}`}
                        fill={UPPER_CATEGORY_COLORS[item.type] || '#64748b'}
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
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-500 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <p>No spending data for this period</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Spending by Category Pie Chart */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.expenseBreakdown && data.expenseBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.expenseBreakdown.slice(0, 12)}
                    dataKey="amount"
                    nameKey="categoryName"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={1}
                    label={({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''}
                    labelLine={{ stroke: '#64748b', strokeWidth: 1 }}
                  >
                    {data.expenseBreakdown.slice(0, 12).map((item, index) => (
                      <Cell
                        key={`cat-${item.categoryId}`}
                        fill={CHART_COLORS[index]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1e293b',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number, _name: string, props: { payload: CategoryBreakdown }) => [
                      formatCurrency(value),
                      props.payload.categoryName
                    ]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => <span className="text-slate-300 text-xs">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-500 bg-slate-800/50 rounded-lg border border-slate-700/50">
                <p>No category data for this period</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
  badge?: string; // Optional prominent badge (e.g., savings rate)
}

function SummaryCard({ title, value, change, trend, icon: Icon, iconColor, bgColor, badge }: SummaryCardProps) {
  return (
    <Card className="border-slate-800 bg-slate-900/50">
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-slate-400">{title}</p>
              {badge && (
                <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-2xl font-bold mt-1 tabular-nums text-white">{value}</p>
            <p className={`text-xs mt-1 ${trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
              {change} from last year
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
