/**
 * Budget Status Utility
 *
 * Determines the visual status of a budget based on spending percentage.
 * Used for progress bar colors in the Monthly Budget view.
 */

/** Budget status for visual display */
export type BudgetStatus = 'under' | 'warning' | 'over';

/** Threshold percentages for budget status */
export const BUDGET_THRESHOLDS = {
  /** Below this percentage = "under" (green/cyan) */
  WARNING: 80,
  /** Above this percentage = "over" (red). Between WARNING and OVER = "warning" (amber) */
  OVER: 105,
} as const;

/**
 * Get the budget status based on spending percentage.
 *
 * @param percentage - Spending as a percentage of budget (e.g., 95 for 95%)
 * @returns 'under' (≤80%), 'warning' (80-105%), or 'over' (>105%)
 *
 * @example
 * getBudgetStatus(75)   // 'under'
 * getBudgetStatus(95)   // 'warning'
 * getBudgetStatus(102)  // 'warning' (within 5% tolerance)
 * getBudgetStatus(110)  // 'over'
 */
export function getBudgetStatus(percentage: number): BudgetStatus {
  if (percentage > BUDGET_THRESHOLDS.OVER) {
    return 'over';
  }
  if (percentage > BUDGET_THRESHOLDS.WARNING) {
    return 'warning';
  }
  return 'under';
}

/**
 * Check if spending is over budget (beyond tolerance).
 * This is true only when spending exceeds 105% of budget.
 *
 * @param percentage - Spending as a percentage of budget
 * @returns true if over the 105% threshold
 */
export function isOverBudgetThreshold(percentage: number): boolean {
  return percentage > BUDGET_THRESHOLDS.OVER;
}
