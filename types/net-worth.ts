// Net Worth types for tracking financial position over time

/**
 * Default asset field labels (non-liquid)
 * Users can customize these labels when recording
 */
export const DEFAULT_ASSET_FIELDS = [
  { key: 'home', label: 'Home (at purchase)', isLiquid: false },
  { key: 'car', label: 'Car (current value)', isLiquid: false },
  { key: 'asset1', label: 'Other Asset 1', isLiquid: false },
  { key: 'asset2', label: 'Other Asset 2', isLiquid: false },
] as const;

/**
 * Default liquid asset field labels
 * Liquid assets are used for growth projections
 */
export const DEFAULT_LIQUID_ASSET_FIELDS = [
  { key: 'stocks1', label: 'Stocks 1', isLiquid: true },
  { key: 'stocks2', label: 'Stocks 2', isLiquid: true },
  { key: 'super1', label: 'Superannuation 1', isLiquid: true },
  { key: 'super2', label: 'Superannuation 2', isLiquid: true },
  { key: 'cash', label: 'Cash', isLiquid: true },
  { key: 'offset', label: 'Offset', isLiquid: true },
  { key: 'liquid1', label: 'Liquid Asset 1', isLiquid: true },
  { key: 'liquid2', label: 'Liquid Asset 2', isLiquid: true },
  { key: 'liquid3', label: 'Liquid Asset 3', isLiquid: true },
  { key: 'liquid4', label: 'Liquid Asset 4', isLiquid: true },
] as const;

/**
 * All asset fields combined (for backward compatibility)
 */
export const ALL_ASSET_FIELDS = [...DEFAULT_ASSET_FIELDS, ...DEFAULT_LIQUID_ASSET_FIELDS] as const;

/**
 * Special value to indicate historical CAGR should be used
 * This is a sentinel value that won't conflict with actual rates
 */
export const HISTORICAL_RATE_VALUE = -1;

/**
 * Growth rate option type
 */
export interface GrowthRateOption {
  value: number;
  label: string;
}

/**
 * Fixed growth rate options for projections
 */
export const FIXED_GROWTH_RATE_OPTIONS: GrowthRateOption[] = [
  { value: 0.03, label: '3% (Conservative)' },
  { value: 0.05, label: '5% (Moderate)' },
  { value: 0.07, label: '7% (Growth)' },
  { value: 0.10, label: '10% (Aggressive)' },
];

/**
 * Available growth rate options for projections
 * @deprecated Use FIXED_GROWTH_RATE_OPTIONS and build dynamic options with historical rate
 */
export const GROWTH_RATE_OPTIONS = FIXED_GROWTH_RATE_OPTIONS;

export const DEFAULT_GROWTH_RATE = 0.05;

/**
 * Available projection year options
 */
export const PROJECTION_YEARS_OPTIONS = [
  { value: 5, label: '5 Years' },
  { value: 10, label: '10 Years' },
  { value: 20, label: '20 Years' },
] as const;

export const DEFAULT_PROJECTION_YEARS = 10;

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
  isLiquid?: boolean;
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
  total_liquid_assets: number;
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

