'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Wallet, PiggyBank } from 'lucide-react';

export function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Overview of your financial health
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Total Income"
          value="$0.00"
          change="+0%"
          trend="up"
          icon={TrendingUp}
          iconColor="text-emerald-500"
          bgColor="bg-emerald-50 dark:bg-emerald-950/30"
        />
        <SummaryCard
          title="Total Expenses"
          value="$0.00"
          change="+0%"
          trend="down"
          icon={TrendingDown}
          iconColor="text-red-500"
          bgColor="bg-red-50 dark:bg-red-950/30"
        />
        <SummaryCard
          title="Net Balance"
          value="$0.00"
          change="+0%"
          trend="up"
          icon={Wallet}
          iconColor="text-cyan-500"
          bgColor="bg-cyan-50 dark:bg-cyan-950/30"
        />
        <SummaryCard
          title="Savings"
          value="$0.00"
          change="+0%"
          trend="up"
          icon={PiggyBank}
          iconColor="text-violet-500"
          bgColor="bg-violet-50 dark:bg-violet-950/30"
        />
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Spending Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <p>Import transactions to see trends</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Income Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <p>Import transactions to see breakdown</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-slate-400 dark:text-slate-500">
            <p>No transactions yet</p>
            <p className="text-sm mt-1">Import a CSV file or add transactions manually</p>
          </div>
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
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
            <p className={`text-xs mt-1 ${trend === 'up' ? 'text-emerald-500' : 'text-red-500'}`}>
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

