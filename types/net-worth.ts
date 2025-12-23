// Net Worth types for tracking financial position over time

/**
 * Default asset field labels
 * Users can customize these labels when recording
 */
export const DEFAULT_ASSET_FIELDS = [
  { key: 'home', label: 'Home (at purchase)' },
  { key: 'car', label: 'Car (current value)' },
  { key: 'stocks1', label: 'Stocks 1' },
  { key: 'stocks2', label: 'Stocks 2' },
  { key: 'super1', label: 'Superannuation 1' },
  { key: 'super2', label: 'Superannuation 2' },
  { key: 'cash', label: 'Cash' },
  { key: 'offset', label: 'Offset' },
  { key: 'asset1', label: 'Asset 1' },
  { key: 'asset2', label: 'Asset 2' },
  { key: 'asset3', label: 'Asset 3' },
  { key: 'asset4', label: 'Asset 4' },
] as const;

/**
 * Default liability field labels
 * Users can customize these labels when recording
 */
export const DEFAULT_LIABILITY_FIELDS = [
  { key: 'mortgage', label: 'Mortgage' },
  { key: 'creditCard', label: 'Credit Card Debt' },
  { key: 'carLoan', label: 'Car Loan' },
  { key: 'debt1', label: 'Debt 1' },
  { key: 'debt2', label: 'Debt 2' },
  { key: 'debt3', label: 'Debt 3' },
  { key: 'debt4', label: 'Debt 4' },
] as const;

/**
 * A single field value with customizable label
 */
export interface NetWorthField {
  key: string;
  label: string;
  value: number;
}

/**
 * JSON structure stored in assets_data column
 */
export interface AssetsData {
  fields: NetWorthField[];
}

/**
 * JSON structure stored in liabilities_data column
 */
export interface LiabilitiesData {
  fields: NetWorthField[];
}

/**
 * Database model for net_worth_entry table
 */
export interface NetWorthEntry {
  id: string;
  recorded_at: string; // Date of the snapshot (YYYY-MM-DD)
  assets_data: string; // JSON string of AssetsData
  liabilities_data: string; // JSON string of LiabilitiesData
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Parsed net worth entry with deserialized JSON
 */
export interface NetWorthEntryParsed {
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

/**
 * Input for creating a new net worth entry
 */
export interface CreateNetWorthInput {
  recorded_at: string;
  assets: AssetsData;
  liabilities: LiabilitiesData;
  notes?: string | null;
}

/**
 * Input for updating an existing net worth entry
 */
export interface UpdateNetWorthInput {
  recorded_at?: string;
  assets?: AssetsData;
  liabilities?: LiabilitiesData;
  notes?: string | null;
}

/**
 * Data point for net worth chart
 */
export interface NetWorthChartPoint {
  date: string;
  dateLabel: string;
  netWorth: number;
  totalAssets: number;
  totalLiabilities: number;
  isProjection?: boolean;
}

/**
 * Linear regression result for projection
 */
export interface LinearRegression {
  slope: number;
  intercept: number;
  rSquared: number;
}

