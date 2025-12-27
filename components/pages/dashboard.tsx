'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import { api } from '@/lib/services';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, PiggyBank, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
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
import { CHART_COLORS, UPPER_CATEGORY_COLORS, DONUT_CHART } from '@/lib/constants';

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
  [key: string]: string | number;
}

interface CategoryBreakdown {
  categoryId: string;
  categoryName: string;
  upperCategoryName: string;
  upperCategoryType: string;
  amount: number;
  percentage: number;
  [key: string]: string | number;
}

interface MonthlyIncomeBySubcategory {
  month: string;
  monthLabel: string;
  subcategories: Record<string, number>;
}

interface MonthlyCategoryTotal {
  upperCategory: string;
  upperCategoryType: string;
  subCategory: string;
  monthlyTotals: number[];
  yearTotal: number;
}

interface DashboardData {
  summary: DashboardSummary;
  trends: MonthlyTrend[];
  upperCategoryBreakdown: UpperCategoryBreakdown[];
  expenseBreakdown: CategoryBreakdown[];
  incomeTrends: MonthlyIncomeBySubcategory[];
  monthlyCategoryTotals: MonthlyCategoryTotal[];
}

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
      const result = await api.get<DashboardData>(`/api/analytics/dashboard?year=${year}`);
      if (result.data) {
        setData(result.data);
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          title="Total Income"
          value={formatCurrency(summary.totalIncome)}
          change={formatChange(summary.incomeChange)}
          trend={summary.incomeChange >= 0 ? 'up' : 'down'}
          icon={TrendingUp}
          iconColor="text-pink-400"
          bgColor="bg-pink-950/30 border border-pink-900/50"
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
          title="Savings"
          value={formatCurrency(summary.totalSavings)}
          change={formatChange(summary.savingsChange)}
          trend={summary.savingsChange >= 0 ? 'up' : 'down'}
          icon={PiggyBank}
          iconColor="text-emerald-400"
          bgColor="bg-emerald-950/30 border border-emerald-900/50"
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
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const total = payload.reduce((sum, entry) => sum + (entry.value as number || 0), 0);
                        return (
                          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                            <p className="text-slate-100 font-medium mb-2">{label}</p>
                            {payload.map((entry, index) => (
                              <p key={index} style={{ color: entry.color }} className="text-sm">
                                {entry.name}: {formatCurrency(entry.value as number)}
                              </p>
                            ))}
                            <p className="text-slate-100 font-semibold mt-2 pt-2 border-t border-slate-600">
                              Total: {formatCurrency(total)}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
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
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ fill: '#10b981', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="sinking"
                    name="Sinking Funds"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={{ fill: '#38bdf8', strokeWidth: 2 }}
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

        {/* Income by Subcategory Chart */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Income Sources</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              // Get all unique income subcategories across all months
              const allSubcategories = new Set<string>();
              data?.incomeTrends?.forEach(month => {
                Object.keys(month.subcategories).forEach(sub => allSubcategories.add(sub));
              });
              const subcategoryList = Array.from(allSubcategories);

              // Transform data for stacked area chart with cumulative values
              const chartData = data?.incomeTrends?.map(month => {
                const row: Record<string, string | number> = { monthLabel: month.monthLabel };
                subcategoryList.forEach(sub => {
                  row[sub] = month.subcategories[sub] || 0;
                });
                return row;
              }) || [];

              // Calculate cumulative totals
              const cumulativeData = chartData.map((row, idx) => {
                const cumRow: Record<string, string | number> = { monthLabel: row.monthLabel };
                subcategoryList.forEach(sub => {
                  let cumSum = 0;
                  for (let i = 0; i <= idx; i++) {
                    cumSum += (chartData[i][sub] as number) || 0;
                  }
                  cumRow[sub] = cumSum;
                });
                return cumRow;
              });

              if (subcategoryList.length === 0) {
                return (
                  <div className="h-64 flex items-center justify-center text-slate-500 bg-slate-800/50 rounded-lg border border-slate-700/50">
                    <p>Import income transactions to see trends</p>
                  </div>
                );
              }

              return (
                <ResponsiveContainer width="100%" height={280}>
                  <ComposedChart data={cumulativeData}>
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
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          const total = payload.reduce((sum, entry) => sum + (entry.value as number || 0), 0);
                          return (
                            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                              <p className="text-slate-100 font-medium mb-2">{label}</p>
                              {payload.map((entry, index) => (
                                <p key={index} style={{ color: entry.color }} className="text-sm">
                                  {entry.name}: {formatCurrency(entry.value as number)}
                                </p>
                              ))}
                              <p className="text-slate-100 font-semibold mt-2 pt-2 border-t border-slate-600">
                                Total: {formatCurrency(total)}
                              </p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    {subcategoryList.map((sub, index) => (
                      <Area
                        key={sub}
                        type="monotone"
                        dataKey={sub}
                        name={sub}
                        stackId="1"
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                        fillOpacity={0.6}
                        stroke={CHART_COLORS[index % CHART_COLORS.length]}
                        strokeWidth={2}
                      />
                    ))}
                    <Legend />
                  </ComposedChart>
                </ResponsiveContainer>
              );
            })()}
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
                    outerRadius={DONUT_CHART.OUTER_RADIUS}
                    innerRadius={DONUT_CHART.INNER_RADIUS}
                    paddingAngle={DONUT_CHART.PADDING_ANGLE}
                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
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
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0];
                        const color = data.payload.fill || UPPER_CATEGORY_COLORS[data.payload.type] || '#64748b';
                        return (
                          <div className="bg-slate-800 border border-slate-700 rounded-lg p-2">
                            <p className="text-slate-100 font-medium">{data.name}</p>
                            <p style={{ color }} className="font-semibold">
                              {formatCurrency(data.value as number)}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
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
                    outerRadius={DONUT_CHART.OUTER_RADIUS}
                    innerRadius={DONUT_CHART.INNER_RADIUS}
                    paddingAngle={1}
                    label={({ name, percent }) => (percent ?? 0) > 0.05 ? `${name} ${((percent ?? 0) * 100).toFixed(0)}%` : ''}
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
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const item = payload[0];
                        const color = item.payload.fill || '#64748b';
                        return (
                          <div className="bg-slate-800 border border-slate-700 rounded-lg p-2">
                            <p className="text-slate-100 font-medium">{item.name}</p>
                            <p style={{ color }} className="font-semibold">
                              {formatCurrency(item.value as number)}
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
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

      {/* Monthly Category Totals Table */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100">Monthly Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.monthlyCategoryTotals && data.monthlyCategoryTotals.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-2 px-2 text-xs font-medium text-slate-400 sticky left-0 bg-slate-900">Category</th>
                    {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => (
                      <th key={month} className="text-right py-2 px-2 text-xs font-medium text-slate-400 min-w-[70px]">{month}</th>
                    ))}
                    <th className="text-right py-2 px-2 text-xs font-medium text-slate-400 min-w-[80px]">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Group by upper category
                    const grouped = data.monthlyCategoryTotals.reduce((acc, item) => {
                      const key = item.upperCategory;
                      if (!acc[key]) {
                        acc[key] = {
                          type: item.upperCategoryType,
                          items: [],
                          monthlyTotals: new Array(12).fill(0),
                          yearTotal: 0,
                        };
                      }
                      acc[key].items.push(item);
                      item.monthlyTotals.forEach((val, idx) => {
                        acc[key].monthlyTotals[idx] += val;
                      });
                      acc[key].yearTotal += item.yearTotal;
                      return acc;
                    }, {} as Record<string, { type: string; items: MonthlyCategoryTotal[]; monthlyTotals: number[]; yearTotal: number }>);

                    const typeColors: Record<string, string> = {
                      income: 'text-pink-400',
                      expense: 'text-red-400',
                      bill: 'text-amber-400',
                      saving: 'text-emerald-400',
                      debt: 'text-purple-400',
                      sinking: 'text-sky-400',
                      transfer: 'text-stone-400',
                    };

                    return Object.entries(grouped).map(([upperCat, group]) => (
                      <Fragment key={upperCat}>
                        {/* Upper category header row */}
                        <tr className="bg-slate-800/50 border-t border-slate-700">
                          <td className={`py-2 px-2 font-semibold sticky left-0 bg-slate-800/50 ${typeColors[group.type] || 'text-slate-200'}`}>
                            {upperCat}
                          </td>
                          {group.monthlyTotals.map((total, idx) => (
                            <td key={idx} className={`py-2 px-2 text-right font-medium ${typeColors[group.type] || 'text-slate-200'}`}>
                              {total > 0 ? formatCurrency(total) : '-'}
                            </td>
                          ))}
                          <td className={`py-2 px-2 text-right font-bold ${typeColors[group.type] || 'text-slate-200'}`}>
                            {formatCurrency(group.yearTotal)}
                          </td>
                        </tr>
                        {/* Subcategory rows */}
                        {group.items.map((item) => (
                          <tr key={`${upperCat}-${item.subCategory}`} className="hover:bg-slate-800/30">
                            <td className="py-1.5 px-2 pl-6 text-slate-400 sticky left-0 bg-slate-900">
                              {item.subCategory}
                            </td>
                            {item.monthlyTotals.map((total, idx) => (
                              <td key={idx} className="py-1.5 px-2 text-right text-slate-300 font-mono text-xs">
                                {total > 0 ? formatCurrency(total) : '-'}
                              </td>
                            ))}
                            <td className="py-1.5 px-2 text-right text-slate-200 font-mono text-xs font-medium">
                              {formatCurrency(item.yearTotal)}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500">
              <p>No categorized transactions yet</p>
              <p className="text-sm mt-1">Categorize transactions to see monthly breakdown</p>
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
