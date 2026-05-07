import { describe, it, expect } from 'vitest';
import {
  getBudgetStatus,
  BUDGET_THRESHOLDS,
} from './budget-status';

describe('budget-status', () => {
  describe('BUDGET_THRESHOLDS', () => {
    it('has correct threshold values', () => {
      expect(BUDGET_THRESHOLDS.OVER).toBe(105);
    });
  });

  describe('getBudgetStatus', () => {
    it('returns "under" for percentage <= 105%', () => {
      expect(getBudgetStatus(0)).toBe('under');
      expect(getBudgetStatus(50)).toBe('under');
      expect(getBudgetStatus(80)).toBe('under');
      expect(getBudgetStatus(100)).toBe('under');
      expect(getBudgetStatus(105)).toBe('under');
    });

    it('returns "over" for percentage > 105%', () => {
      expect(getBudgetStatus(105.01)).toBe('over');
      expect(getBudgetStatus(110)).toBe('over');
      expect(getBudgetStatus(150)).toBe('over');
      expect(getBudgetStatus(200)).toBe('over');
    });

    it('handles negative percentages (refunds) as "under"', () => {
      expect(getBudgetStatus(-10)).toBe('under');
      expect(getBudgetStatus(-100)).toBe('under');
    });
  });
});
