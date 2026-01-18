import { describe, it, expect } from 'vitest';
import {
  getBudgetStatus,
  isOverBudgetThreshold,
  BUDGET_THRESHOLDS,
} from './budget-status';

describe('budget-status', () => {
  describe('BUDGET_THRESHOLDS', () => {
    it('has correct threshold values', () => {
      expect(BUDGET_THRESHOLDS.WARNING).toBe(80);
      expect(BUDGET_THRESHOLDS.OVER).toBe(105);
    });
  });

  describe('getBudgetStatus', () => {
    it('returns "under" for percentage <= 80%', () => {
      expect(getBudgetStatus(0)).toBe('under');
      expect(getBudgetStatus(50)).toBe('under');
      expect(getBudgetStatus(80)).toBe('under');
    });

    it('returns "warning" for percentage > 80% and <= 105%', () => {
      expect(getBudgetStatus(80.1)).toBe('warning');
      expect(getBudgetStatus(95)).toBe('warning');
      expect(getBudgetStatus(100)).toBe('warning');
      expect(getBudgetStatus(102)).toBe('warning');
      expect(getBudgetStatus(105)).toBe('warning');
    });

    it('returns "over" for percentage > 105%', () => {
      expect(getBudgetStatus(105.1)).toBe('over');
      expect(getBudgetStatus(110)).toBe('over');
      expect(getBudgetStatus(150)).toBe('over');
      expect(getBudgetStatus(200)).toBe('over');
    });

    it('handles edge cases', () => {
      // Negative percentage (refunds)
      expect(getBudgetStatus(-10)).toBe('under');

      // Exactly at thresholds
      expect(getBudgetStatus(80)).toBe('under');
      expect(getBudgetStatus(105)).toBe('warning');

      // Just above thresholds
      expect(getBudgetStatus(80.01)).toBe('warning');
      expect(getBudgetStatus(105.01)).toBe('over');
    });
  });

  describe('isOverBudgetThreshold', () => {
    it('returns false for percentage <= 105%', () => {
      expect(isOverBudgetThreshold(0)).toBe(false);
      expect(isOverBudgetThreshold(80)).toBe(false);
      expect(isOverBudgetThreshold(100)).toBe(false);
      expect(isOverBudgetThreshold(105)).toBe(false);
    });

    it('returns true for percentage > 105%', () => {
      expect(isOverBudgetThreshold(105.1)).toBe(true);
      expect(isOverBudgetThreshold(110)).toBe(true);
      expect(isOverBudgetThreshold(200)).toBe(true);
    });
  });
});
