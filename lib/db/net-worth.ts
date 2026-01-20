// Net Worth database operations

import { getDatabase } from './index';
import type {
  NetWorthEntry,
  NetWorthEntryParsed,
  CreateNetWorthInput,
  UpdateNetWorthInput,
  AssetsData,
  LiabilitiesData,
} from '@/types/net-worth';

/**
 * Calculate total from fields array
 */
function calculateTotal(data: AssetsData | LiabilitiesData): number {
  return data.fields.reduce((sum, field) => sum + (field.value || 0), 0);
}

/**
 * Calculate total of liquid assets only
 */
function calculateLiquidTotal(data: AssetsData): number {
  return data.fields
    .filter(field => field.isLiquid === true)
    .reduce((sum, field) => sum + (field.value || 0), 0);
}

/**
 * Parse a raw database entry into a parsed entry with deserialized JSON
 */
function parseEntry(entry: NetWorthEntry): NetWorthEntryParsed {
  try {
    const assets = JSON.parse(entry.assets_data) as AssetsData;
    const liabilities = JSON.parse(entry.liabilities_data) as LiabilitiesData;

    return {
      id: entry.id,
      recorded_at: entry.recorded_at,
      assets,
      liabilities,
      total_assets: entry.total_assets,
      total_liabilities: entry.total_liabilities,
      total_liquid_assets: calculateLiquidTotal(assets),
      net_worth: entry.net_worth,
      notes: entry.notes,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
    };
  } catch (e) {
    console.error(`Failed to parse net worth entry ${entry.id}:`, e);
    throw new Error(`Corrupted net worth entry data: ${entry.id}`);
  }
}

/**
 * Get all net worth entries ordered by recorded date (newest first)
 */
export function getAllNetWorthEntries(): NetWorthEntryParsed[] {
  const db = getDatabase();

  const entries = db.prepare(`
    SELECT * FROM net_worth_entry
    ORDER BY recorded_at DESC
  `).all() as NetWorthEntry[];

  return entries.map(parseEntry);
}

/**
 * Get all entries ordered by date ascending (for charting)
 */
export function getNetWorthEntriesForChart(): NetWorthEntryParsed[] {
  const db = getDatabase();

  const entries = db.prepare(`
    SELECT * FROM net_worth_entry
    ORDER BY recorded_at ASC
  `).all() as NetWorthEntry[];

  return entries.map(parseEntry);
}

/**
 * Get a single net worth entry by ID
 */
export function getNetWorthEntryById(id: string): NetWorthEntryParsed | null {
  const db = getDatabase();

  const entry = db.prepare(`
    SELECT * FROM net_worth_entry WHERE id = ?
  `).get(id) as NetWorthEntry | undefined;

  if (!entry) return null;

  return parseEntry(entry);
}

/**
 * Create a new net worth entry
 */
export function createNetWorthEntry(input: CreateNetWorthInput): NetWorthEntryParsed {
  const db = getDatabase();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const totalAssets = calculateTotal(input.assets);
  const totalLiabilities = calculateTotal(input.liabilities);
  const netWorth = totalAssets - totalLiabilities;

  db.prepare(`
    INSERT INTO net_worth_entry (
      id, recorded_at, assets_data, liabilities_data,
      total_assets, total_liabilities, net_worth, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.recorded_at,
    JSON.stringify(input.assets),
    JSON.stringify(input.liabilities),
    totalAssets,
    totalLiabilities,
    netWorth,
    input.notes || null,
    now,
    now
  );

  // Entry was just inserted, so it must exist (unless concurrent delete which is unlikely)
  const created = getNetWorthEntryById(id);
  if (!created) {
    throw new Error(`Failed to retrieve newly created net worth entry: ${id}`);
  }
  return created;
}

/**
 * Update an existing net worth entry
 */
export function updateNetWorthEntry(
  id: string,
  input: UpdateNetWorthInput
): NetWorthEntryParsed | null {
  const db = getDatabase();
  const now = new Date().toISOString();

  // Get existing entry
  const existing = getNetWorthEntryById(id);
  if (!existing) return null;

  // Merge with updates
  const assets = input.assets || existing.assets;
  const liabilities = input.liabilities || existing.liabilities;
  const recordedAt = input.recorded_at || existing.recorded_at;
  const notes = input.notes !== undefined ? input.notes : existing.notes;

  const totalAssets = calculateTotal(assets);
  const totalLiabilities = calculateTotal(liabilities);
  const netWorth = totalAssets - totalLiabilities;

  db.prepare(`
    UPDATE net_worth_entry SET
      recorded_at = ?,
      assets_data = ?,
      liabilities_data = ?,
      total_assets = ?,
      total_liabilities = ?,
      net_worth = ?,
      notes = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    recordedAt,
    JSON.stringify(assets),
    JSON.stringify(liabilities),
    totalAssets,
    totalLiabilities,
    netWorth,
    notes,
    now,
    id
  );

  return getNetWorthEntryById(id);
}

