import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date as YYYY-MM-DD without timezone conversion issues.
 * Unlike Date.toISOString().split('T')[0], this function constructs the string
 * directly from the components, avoiding UTC timezone offset problems.
 */
export function formatDateYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Calculate total spend from category breakdown.
 * Total spend includes expenses, bills, debt, sinking funds, AND savings
 * (all money allocated from income).
 */
export function calculateTotalSpend(breakdown: {
  expenses: number;
  bills: number;
  debt: number;
  sinking: number;
  savings: number;
}): number {
  return (
    (breakdown.expenses || 0) +
    (breakdown.bills || 0) +
    (breakdown.debt || 0) +
    (breakdown.sinking || 0) +
    (breakdown.savings || 0)
  );
}

/**
 * Format a number as Australian currency (AUD).
 * Supports compact format for large numbers (K, M).
 */
export function formatCurrencyAUD(
  amount: number,
  options?: { compact?: boolean; decimals?: number }
): string {
  const { compact = false, decimals = 0 } = options || {};

  if (compact) {
    if (Math.abs(amount) >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(amount) >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
  }

  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}
