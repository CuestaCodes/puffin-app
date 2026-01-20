// Tests for Net Worth pure functions and database operations
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  calculateNetWorthProjection,
  generateProjectionPoints,
  generateCompoundProjection,
  calculateHistoricalCAGR,
} from './net-worth';
import {
  TEST_TIMESTAMP,
  getTestDbPath,
  createTestDatabase,
  cleanupTestDb,
} from './test-utils';

const TEST_DB_PATH = getTestDbPath('net-worth-test');

// CRUD operation tests using direct SQL (matching patterns of other db tests)
describe('Net Worth CRUD Operations', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase(TEST_DB_PATH);
  });

  afterEach(() => {
    db.close();
    cleanupTestDb(TEST_DB_PATH);
  });

  describe('Create', () => {
    it('should create a net worth entry with all fields', () => {
      const id = 'nw-1';
      const assetsData = JSON.stringify({ fields: [{ name: 'Savings', value: 50000 }] });
      const liabilitiesData = JSON.stringify({ fields: [{ name: 'Credit Card', value: 5000 }] });

      db.prepare(`
        INSERT INTO net_worth_entry (
          id, recorded_at, assets_data, liabilities_data,
          total_assets, total_liabilities, net_worth, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, '2025-01-15', assetsData, liabilitiesData, 50000, 5000, 45000, 'Initial entry', TEST_TIMESTAMP, TEST_TIMESTAMP);

      const entry = db.prepare('SELECT * FROM net_worth_entry WHERE id = ?').get(id) as {
        id: string;
        recorded_at: string;
        total_assets: number;
        total_liabilities: number;
        net_worth: number;
        notes: string | null;
      };

      expect(entry).toBeDefined();
      expect(entry.id).toBe(id);
      expect(entry.recorded_at).toBe('2025-01-15');
      expect(entry.total_assets).toBe(50000);
      expect(entry.total_liabilities).toBe(5000);
      expect(entry.net_worth).toBe(45000);
      expect(entry.notes).toBe('Initial entry');
    });

    it('should create a net worth entry without notes', () => {
      const id = 'nw-2';
      db.prepare(`
        INSERT INTO net_worth_entry (
          id, recorded_at, assets_data, liabilities_data,
          total_assets, total_liabilities, net_worth, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, '2025-01-15', '{"fields":[]}', '{"fields":[]}', 0, 0, 0, null, TEST_TIMESTAMP, TEST_TIMESTAMP);

      const entry = db.prepare('SELECT * FROM net_worth_entry WHERE id = ?').get(id) as { notes: string | null };
      expect(entry.notes).toBeNull();
    });
  });

  describe('Read', () => {
    beforeEach(() => {
      // Seed test entries
      db.prepare(`
        INSERT INTO net_worth_entry (id, recorded_at, assets_data, liabilities_data, total_assets, total_liabilities, net_worth, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('nw-1', '2025-01-01', '{"fields":[]}', '{"fields":[]}', 100000, 10000, 90000, null, TEST_TIMESTAMP, TEST_TIMESTAMP);

      db.prepare(`
        INSERT INTO net_worth_entry (id, recorded_at, assets_data, liabilities_data, total_assets, total_liabilities, net_worth, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('nw-2', '2025-02-01', '{"fields":[]}', '{"fields":[]}', 110000, 9000, 101000, null, TEST_TIMESTAMP, TEST_TIMESTAMP);
    });

    it('should get net worth entry by ID', () => {
      const entry = db.prepare('SELECT * FROM net_worth_entry WHERE id = ?').get('nw-1') as { id: string; net_worth: number };

      expect(entry).toBeDefined();
      expect(entry.id).toBe('nw-1');
      expect(entry.net_worth).toBe(90000);
    });

    it('should return undefined for non-existent ID', () => {
      const entry = db.prepare('SELECT * FROM net_worth_entry WHERE id = ?').get('non-existent');
      expect(entry).toBeUndefined();
    });

    it('should get all entries ordered by date descending', () => {
      const entries = db.prepare('SELECT * FROM net_worth_entry ORDER BY recorded_at DESC').all() as Array<{ id: string; recorded_at: string }>;

      expect(entries).toHaveLength(2);
      expect(entries[0].id).toBe('nw-2'); // Feb is newer
      expect(entries[1].id).toBe('nw-1'); // Jan is older
    });

    it('should get latest entry', () => {
      const entry = db.prepare('SELECT * FROM net_worth_entry ORDER BY recorded_at DESC LIMIT 1').get() as { id: string };

      expect(entry.id).toBe('nw-2');
    });
  });

  describe('Update', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO net_worth_entry (id, recorded_at, assets_data, liabilities_data, total_assets, total_liabilities, net_worth, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('nw-1', '2025-01-15', '{"fields":[]}', '{"fields":[]}', 50000, 5000, 45000, 'Original note', TEST_TIMESTAMP, TEST_TIMESTAMP);
    });

    it('should update net worth entry', () => {
      const newAssetsData = JSON.stringify({ fields: [{ name: 'Savings', value: 60000 }] });

      db.prepare(`
        UPDATE net_worth_entry SET
          assets_data = ?,
          total_assets = ?,
          net_worth = ?,
          updated_at = ?
        WHERE id = ?
      `).run(newAssetsData, 60000, 55000, TEST_TIMESTAMP, 'nw-1');

      const entry = db.prepare('SELECT * FROM net_worth_entry WHERE id = ?').get('nw-1') as {
        total_assets: number;
        net_worth: number;
      };

      expect(entry.total_assets).toBe(60000);
      expect(entry.net_worth).toBe(55000);
    });

    it('should update notes to null', () => {
      db.prepare('UPDATE net_worth_entry SET notes = ?, updated_at = ? WHERE id = ?')
        .run(null, TEST_TIMESTAMP, 'nw-1');

      const entry = db.prepare('SELECT notes FROM net_worth_entry WHERE id = ?').get('nw-1') as { notes: string | null };
      expect(entry.notes).toBeNull();
    });
  });

  describe('Delete', () => {
    beforeEach(() => {
      db.prepare(`
        INSERT INTO net_worth_entry (id, recorded_at, assets_data, liabilities_data, total_assets, total_liabilities, net_worth, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('nw-1', '2025-01-15', '{"fields":[]}', '{"fields":[]}', 50000, 5000, 45000, null, TEST_TIMESTAMP, TEST_TIMESTAMP);
    });

    it('should delete net worth entry', () => {
      const result = db.prepare('DELETE FROM net_worth_entry WHERE id = ?').run('nw-1');

      expect(result.changes).toBe(1);

      const entry = db.prepare('SELECT * FROM net_worth_entry WHERE id = ?').get('nw-1');
      expect(entry).toBeUndefined();
    });

    it('should return 0 changes for non-existent entry', () => {
      const result = db.prepare('DELETE FROM net_worth_entry WHERE id = ?').run('non-existent');
      expect(result.changes).toBe(0);
    });
  });

  describe('JSON Data Parsing', () => {
    it('should store and retrieve complex assets data', () => {
      const assetsData = {
        fields: [
          { name: 'Bank Account', value: 25000 },
          { name: 'Investment', value: 50000 },
          { name: 'Property', value: 300000 },
        ],
      };

      db.prepare(`
        INSERT INTO net_worth_entry (id, recorded_at, assets_data, liabilities_data, total_assets, total_liabilities, net_worth, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('nw-1', '2025-01-15', JSON.stringify(assetsData), '{"fields":[]}', 375000, 0, 375000, null, TEST_TIMESTAMP, TEST_TIMESTAMP);

      const entry = db.prepare('SELECT assets_data FROM net_worth_entry WHERE id = ?').get('nw-1') as { assets_data: string };
      const parsed = JSON.parse(entry.assets_data);

      expect(parsed.fields).toHaveLength(3);
      expect(parsed.fields[0].name).toBe('Bank Account');
      expect(parsed.fields[2].value).toBe(300000);
    });
  });
});

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
          total_liquid_assets: 0,
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
          total_liquid_assets: 0,
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
          total_liquid_assets: 0,
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
          total_assets: 100000, total_liabilities: 0, net_worth: 100000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-03-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 104000, total_liabilities: 0, net_worth: 104000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
        { id: '3', recorded_at: '2024-05-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 108000, total_liabilities: 0, net_worth: 108000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
        { id: '4', recorded_at: '2024-07-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 112000, total_liabilities: 0, net_worth: 112000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
      ];

      const result = calculateNetWorthProjection(entries);

      expect(result).not.toBeNull();
      expect(result!.slope).toBeGreaterThan(0); // Positive growth
      expect(result!.rSquared).toBeGreaterThan(0.99); // Near-perfect linear fit
    });

    it('should handle negative net worth values', () => {
      const entries = [
        { id: '1', recorded_at: '2024-01-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 50000, total_liabilities: 100000, net_worth: -50000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-06-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 60000, total_liabilities: 90000, net_worth: -30000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
      ];

      const result = calculateNetWorthProjection(entries);

      expect(result).not.toBeNull();
      expect(result!.slope).toBeGreaterThan(0); // Net worth is improving (less negative)
    });

    it('should handle declining net worth', () => {
      const entries = [
        { id: '1', recorded_at: '2024-01-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 100000, total_liabilities: 0, net_worth: 100000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-06-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 80000, total_liabilities: 0, net_worth: 80000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
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
          total_assets: 100, total_liabilities: 0, net_worth: 100, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
      ];
      expect(generateProjectionPoints(entries)).toEqual([]);
    });

    it('should generate quarterly projections for 5 years', () => {
      const entries = [
        { id: '1', recorded_at: '2024-01-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 100000, total_liabilities: 0, net_worth: 100000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-07-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 110000, total_liabilities: 0, net_worth: 110000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
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
          total_assets: 100000, total_liabilities: 0, net_worth: 100000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-07-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 120000, total_liabilities: 0, net_worth: 120000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
      ];

      const projections = generateProjectionPoints(entries, 5);

      // Net worth should be increasing
      expect(projections[projections.length - 1].netWorth).toBeGreaterThan(projections[0].netWorth);
    });

    it('should project decreasing net worth for negative growth', () => {
      const entries = [
        { id: '1', recorded_at: '2024-01-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 100000, total_liabilities: 0, net_worth: 100000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-07-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 80000, total_liabilities: 0, net_worth: 80000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
      ];

      const projections = generateProjectionPoints(entries, 5);

      // Net worth should be decreasing
      expect(projections[projections.length - 1].netWorth).toBeLessThan(projections[0].netWorth);
    });

    it('should generate less projections for shorter periods', () => {
      const entries = [
        { id: '1', recorded_at: '2024-01-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 100000, total_liabilities: 0, net_worth: 100000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
        { id: '2', recorded_at: '2024-07-01', assets: { fields: [] }, liabilities: { fields: [] },
          total_assets: 110000, total_liabilities: 0, net_worth: 110000, total_liquid_assets: 0, notes: null, created_at: '', updated_at: '' },
      ];

      const projections2Years = generateProjectionPoints(entries, 2);
      const projections1Year = generateProjectionPoints(entries, 1);

      // 2 years = 8 quarters, 1 year = 4 quarters
      expect(projections2Years).toHaveLength(8);
      expect(projections1Year).toHaveLength(4);
    });
  });

  describe('Compound Projection - generateCompoundProjection', () => {
    it('should return empty array for zero liquid assets', () => {
      const result = generateCompoundProjection(0, 0.05, new Date('2024-01-01'), 10);
      expect(result).toEqual([]);
    });

    it('should return empty array for negative liquid assets', () => {
      const result = generateCompoundProjection(-10000, 0.05, new Date('2024-01-01'), 10);
      expect(result).toEqual([]);
    });

    it('should generate quarterly projections for specified years', () => {
      const result = generateCompoundProjection(100000, 0.05, new Date('2024-01-01'), 10);

      // 10 years * 4 quarters = 40 points
      expect(result).toHaveLength(40);
    });

    it('should generate 5 years of projections (20 quarters)', () => {
      const result = generateCompoundProjection(100000, 0.05, new Date('2024-01-01'), 5);
      expect(result).toHaveLength(20);
    });

    it('should generate 20 years of projections (80 quarters)', () => {
      const result = generateCompoundProjection(100000, 0.05, new Date('2024-01-01'), 20);
      expect(result).toHaveLength(80);
    });

    it('should calculate correct compound growth at 5% annual rate', () => {
      const principal = 100000;
      const annualRate = 0.05;
      const years = 10;

      const result = generateCompoundProjection(principal, annualRate, new Date('2024-01-01'), years);

      // After 10 years with 5% annual (quarterly compounding):
      // P * (1 + 0.05/4)^40 = 100000 * 1.0125^40 ≈ 164,361.95
      const finalValue = result[result.length - 1].liquidAssets;
      expect(finalValue).toBeCloseTo(164361.95, 0); // Allow rounding to nearest dollar
    });

    it('should calculate correct compound growth at 3% annual rate', () => {
      const principal = 100000;
      const annualRate = 0.03;
      const years = 10;

      const result = generateCompoundProjection(principal, annualRate, new Date('2024-01-01'), years);

      // P * (1 + 0.03/4)^40 = 100000 * 1.0075^40 ≈ 134,834.86
      const finalValue = result[result.length - 1].liquidAssets;
      expect(finalValue).toBeCloseTo(134834.86, 0);
    });

    it('should calculate correct compound growth at 7% annual rate', () => {
      const principal = 100000;
      const annualRate = 0.07;
      const years = 10;

      const result = generateCompoundProjection(principal, annualRate, new Date('2024-01-01'), years);

      // P * (1 + 0.07/4)^40 = 100000 * 1.0175^40 ≈ 200,159.73
      const finalValue = result[result.length - 1].liquidAssets;
      expect(finalValue).toBeCloseTo(200159.73, 0);
    });

    it('should calculate correct compound growth at 10% annual rate', () => {
      const principal = 100000;
      const annualRate = 0.10;
      const years = 10;

      const result = generateCompoundProjection(principal, annualRate, new Date('2024-01-01'), years);

      // P * (1 + 0.10/4)^40 = 100000 * 1.025^40 ≈ 268,506.39
      const finalValue = result[result.length - 1].liquidAssets;
      expect(finalValue).toBeCloseTo(268506.39, 0);
    });

    it('should have increasing values at each quarter', () => {
      const result = generateCompoundProjection(100000, 0.05, new Date('2024-01-01'), 5);

      for (let i = 1; i < result.length; i++) {
        expect(result[i].liquidAssets).toBeGreaterThan(result[i - 1].liquidAssets);
      }
    });

    it('should have correctly formatted dates', () => {
      const startDate = new Date('2024-01-01');
      const result = generateCompoundProjection(100000, 0.05, startDate, 2);

      // First projection should be 3 months (1 quarter) after start
      expect(result[0].date).toBe('2024-04-01');
      // Second projection should be 6 months after start
      expect(result[1].date).toBe('2024-07-01');
      // Third projection should be 9 months after start
      expect(result[2].date).toBe('2024-10-01');
      // Fourth projection should be 12 months after start
      expect(result[3].date).toBe('2025-01-01');
    });

    it('should return values rounded to 2 decimal places', () => {
      const result = generateCompoundProjection(100000, 0.05, new Date('2024-01-01'), 1);

      result.forEach(p => {
        // Check that value has at most 2 decimal places
        const decimalPart = p.liquidAssets.toString().split('.')[1];
        if (decimalPart) {
          expect(decimalPart.length).toBeLessThanOrEqual(2);
        }
      });
    });
  });

  describe('Historical CAGR - calculateHistoricalCAGR', () => {
    const makeEntry = (recordedAt: string, liquidAssets: number) => ({
      id: recordedAt,
      recorded_at: recordedAt,
      assets: { fields: [] },
      liabilities: { fields: [] },
      total_assets: liquidAssets,
      total_liabilities: 0,
      total_liquid_assets: liquidAssets,
      net_worth: liquidAssets,
      notes: null,
      created_at: '',
      updated_at: '',
    });

    it('should return null for empty array', () => {
      expect(calculateHistoricalCAGR([])).toBeNull();
    });

    it('should return null for single entry', () => {
      const entries = [makeEntry('2024-01-01', 100000)];
      expect(calculateHistoricalCAGR(entries)).toBeNull();
    });

    it('should return null for insufficient time elapsed (< 0.1 years)', () => {
      const entries = [
        makeEntry('2024-01-01', 100000),
        makeEntry('2024-01-15', 101000), // Only 2 weeks apart
      ];
      expect(calculateHistoricalCAGR(entries)).toBeNull();
    });

    it('should return null when no entries have liquid assets', () => {
      const entries = [
        { ...makeEntry('2024-01-01', 0), total_liquid_assets: 0 },
        { ...makeEntry('2024-07-01', 0), total_liquid_assets: 0 },
      ];
      expect(calculateHistoricalCAGR(entries)).toBeNull();
    });

    it('should calculate positive CAGR for growth', () => {
      const entries = [
        makeEntry('2024-01-01', 100000),
        makeEntry('2025-01-01', 108000), // 8% growth over 1 year
      ];

      const cagr = calculateHistoricalCAGR(entries);

      expect(cagr).not.toBeNull();
      expect(cagr).toBeCloseTo(0.08, 2); // ~8% annual growth
    });

    it('should calculate negative CAGR for decline', () => {
      const entries = [
        makeEntry('2024-01-01', 100000),
        makeEntry('2025-01-01', 90000), // 10% decline over 1 year
      ];

      const cagr = calculateHistoricalCAGR(entries);

      expect(cagr).not.toBeNull();
      expect(cagr).toBeCloseTo(-0.10, 2); // ~-10% annual growth
    });

    it('should calculate CAGR correctly over multiple years', () => {
      // $100k growing to $121k over 2 years = ~10% CAGR
      // CAGR = (121000/100000)^(1/2) - 1 = 1.1 - 1 = 0.10
      const entries = [
        makeEntry('2024-01-01', 100000),
        makeEntry('2026-01-01', 121000),
      ];

      const cagr = calculateHistoricalCAGR(entries);

      expect(cagr).not.toBeNull();
      expect(cagr).toBeCloseTo(0.10, 2);
    });

    it('should calculate CAGR with intermediate data points', () => {
      // Uses first and last entry only for calculation
      const entries = [
        makeEntry('2024-01-01', 100000),
        makeEntry('2024-06-01', 103000), // Intermediate point (ignored)
        makeEntry('2024-09-01', 106000), // Intermediate point (ignored)
        makeEntry('2025-01-01', 110000), // ~10% growth from first to last
      ];

      const cagr = calculateHistoricalCAGR(entries);

      expect(cagr).not.toBeNull();
      expect(cagr).toBeCloseTo(0.10, 2);
    });

    it('should skip entries with zero liquid assets when finding first/last', () => {
      const entries = [
        { ...makeEntry('2024-01-01', 0), total_liquid_assets: 0 }, // Skipped - no liquid
        makeEntry('2024-03-01', 100000), // First valid
        makeEntry('2025-03-01', 105000), // Last valid
        { ...makeEntry('2025-06-01', 0), total_liquid_assets: 0 }, // Skipped - no liquid
      ];

      const cagr = calculateHistoricalCAGR(entries);

      expect(cagr).not.toBeNull();
      expect(cagr).toBeCloseTo(0.05, 2); // 5% growth over 1 year
    });

    it('should clamp extremely high growth rates', () => {
      // 10x growth in 1 year = 900% = clamped to 100%
      const entries = [
        makeEntry('2024-01-01', 10000),
        makeEntry('2025-01-01', 100000),
      ];

      const cagr = calculateHistoricalCAGR(entries);

      expect(cagr).not.toBeNull();
      expect(cagr).toBeLessThanOrEqual(1.0); // Clamped to max 100%
    });

    it('should clamp extremely negative growth rates', () => {
      // 80% decline in 1 year = clamped to -50%
      const entries = [
        makeEntry('2024-01-01', 100000),
        makeEntry('2025-01-01', 20000),
      ];

      const cagr = calculateHistoricalCAGR(entries);

      expect(cagr).not.toBeNull();
      expect(cagr).toBeGreaterThanOrEqual(-0.5); // Clamped to min -50%
    });
  });
});