/**
 * Delete a net worth entry
 */
export function deleteNetWorthEntry(id: string): boolean {
  const db = getDatabase();

  const result = db.prepare(`
    DELETE FROM net_worth_entry WHERE id = ?
  `).run(id);

  return result.changes > 0;
}

/**
 * Get the most recent net worth entry
 */
export function getLatestNetWorthEntry(): NetWorthEntryParsed | null {
  const db = getDatabase();

  const entry = db.prepare(`
    SELECT * FROM net_worth_entry
    ORDER BY recorded_at DESC
    LIMIT 1
  `).get() as NetWorthEntry | undefined;

  if (!entry) return null;

  return parseEntry(entry);
}

/**
 * Calculate linear regression for net worth projection
 * Returns null if less than 2 data points
 */
export function calculateNetWorthProjection(entries: NetWorthEntryParsed[]): {
  slope: number;
  intercept: number;
  rSquared: number;
} | null {
  if (entries.length < 2) return null;

  // Convert dates to numeric values (days since first entry)
  const firstDate = new Date(entries[0].recorded_at).getTime();
  const points = entries.map(e => ({
    x: (new Date(e.recorded_at).getTime() - firstDate) / (1000 * 60 * 60 * 24), // Days
    y: e.net_worth,
  }));

  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
  const sumYY = points.reduce((sum, p) => sum + p.y * p.y, 0);

  // Calculate slope and intercept
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R-squared
  const meanY = sumY / n;
  const ssTotal = sumYY - n * meanY * meanY;
  const ssResidual = points.reduce((sum, p) => {
    const predicted = slope * p.x + intercept;
    return sum + Math.pow(p.y - predicted, 2);
  }, 0);

  const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope, intercept, rSquared };
}

/**
 * Generate projected data points for the next N years
 */
export function generateProjectionPoints(
  entries: NetWorthEntryParsed[],
  yearsAhead: number = 5
): Array<{ date: string; netWorth: number }> {
  const regression = calculateNetWorthProjection(entries);
  if (!regression || entries.length < 2) return [];

  const firstDate = new Date(entries[0].recorded_at).getTime();
  const lastEntry = entries[entries.length - 1];
  const lastDate = new Date(lastEntry.recorded_at);

  const projections: Array<{ date: string; netWorth: number }> = [];

  // Generate quarterly projections for the next N years
  for (let quarter = 1; quarter <= yearsAhead * 4; quarter++) {
    const projectionDate = new Date(lastDate);
    projectionDate.setMonth(projectionDate.getMonth() + quarter * 3);

    const daysSinceFirst = (projectionDate.getTime() - firstDate) / (1000 * 60 * 60 * 24);
    const projectedNetWorth = regression.slope * daysSinceFirst + regression.intercept;

    projections.push({
      date: projectionDate.toISOString().split('T')[0],
      netWorth: Math.round(projectedNetWorth * 100) / 100,
    });
  }

  return projections;
}

/**
 * Generate compound growth projection points from liquid assets
 * Uses quarterly compounding: liquidAssets × (1 + rate/4)^quarters
 *
 * @param liquidAssets Starting liquid assets value
 * @param annualRate Annual growth rate (e.g., 0.05 for 5%)
 * @param startDate Date to start projection from
 * @param yearsAhead Number of years to project (default 10)
 * @returns Array of projected data points with date and liquid asset value
 */
export function generateCompoundProjection(
  liquidAssets: number,
  annualRate: number,
  startDate: Date,
  yearsAhead: number = 10
): Array<{ date: string; liquidAssets: number }> {
  if (liquidAssets <= 0) return [];

  const quarterlyRate = annualRate / 4;
  const totalQuarters = yearsAhead * 4;
  const projections: Array<{ date: string; liquidAssets: number }> = [];

  for (let quarter = 1; quarter <= totalQuarters; quarter++) {
    const projectionDate = new Date(startDate);
    projectionDate.setMonth(projectionDate.getMonth() + quarter * 3);

    // Compound growth formula: P × (1 + r)^n
    const projectedValue = liquidAssets * Math.pow(1 + quarterlyRate, quarter);

    projections.push({
      date: projectionDate.toISOString().split('T')[0],
      liquidAssets: Math.round(projectedValue * 100) / 100,
    });
  }

  return projections;
}

