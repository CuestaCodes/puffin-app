/**
 * Budget Status Utility
 *
 * Determines the visual status of a budget based on spending percentage.
 * Used for progress bar colors in the Monthly Budget view.
 */

/** Budget status for visual display */
export type BudgetStatus = 'under' | 'over';

/** Threshold percentages for budget status */
export const BUDGET_THRESHOLDS = {
  /** Above this percentage = "over" (red); at or below = "under" (normal) */
  OVER: 105,
} as const;

/**
 * Get the budget status based on spending percentage.
 *
 * @param percentage - Spending as a percentage of budget (e.g., 95 for 95%)
 * @returns 'over' (>105%) or 'under' (≤105%)
 */
export function getBudgetStatus(percentage: number): BudgetStatus {
  return percentage > BUDGET_THRESHOLDS.OVER ? 'over' : 'under';
}
