// SQLite Database Schema for Puffin

export const SCHEMA_SQL = `
-- Local User table for authentication
CREATE TABLE IF NOT EXISTS local_user (
  id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Upper Categories (predefined types)
CREATE TABLE IF NOT EXISTS upper_category (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'saving', 'bill', 'debt', 'sinking', 'transfer')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sub Categories (user-created under upper categories)
CREATE TABLE IF NOT EXISTS sub_category (
  id TEXT PRIMARY KEY,
  upper_category_id TEXT NOT NULL REFERENCES upper_category(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sources (for tracking transaction origin, e.g., Bendigo, Maxxia)
CREATE TABLE IF NOT EXISTS source (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Transactions
CREATE TABLE IF NOT EXISTS "transaction" (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  notes TEXT,
  sub_category_id TEXT REFERENCES sub_category(id),
  source_id TEXT REFERENCES source(id),
  is_split INTEGER NOT NULL DEFAULT 0,
  parent_transaction_id TEXT REFERENCES "transaction"(id),
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Budgets
CREATE TABLE IF NOT EXISTS budget (
  id TEXT PRIMARY KEY,
  sub_category_id TEXT NOT NULL REFERENCES sub_category(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(sub_category_id, year, month)
);

-- Budget Templates
CREATE TABLE IF NOT EXISTS budget_template (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  template_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Auto-categorization rules
CREATE TABLE IF NOT EXISTS auto_category_rule (
  id TEXT PRIMARY KEY,
  match_text TEXT NOT NULL,
  sub_category_id TEXT NOT NULL REFERENCES sub_category(id),
  priority INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  match_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Sync log for Google Drive operations
CREATE TABLE IF NOT EXISTS sync_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('push', 'pull')),
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'in_progress')),
  file_name TEXT,
  file_size INTEGER,
  error_message TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Net Worth entries for tracking financial position over time
CREATE TABLE IF NOT EXISTS net_worth_entry (
  id TEXT PRIMARY KEY,
  recorded_at TEXT NOT NULL,
  assets_data TEXT NOT NULL,
  liabilities_data TEXT NOT NULL,
  total_assets REAL NOT NULL,
  total_liabilities REAL NOT NULL,
  net_worth REAL NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transaction_date ON "transaction"(date);
CREATE INDEX IF NOT EXISTS idx_transaction_sub_category ON "transaction"(sub_category_id);
CREATE INDEX IF NOT EXISTS idx_transaction_source ON "transaction"(source_id);
CREATE INDEX IF NOT EXISTS idx_transaction_parent ON "transaction"(parent_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transaction_deleted ON "transaction"(is_deleted);
CREATE INDEX IF NOT EXISTS idx_sub_category_upper ON sub_category(upper_category_id);
CREATE INDEX IF NOT EXISTS idx_budget_period ON budget(year, month);
CREATE INDEX IF NOT EXISTS idx_auto_rule_priority ON auto_category_rule(priority);
CREATE INDEX IF NOT EXISTS idx_sync_log_action ON sync_log(action, started_at);
CREATE INDEX IF NOT EXISTS idx_net_worth_recorded_at ON net_worth_entry(recorded_at);
`;

// Default upper categories to seed
export const DEFAULT_UPPER_CATEGORIES = [
  { id: 'income', name: 'Income', type: 'income', sort_order: 1 },
  { id: 'expense', name: 'Expense', type: 'expense', sort_order: 2 },
  { id: 'saving', name: 'Saving', type: 'saving', sort_order: 3 },
  { id: 'bill', name: 'Bill', type: 'bill', sort_order: 4 },
  { id: 'debt', name: 'Debt', type: 'debt', sort_order: 5 },
  { id: 'sinking', name: 'Sinking Funds', type: 'sinking', sort_order: 6 },
  { id: 'transfer', name: 'Transfer', type: 'transfer', sort_order: 7 },
] as const;

export const SEED_SQL = `
-- Seed default upper categories
INSERT OR IGNORE INTO upper_category (id, name, type, sort_order) VALUES
  ('income', 'Income', 'income', 1),
  ('expense', 'Expense', 'expense', 2),
  ('saving', 'Saving', 'saving', 3),
  ('bill', 'Bill', 'bill', 4),
  ('debt', 'Debt', 'debt', 5),
  ('sinking', 'Sinking Funds', 'sinking', 6),
  ('transfer', 'Transfer', 'transfer', 7);
`;



