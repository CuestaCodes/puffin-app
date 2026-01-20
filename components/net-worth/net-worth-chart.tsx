'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Loader2, TrendingUp } from 'lucide-react';
import { formatCurrencyAUD } from '@/lib/utils';
import type { NetWorthEntryParsed } from '@/types/net-worth';

interface NetWorthChartProps {
  entries: NetWorthEntryParsed[];
  /** @deprecated Linear projection - kept for backward compatibility */
  projectionPoints?: Array<{ date: string; netWorth: number }>;
  compoundProjectionPoints?: Array<{ date: string; liquidAssets: number }>;
  /** @deprecated Linear projection - kept for backward compatibility */
  projection?: { slope: number; intercept: number; rSquared: number } | null;
  growthRate?: number;
  projectionYears?: number;
  isLoading?: boolean;
}

export function NetWorthChart({
  entries,
  projectionPoints: _projectionPoints = [],
  compoundProjectionPoints = [],
  projection: _projection,
  growthRate = 0.05,
  projectionYears = 10,
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
      liquidAssets: entry.total_liquid_assets,
      totalAssets: entry.total_assets,
      totalLiabilities: entry.total_liabilities,
      isProjection: false,
    }));

    // Add compound projection line for liquid assets if we have data
    if (entries.length > 0 && compoundProjectionPoints.length > 0) {
      const projectionData = compoundProjectionPoints.map(p => ({
        timestamp: dateToTimestamp(p.date),
        date: p.date,
        projectedLiquidAssets: p.liquidAssets,
        isProjection: true,
      }));

      // Add the last historical liquid assets value as the start of projection
      const lastHistorical = historicalData[historicalData.length - 1];
      const projectionStart = {
        timestamp: lastHistorical.timestamp,
        date: lastHistorical.date,
        projectedLiquidAssets: lastHistorical.liquidAssets,
        isProjection: true,
      };

      return [...historicalData, projectionStart, ...projectionData];
    }

    return historicalData;
  }, [entries, compoundProjectionPoints]);

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

  // Calculate projection info for liquid assets
  const projectionInfo = useMemo(() => {
    if (entries.length === 0) return null;

    const lastEntry = entries[entries.length - 1];
    const liquidAssets = lastEntry.total_liquid_assets;

    if (liquidAssets <= 0) return null;

    // Calculate projected value with quarterly compounding
    const quarterlyRate = growthRate / 4;
    const quarters = projectionYears * 4;
    const projectedValue = liquidAssets * Math.pow(1 + quarterlyRate, quarters);
    const projectedGrowth = projectedValue - liquidAssets;

    return {
      currentLiquid: liquidAssets,
      projectedValue,
      projectedGrowth,
      growthPercentage: growthRate * 100,
      years: projectionYears,
    };
  }, [entries, growthRate, projectionYears]);

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
      {/* Projection Summary - Show compound growth projection */}
      {projectionInfo && (
        <div className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-lg border border-slate-700">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <span className="text-slate-400 text-sm">{projectionInfo.years}-Year Projection ({projectionInfo.growthPercentage.toFixed(0)}% annual):</span>
            <span className="font-bold text-blue-400">
              {formatCurrency(projectionInfo.currentLiquid)} → {formatCurrency(projectionInfo.projectedValue)}
              <span className="text-xs ml-1 text-emerald-400">
                (+{formatCurrency(projectionInfo.projectedGrowth)})
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
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

                const labelMap: Record<string, string> = {
                  projectedLiquidAssets: 'Projected Liquid',
                  liquidAssets: 'Liquid Assets',
                  netWorth: 'Net Worth',
                  totalAssets: 'Total Assets',
                  totalLiabilities: 'Liabilities',
                };
                const label = labelMap[String(name)] || String(name);

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

            {/* Historical liquid assets area (shaded) */}
            <Area
              type="monotone"
              dataKey="liquidAssets"
              name="Liquid Assets"
              fill="#3b82f6"
              fillOpacity={0.2}
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', strokeWidth: 2, r: 3 }}
              activeDot={{ r: 5, fill: '#3b82f6' }}
              connectNulls={false}
            />

            {/* Compound projection line for liquid assets - dashed */}
            {entries.length > 0 && compoundProjectionPoints.length > 0 && (
              <Line
                type="monotone"
                dataKey="projectedLiquidAssets"
                name="Projected Liquid Assets"
                stroke="#3b82f6"
                strokeWidth={2}
                strokeDasharray="8 4"
                dot={false}
                connectNulls
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 text-sm text-slate-400 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-cyan-500"></div>
          <span>Net Worth</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-blue-500"></div>
          <span>Liquid Assets</span>
        </div>
        {entries.length > 0 && compoundProjectionPoints.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-0.5 border-b-2 border-dashed border-blue-500"></div>
            <span>Projected ({Math.round(growthRate * 100)}% annual)</span>
          </div>
        )}
        {projectionInfo === null && entries.length > 0 && (
          <div className="text-xs text-slate-500 italic">
            Add liquid assets to see projection
          </div>
        )}
      </div>
    </div>
  );
}
