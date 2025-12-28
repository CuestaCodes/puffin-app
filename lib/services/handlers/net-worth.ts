/**
 * Tauri Handler: Net Worth
 *
 * Handles net worth entry operations in Tauri mode.
 * Mirrors the functionality of /api/net-worth/* routes.
 */

import * as db from '../tauri-db';

interface NetWorthEntry {
  id: string;
  recorded_at: string;
  assets_data: string;
  liabilities_data: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface NetWorthField {
  key: string;
  label: string;
  value: number;
}

interface AssetsData {
  fields: NetWorthField[];
}

interface LiabilitiesData {
  fields: NetWorthField[];
}

interface NetWorthEntryParsed {
  id: string;
  recorded_at: string;
  assets: AssetsData;
  liabilities: LiabilitiesData;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface HandlerContext {
  method: string;
  body?: unknown;
  params: Record<string, string>;
  path: string;
}

/**
 * Calculate total from fields array
 */
function calculateTotal(data: AssetsData | LiabilitiesData): number {
  return data.fields.reduce((sum, field) => sum + (field.value || 0), 0);
}

/**
 * Parse a raw database entry into a parsed entry with deserialized JSON
 */
function parseEntry(entry: NetWorthEntry): NetWorthEntryParsed {
  return {
    id: entry.id,
    recorded_at: entry.recorded_at,
    assets: JSON.parse(entry.assets_data) as AssetsData,
    liabilities: JSON.parse(entry.liabilities_data) as LiabilitiesData,
    total_assets: entry.total_assets,
    total_liabilities: entry.total_liabilities,
    net_worth: entry.net_worth,
    notes: entry.notes,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
  };
}

/**
 * Calculate linear regression for net worth projection
 */
function calculateNetWorthProjection(entries: NetWorthEntryParsed[]): {
  slope: number;
  intercept: number;
  rSquared: number;
} | null {
  if (entries.length < 2) return null;

  const firstDate = new Date(entries[0].recorded_at).getTime();
  const points = entries.map(e => ({
    x: (new Date(e.recorded_at).getTime() - firstDate) / (1000 * 60 * 60 * 24),
    y: e.net_worth,
  }));

  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = points.reduce((sum, p) => sum + p.x * p.x, 0);
  const sumYY = points.reduce((sum, p) => sum + p.y * p.y, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

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
function generateProjectionPoints(
  entries: NetWorthEntryParsed[],
  yearsAhead: number = 5
): Array<{ date: string; netWorth: number }> {
  const regression = calculateNetWorthProjection(entries);
  if (!regression || entries.length < 2) return [];

  const firstDate = new Date(entries[0].recorded_at).getTime();
  const lastEntry = entries[entries.length - 1];
  const lastDate = new Date(lastEntry.recorded_at);

  const projections: Array<{ date: string; netWorth: number }> = [];

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
 * Main net worth handler - /api/net-worth
 */
export async function handleNetWorth(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;

  switch (method) {
    case 'GET':
      return getNetWorthEntries(params);
    case 'POST':
      return createNetWorthEntry(body as {
        recorded_at: string;
        assets: AssetsData;
        liabilities: LiabilitiesData;
        notes?: string | null;
      });
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Single net worth entry handler - /api/net-worth/[id]
 */
export async function handleNetWorthEntry(ctx: HandlerContext): Promise<unknown> {
  const { method, body, params } = ctx;
  const id = params.id;

  if (!id) {
    throw new Error('Net worth entry ID required');
  }

  switch (method) {
    case 'GET':
      return getNetWorthEntryById(id);
    case 'PUT':
      return updateNetWorthEntry(id, body as {
        recorded_at?: string;
        assets?: AssetsData;
        liabilities?: LiabilitiesData;
        notes?: string | null;
      });
    case 'DELETE':
      return deleteNetWorthEntry(id);
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Get all net worth entries, optionally for charting
 */
async function getNetWorthEntries(params: Record<string, string>): Promise<unknown> {
  const forChart = params.chart === 'true';

  if (forChart) {
    const entries = await db.query<NetWorthEntry>(
      'SELECT * FROM net_worth_entry ORDER BY recorded_at ASC'
    );
    const parsedEntries = entries.map(parseEntry);
    const projection = calculateNetWorthProjection(parsedEntries);
    const projectionPoints = generateProjectionPoints(parsedEntries, 5);

    return {
      entries: parsedEntries,
      projection,
      projectionPoints,
    };
  }

  const entries = await db.query<NetWorthEntry>(
    'SELECT * FROM net_worth_entry ORDER BY recorded_at DESC'
  );
  return entries.map(parseEntry);
}

/**
 * Get a single net worth entry by ID
 */
async function getNetWorthEntryById(id: string): Promise<NetWorthEntryParsed | null> {
  const entry = await db.queryOne<NetWorthEntry>(
    'SELECT * FROM net_worth_entry WHERE id = ?',
    [id]
  );

  if (!entry) return null;
  return parseEntry(entry);
}

/**
 * Create a new net worth entry
 */
async function createNetWorthEntry(data: {
  recorded_at: string;
  assets: AssetsData;
  liabilities: LiabilitiesData;
  notes?: string | null;
}): Promise<NetWorthEntryParsed> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const totalAssets = calculateTotal(data.assets);
  const totalLiabilities = calculateTotal(data.liabilities);
  const netWorth = totalAssets - totalLiabilities;

  await db.execute(
    `INSERT INTO net_worth_entry (
      id, recorded_at, assets_data, liabilities_data,
      total_assets, total_liabilities, net_worth, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.recorded_at,
      JSON.stringify(data.assets),
      JSON.stringify(data.liabilities),
      totalAssets,
      totalLiabilities,
      netWorth,
      data.notes || null,
      now,
      now,
    ]
  );

  const entry = await getNetWorthEntryById(id);
  if (!entry) {
    throw new Error('Failed to create net worth entry');
  }
  return entry;
}

/**
 * Update an existing net worth entry
 */
async function updateNetWorthEntry(
  id: string,
  data: {
    recorded_at?: string;
    assets?: AssetsData;
    liabilities?: LiabilitiesData;
    notes?: string | null;
  }
): Promise<NetWorthEntryParsed | null> {
  const existing = await getNetWorthEntryById(id);
  if (!existing) return null;

  const assets = data.assets || existing.assets;
  const liabilities = data.liabilities || existing.liabilities;
  const recordedAt = data.recorded_at || existing.recorded_at;
  const notes = data.notes !== undefined ? data.notes : existing.notes;

  const totalAssets = calculateTotal(assets);
  const totalLiabilities = calculateTotal(liabilities);
  const netWorth = totalAssets - totalLiabilities;

  await db.execute(
    `UPDATE net_worth_entry SET
      recorded_at = ?,
      assets_data = ?,
      liabilities_data = ?,
      total_assets = ?,
      total_liabilities = ?,
      net_worth = ?,
      notes = ?,
      updated_at = ?
    WHERE id = ?`,
    [
      recordedAt,
      JSON.stringify(assets),
      JSON.stringify(liabilities),
      totalAssets,
      totalLiabilities,
      netWorth,
      notes,
      new Date().toISOString(),
      id,
    ]
  );

  return getNetWorthEntryById(id);
}

/**
 * Delete a net worth entry
 */
async function deleteNetWorthEntry(id: string): Promise<{ success: boolean }> {
  await db.execute('DELETE FROM net_worth_entry WHERE id = ?', [id]);
  return { success: true };
}
