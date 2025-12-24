// Tests for Net Worth pure functions and database operations
import { describe, it, expect } from 'vitest';
import {
  calculateNetWorthProjection,
  generateProjectionPoints,
} from './net-worth';

// Note: CRUD operations are tested indirectly through integration tests
// and by the fact that they use the same patterns as other tested db operations.
// Testing pure functions here for linear regression and projections.

describe('Net Worth Calculations', () => {
  describe('Linear Regression - calculateNetWorthProjection', () => {
    it('should return null for empty array', () => {
      expect(calculateNetWorthProjection([])).toBeNull();
    });

    it('should return null for single data point', () => {
      const entries = [
        {
          id: '1',
          recorded_at: '2024-01-15',
          assets: { fields: [] },
          liabilities: { fields: [] },
          total_assets: 100000,
          total_liabilities: 0,
          net_worth: 100000,
          notes: null,
          created_at: '2024-01-15T00:00:00Z',
          updated_at: '2024-01-15T00:00:00Z',
        },
      ];
      expect(calculateNetWorthProjection(entries)).toBeNull();
    });

    it('should calculate regression for 2 points', () => {
      const entries = [
        {
          id: '1',
          recorded_at: '2024-01-01',
          assets: { fields: [] },
          liabilities: { fields: [] },
          total_assets: 100000,
          total_liabilities: 0,
          net_worth: 100000,
          notes: null,
          created_at: '',
          updated_at: '',
        },
        {
          id: '2',
          recorded_at: '2024-07-01',
          assets: { fields: [] },
          liabilities: { fields: [] },
          total_assets: 112000,
          total_liabilities: 0,
          net_worth: 112000,
          notes: null,
          created_at: '',
          updated_at: '',
        },
      ];

      const result = calculateNetWorthProjection(entries);

      expect(result).not.toBeNull();
      expect(result!.slope).toBeGreaterThan(0); // Net worth is increasing
      expect(result!.intercept).toBeDefined();
      expect(result!.rSquared).toBe(1); // Perfect fit with 2 points (linear)
    });

    it('should calculate regression for multiple points with good fit', () => {
      // Linear growth of ~$2000/month
      const entries = [
        { id: '1', recorded_at: '2024-01-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 100000, total_liabilities: 0, net_worth: 100000, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-03-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 104000, total_liabilities: 0, net_worth: 104000, notes: null, created_at: '', updated_at: '' },
        { id: '3', recorded_at: '2024-05-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 108000, total_liabilities: 0, net_worth: 108000, notes: null, created_at: '', updated_at: '' },
        { id: '4', recorded_at: '2024-07-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 112000, total_liabilities: 0, net_worth: 112000, notes: null, created_at: '', updated_at: '' },
      ];

      const result = calculateNetWorthProjection(entries);

      expect(result).not.toBeNull();
      expect(result!.slope).toBeGreaterThan(0); // Positive growth
      expect(result!.rSquared).toBeGreaterThan(0.99); // Near-perfect linear fit
    });

    it('should handle negative net worth values', () => {
      const entries = [
        { id: '1', recorded_at: '2024-01-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 50000, total_liabilities: 100000, net_worth: -50000, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-06-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 60000, total_liabilities: 90000, net_worth: -30000, notes: null, created_at: '', updated_at: '' },
      ];

      const result = calculateNetWorthProjection(entries);

      expect(result).not.toBeNull();
      expect(result!.slope).toBeGreaterThan(0); // Net worth is improving (less negative)
    });

    it('should handle declining net worth', () => {
      const entries = [
        { id: '1', recorded_at: '2024-01-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 100000, total_liabilities: 0, net_worth: 100000, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-06-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 80000, total_liabilities: 0, net_worth: 80000, notes: null, created_at: '', updated_at: '' },
      ];

      const result = calculateNetWorthProjection(entries);

      expect(result).not.toBeNull();
      expect(result!.slope).toBeLessThan(0); // Net worth is declining
    });
  });

  describe('Projection Points - generateProjectionPoints', () => {
    it('should return empty array for empty input', () => {
      expect(generateProjectionPoints([])).toEqual([]);
    });

    it('should return empty array for single data point', () => {
      const entries = [
        { id: '1', recorded_at: '2024-01-15', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 100, total_liabilities: 0, net_worth: 100, notes: null, created_at: '', updated_at: '' },
      ];
      expect(generateProjectionPoints(entries)).toEqual([]);
    });

    it('should generate quarterly projections for 5 years', () => {
      const entries = [
        { id: '1', recorded_at: '2024-01-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 100000, total_liabilities: 0, net_worth: 100000, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-07-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 110000, total_liabilities: 0, net_worth: 110000, notes: null, created_at: '', updated_at: '' },
      ];

      const projections = generateProjectionPoints(entries, 5);

      // 5 years * 4 quarters = 20 points
      expect(projections).toHaveLength(20);
      
      // Each projection should have required properties
      projections.forEach(p => {
        expect(p.date).toBeDefined();
        expect(typeof p.date).toBe('string');
        expect(p.netWorth).toBeDefined();
        expect(typeof p.netWorth).toBe('number');
      });
    });

    it('should project increasing net worth for positive growth', () => {
      const entries = [
        { id: '1', recorded_at: '2024-01-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 100000, total_liabilities: 0, net_worth: 100000, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-07-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 120000, total_liabilities: 0, net_worth: 120000, notes: null, created_at: '', updated_at: '' },
      ];

      const projections = generateProjectionPoints(entries, 5);

      // Net worth should be increasing
      expect(projections[projections.length - 1].netWorth).toBeGreaterThan(projections[0].netWorth);
    });

    it('should project decreasing net worth for negative growth', () => {
      const entries = [
        { id: '1', recorded_at: '2024-01-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 100000, total_liabilities: 0, net_worth: 100000, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-07-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 80000, total_liabilities: 0, net_worth: 80000, notes: null, created_at: '', updated_at: '' },
      ];

      const projections = generateProjectionPoints(entries, 5);

      // Net worth should be decreasing
      expect(projections[projections.length - 1].netWorth).toBeLessThan(projections[0].netWorth);
    });

    it('should generate less projections for shorter periods', () => {
      const entries = [
        { id: '1', recorded_at: '2024-01-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 100000, total_liabilities: 0, net_worth: 100000, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-07-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 110000, total_liabilities: 0, net_worth: 110000, notes: null, created_at: '', updated_at: '' },
      ];

      const projections2Years = generateProjectionPoints(entries, 2);
      const projections1Year = generateProjectionPoints(entries, 1);

      // 2 years = 8 quarters, 1 year = 4 quarters
      expect(projections2Years).toHaveLength(8);
      expect(projections1Year).toHaveLength(4);
    });
  });
});
