'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, TrendingUp, Wallet, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { RecordNetWorthDialog } from '@/components/net-worth/record-dialog';
import { EntriesTable } from '@/components/net-worth/entries-table';
import { NetWorthChart } from '@/components/net-worth/net-worth-chart';
import type { NetWorthEntryParsed } from '@/types/net-worth';

interface ChartData {
  entries: NetWorthEntryParsed[];
  projection: { slope: number; intercept: number; rSquared: number } | null;
  projectionPoints: Array<{ date: string; netWorth: number }>;
}

export function NetWorthPage() {
  const [entries, setEntries] = useState<NetWorthEntryParsed[]>([]);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<NetWorthEntryParsed | null>(null);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch table data and chart data in parallel
      const [tableRes, chartRes] = await Promise.all([
        fetch('/api/net-worth'),
        fetch('/api/net-worth?chart=true'),
      ]);

      if (tableRes.ok) {
        const tableData = await tableRes.json();
        setEntries(tableData);
      }

      if (chartRes.ok) {
        const chartDataRes = await chartRes.json();
        setChartData(chartDataRes);
      }
    } catch (error) {
      console.error('Failed to fetch net worth data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleEdit = (entry: NetWorthEntryParsed) => {
    setEditEntry(entry);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditEntry(null);
    }
  };

  const handleSaveOrDelete = () => {
    fetchData();
  };

  // Get latest entry for summary
  const latestEntry = entries.length > 0 ? entries[0] : null;
  const previousEntry = entries.length > 1 ? entries[1] : null;
  const netWorthChange = latestEntry && previousEntry
    ? latestEntry.net_worth - previousEntry.net_worth
    : null;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Net Worth</h1>
          <p className="text-slate-400 text-sm mt-1">
            Track your financial position over time
          </p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-cyan-600 hover:bg-cyan-700 text-white"
        >
          <Plus className="w-4 h-4 mr-2" />
          Record Net Worth
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Current Net Worth */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-cyan-500/10">
                <Wallet className="w-4 h-4 text-cyan-400" />
              </div>
              <p className="text-sm text-slate-400">Current Net Worth</p>
            </div>
            <p className={`text-2xl font-bold mt-1 tabular-nums ${
              latestEntry && latestEntry.net_worth >= 0 ? 'text-cyan-400' : 'text-red-400'
            }`}>
              {isLoading ? '—' : latestEntry ? formatCurrency(latestEntry.net_worth) : '$0'}
            </p>
            {netWorthChange !== null && (
              <p className={`text-xs mt-1 ${netWorthChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {netWorthChange >= 0 ? '+' : ''}{formatCurrency(netWorthChange)} since last entry
              </p>
            )}
          </CardContent>
        </Card>

        {/* Total Assets */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <ArrowUpCircle className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-sm text-slate-400">Total Assets</p>
            </div>
            <p className="text-2xl font-bold mt-1 tabular-nums text-emerald-400">
              {isLoading ? '—' : latestEntry ? formatCurrency(latestEntry.total_assets) : '$0'}
            </p>
          </CardContent>
        </Card>

        {/* Total Liabilities */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-red-500/10">
                <ArrowDownCircle className="w-4 h-4 text-red-400" />
              </div>
              <p className="text-sm text-slate-400">Total Liabilities</p>
            </div>
            <p className="text-2xl font-bold mt-1 tabular-nums text-red-400">
              {isLoading ? '—' : latestEntry ? formatCurrency(latestEntry.total_liabilities) : '$0'}
            </p>
          </CardContent>
        </Card>

        {/* Number of Snapshots */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <TrendingUp className="w-4 h-4 text-purple-400" />
              </div>
              <p className="text-sm text-slate-400">Total Snapshots</p>
            </div>
            <p className="text-2xl font-bold mt-1 tabular-nums text-purple-400">
              {isLoading ? '—' : entries.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="chart" className="w-full">
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger
            value="chart"
            className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white"
          >
            Chart
          </TabsTrigger>
          <TabsTrigger
            value="history"
            className="data-[state=active]:bg-cyan-600 data-[state=active]:text-white"
          >
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chart" className="mt-4">
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-lg text-white">Net Worth Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <NetWorthChart
                entries={chartData?.entries || []}
                projection={chartData?.projection}
                projectionPoints={chartData?.projectionPoints || []}
                isLoading={isLoading}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-lg text-white">Entry History</CardTitle>
            </CardHeader>
            <CardContent>
              <EntriesTable
                entries={entries}
                onEdit={handleEdit}
                onDelete={handleSaveOrDelete}
                isLoading={isLoading}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Record/Edit Dialog */}
      <RecordNetWorthDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        onSave={handleSaveOrDelete}
        editEntry={editEntry}
        latestEntry={latestEntry}
      />
    </div>
  );
}

