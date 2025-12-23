'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrencyAUD } from '@/lib/utils';
import type { NetWorthEntryParsed } from '@/types/net-worth';

interface NetWorthChartProps {
  entries: NetWorthEntryParsed[];
  projectionPoints?: Array<{ date: string; netWorth: number }>;
  projection?: { slope: number; intercept: number; rSquared: number } | null;
  isLoading?: boolean;
}

export function NetWorthChart({
  entries,
  projectionPoints = [],
  projection,
  isLoading,
}: NetWorthChartProps) {
  const formatCurrency = (value: number) => formatCurrencyAUD(value, { compact: true });

  // Format timestamp for tooltip
  const formatDateForTooltip = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  // Format timestamp for axis ticks
  const formatDateForAxis = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-AU', {
      month: 'short',
      year: '2-digit',
    });
  };

  // Convert date string to timestamp for numeric X axis
  const dateToTimestamp = (dateStr: string) => new Date(dateStr).getTime();

  // Combine historical and projection data with timestamps for time-scaled axis
  const chartData = useMemo(() => {
    const historicalData = entries.map(entry => ({
      timestamp: dateToTimestamp(entry.recorded_at),
      date: entry.recorded_at,
      netWorth: entry.net_worth,
      totalAssets: entry.total_assets,
      totalLiabilities: entry.total_liabilities,
      isProjection: false,
    }));

    // Only add projection line if we have 2+ data points
    if (entries.length >= 2 && projectionPoints.length > 0) {
      const projectionData = projectionPoints.map(p => ({
        timestamp: dateToTimestamp(p.date),
        date: p.date,
        projectedNetWorth: p.netWorth,
        isProjection: true,
      }));

      // Add the last historical point as the start of projection
      const lastHistorical = historicalData[historicalData.length - 1];
      const projectionStart = {
        timestamp: lastHistorical.timestamp,
        date: lastHistorical.date,
        projectedNetWorth: lastHistorical.netWorth,
        isProjection: true,
      };

      return [...historicalData, projectionStart, ...projectionData];
    }

    return historicalData;
  }, [entries, projectionPoints]);

  // Calculate domain for X axis
  const xDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 1];
    
    const timestamps = chartData.map(d => d.timestamp);
    const min = Math.min(...timestamps);
    const max = Math.max(...timestamps);
    
    // Add 5% padding on each side
    const padding = (max - min) * 0.05 || 86400000; // Default to 1 day if single point
    return [min - padding, max + padding];
  }, [chartData]);

  // Generate tick values for X axis - aim for ~5-7 ticks spread across the range
  const xTicks = useMemo(() => {
    if (chartData.length === 0) return [];
    
    const [min, max] = xDomain;
    const range = max - min;
    
    // Calculate appropriate interval (roughly 5-7 ticks)
    const tickCount = 6;
    const interval = range / tickCount;
    
    const ticks: number[] = [];
    for (let i = 0; i <= tickCount; i++) {
      ticks.push(min + interval * i);
    }
    
    return ticks;
  }, [xDomain, chartData.length]);

  // Calculate trend info
  const trendInfo = useMemo(() => {
    if (!projection || entries.length < 2) return null;

    // Slope is per day, convert to per year
    const yearlyGrowth = projection.slope * 365;
    const percentage = entries[0].net_worth > 0
      ? (yearlyGrowth / entries[0].net_worth) * 100
      : 0;

    return {
      yearlyGrowth,
      percentage,
      isPositive: yearlyGrowth >= 0,
      rSquared: projection.rSquared,
    };
  }, [projection, entries]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-500">
        <p>No data to display. Record your first net worth entry to see the chart.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Trend Summary - Only show if we have enough data for regression */}
      {trendInfo && (
        <div className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2">
            {trendInfo.isPositive ? (
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-400" />
            )}
            <span className="text-slate-400 text-sm">Projected Annual Growth:</span>
            <span className={`font-bold ${trendInfo.isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {trendInfo.isPositive ? '+' : ''}{formatCurrency(trendInfo.yearlyGrowth)}
              <span className="text-xs ml-1">
                ({trendInfo.isPositive ? '+' : ''}{trendInfo.percentage.toFixed(1)}%)
              </span>
            </span>
          </div>
          <div className="text-xs text-slate-500">
            R² = {(trendInfo.rSquared * 100).toFixed(1)}%
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="timestamp"
              type="number"
              scale="time"
              domain={xDomain}
              ticks={xTicks}
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={formatDateForAxis}
            />
            <YAxis
              stroke="#64748b"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={formatCurrency}
              width={80}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#94a3b8' }}
              labelFormatter={(timestamp: number) => formatDateForTooltip(timestamp)}
              formatter={(value, name) => {
                const numValue = typeof value === 'number' ? value : 0;
                const formatted = new Intl.NumberFormat('en-AU', {
                  style: 'currency',
                  currency: 'AUD',
                  minimumFractionDigits: 0,
                }).format(numValue);

                const label = name === 'projectedNetWorth' ? 'Projected' : 
                              name === 'netWorth' ? 'Net Worth' :
                              name === 'totalAssets' ? 'Assets' : 'Liabilities';

                return [formatted, label];
              }}
            />

            {/* Zero reference line */}
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />

            {/* Historical net worth line */}
            <Line
              type="monotone"
              dataKey="netWorth"
              name="Net Worth"
              stroke="#06b6d4"
              strokeWidth={3}
              dot={{ fill: '#06b6d4', strokeWidth: 2, r: 4 }}
              activeDot={{ r: 6, fill: '#06b6d4' }}
              connectNulls={false}
            />

            {/* Projection line - dashed, only appears when 2+ data points */}
            {entries.length >= 2 && projectionPoints.length > 0 && (
              <Line
                type="monotone"
                dataKey="projectedNetWorth"
                name="Projected Net Worth"
                stroke="#06b6d4"
                strokeWidth={2}
                strokeDasharray="8 4"
                dot={false}
                connectNulls
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-sm text-slate-400">
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-cyan-500"></div>
          <span>Actual Net Worth</span>
        </div>
        {entries.length >= 2 && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 border-b-2 border-dashed border-cyan-500"></div>
            <span>5-Year Projection</span>
          </div>
        )}
        {entries.length < 2 && (
          <div className="text-xs text-slate-500 italic">
            Add 2+ entries to see projection trend line
          </div>
        )}
      </div>
    </div>
  );
}
