'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/services';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, TrendingUp, Wallet, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { formatCurrencyAUD } from '@/lib/utils';
import { RecordNetWorthDialog } from '@/components/net-worth/record-dialog';
import { EntriesTable } from '@/components/net-worth/entries-table';
import { NetWorthChart } from '@/components/net-worth/net-worth-chart';
import type { NetWorthEntryParsed } from '@/types/net-worth';
import {
  FIXED_GROWTH_RATE_OPTIONS,
  DEFAULT_GROWTH_RATE,
  PROJECTION_YEARS_OPTIONS,
  DEFAULT_PROJECTION_YEARS,
  HISTORICAL_RATE_VALUE,
} from '@/types/net-worth';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ChartData {
  entries: NetWorthEntryParsed[];
  projection: { slope: number; intercept: number; rSquared: number } | null;
  projectionPoints: Array<{ date: string; netWorth: number }>;
  compoundProjectionPoints: Array<{ date: string; liquidAssets: number }>;
}

/**
 * Calculate historical CAGR from entries (client-side calculation)
 * Returns null if insufficient data
 */
function calculateHistoricalCAGRFromEntries(entries: NetWorthEntryParsed[]): number | null {
  if (entries.length < 2) return null;

  // Filter to entries with positive liquid assets
  const withLiquid = entries.filter(e => e.total_liquid_assets > 0);
  if (withLiquid.length < 2) return null;

  const first = withLiquid[0];
  const last = withLiquid[withLiquid.length - 1];

  const firstDate = new Date(first.recorded_at).getTime();
  const lastDate = new Date(last.recorded_at).getTime();

  // Calculate years elapsed
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const years = (lastDate - firstDate) / msPerYear;

  // Require at least ~1 month of data for meaningful calculation
  if (years < 0.1) return null;

  // Avoid division by zero or negative values
  if (first.total_liquid_assets <= 0 || last.total_liquid_assets <= 0) return null;

  // CAGR: (endValue / startValue)^(1/years) - 1
  const cagr = Math.pow(last.total_liquid_assets / first.total_liquid_assets, 1 / years) - 1;

  // Clamp to reasonable range (-50% to +100% annual)
  return Math.max(-0.5, Math.min(1.0, cagr));
}

export function NetWorthPage() {
  const [entries, setEntries] = useState<NetWorthEntryParsed[]>([]);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<NetWorthEntryParsed | null>(null);
  const [selectedRateValue, setSelectedRateValue] = useState<number>(DEFAULT_GROWTH_RATE);
  const [projectionYears, setProjectionYears] = useState(DEFAULT_PROJECTION_YEARS);

  const formatCurrency = (amount: number) => formatCurrencyAUD(amount);

  // Calculate historical CAGR from chart entries (sorted ascending)
  const historicalCAGR = useMemo(() => {
    if (!chartData?.entries || chartData.entries.length < 2) return null;
    return calculateHistoricalCAGRFromEntries(chartData.entries);
  }, [chartData?.entries]);

  // Build dynamic growth rate options including historical if available
  const growthRateOptions = useMemo(() => {
    const options = [...FIXED_GROWTH_RATE_OPTIONS];

    if (historicalCAGR !== null) {
      const pct = (historicalCAGR * 100).toFixed(1);
      const sign = historicalCAGR >= 0 ? '+' : '';
      options.unshift({
        value: HISTORICAL_RATE_VALUE,
        label: `Historical (${sign}${pct}%)`,
      });
    }

    return options;
  }, [historicalCAGR]);

  // Resolve the actual growth rate (historical -> calculated value, otherwise use selected)
  const effectiveGrowthRate = useMemo(() => {
    if (selectedRateValue === HISTORICAL_RATE_VALUE && historicalCAGR !== null) {
      return historicalCAGR;
    }
    return selectedRateValue;
  }, [selectedRateValue, historicalCAGR]);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Fetch table data and chart data in parallel
      const [tableRes, chartRes] = await Promise.all([
        api.get<NetWorthEntryParsed[]>('/api/net-worth'),
        api.get<ChartData>(`/api/net-worth?chart=true&growthRate=${effectiveGrowthRate}&years=${projectionYears}`),
      ]);

      if (tableRes.data) {
        setEntries(tableRes.data);
      }

      if (chartRes.data) {
        setChartData(chartRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch net worth data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveGrowthRate, projectionYears]);

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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

        {/* Liquid Assets */}
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <TrendingUp className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-sm text-slate-400">Liquid Assets</p>
            </div>
            <p className="text-2xl font-bold mt-1 tabular-nums text-blue-400">
              {isLoading ? '—' : latestEntry ? formatCurrency(latestEntry.total_liquid_assets) : '$0'}
            </p>
            <p className="text-xs text-slate-500 mt-1">Used for projections</p>
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
            <CardHeader className="flex flex-row items-center justify-between flex-wrap gap-4">
              <CardTitle className="text-lg text-white">Net Worth Over Time</CardTitle>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label htmlFor="growth-rate" className="text-sm text-slate-400">
                    Rate:
                  </label>
                  <Select
                    value={selectedRateValue.toString()}
                    onValueChange={(value) => setSelectedRateValue(parseFloat(value))}
                  >
                    <SelectTrigger id="growth-rate" className="w-[170px] bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {growthRateOptions.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value.toString()}
                          className="text-white hover:bg-slate-700"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="projection-years" className="text-sm text-slate-400">
                    Projection:
                  </label>
                  <Select
                    value={projectionYears.toString()}
                    onValueChange={(value) => setProjectionYears(parseInt(value))}
                  >
                    <SelectTrigger id="projection-years" className="w-[110px] bg-slate-800 border-slate-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {PROJECTION_YEARS_OPTIONS.map((option) => (
                        <SelectItem
                          key={option.value}
                          value={option.value.toString()}
                          className="text-white hover:bg-slate-700"
                        >
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <NetWorthChart
                entries={chartData?.entries || []}
                projection={chartData?.projection}
                projectionPoints={chartData?.projectionPoints || []}
                compoundProjectionPoints={chartData?.compoundProjectionPoints || []}
                growthRate={effectiveGrowthRate}
                projectionYears={projectionYears}
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

