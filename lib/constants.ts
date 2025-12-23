/**
 * Application-wide constants
 */

// Transaction splitting limits
export const MIN_SPLITS = 2;
export const MAX_SPLITS = 3;

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

/**
 * Donut/Pie chart dimensions
 * Consistent sizing for all pie/donut charts across the app
 */
export const DONUT_CHART = {
  INNER_RADIUS: 40,
  OUTER_RADIUS: 80,
  PADDING_ANGLE: 2,
} as const;

/**
 * Extended color palette for category breakdown charts.
 * 20 distinct colors selected for maximum visual distinction across
 * data series. Colors are drawn from Tailwind's 400-500 range for
 * good visibility on dark backgrounds.
 */
export const CHART_COLORS = [
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
] as const;

/**
 * Colors for upper category types - consistent across app.
 * Used in charts, badges, and other category-related UI elements.
 */
export const UPPER_CATEGORY_COLORS: Record<string, string> = {
  income: '#ec4899',  // pink-500
  expense: '#ef4444', // red-500
  bill: '#f59e0b',    // amber-500
  debt: '#a855f7',    // purple-500
  saving: '#10b981',  // emerald-500
  sinking: '#14b8a6', // teal-500
  transfer: '#78716c', // stone-500
} as const;

/**
 * Tailwind text color classes for upper category types.
 * Used in UI components for consistent category text styling.
 */
export const UPPER_CATEGORY_TEXT_COLORS: Record<string, string> = {
  income: 'text-pink-400',
  expense: 'text-red-400',
  bill: 'text-amber-400',
  debt: 'text-purple-400',
  saving: 'text-emerald-400',
  sinking: 'text-teal-400',
  transfer: 'text-stone-400',
} as const;
