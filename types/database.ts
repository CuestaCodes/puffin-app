// Database type definitions for Puffin personal finance app

export interface LocalUser {
  id: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface UpperCategory {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'saving' | 'bill' | 'debt' | 'transfer';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface SubCategory {
  id: string;
  upper_category_id: string;
  name: string;
  sort_order: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number; // negative for expenses, positive for income
  notes: string | null;
  sub_category_id: string | null;
  is_split: boolean;
  parent_transaction_id: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  sub_category_id: string;
  year: number;
  month: number; // 1-12
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface BudgetTemplate {
  id: string;
  name: string;
  template_data: string; // JSON string of { sub_category_id: amount }
  created_at: string;
  updated_at: string;
}

export interface AutoCategoryRule {
  id: string;
  match_text: string;
  sub_category_id: string;
  priority: number;
  is_active: boolean;
  match_count: number;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: string;
  action: 'push' | 'pull';
  status: 'success' | 'failed' | 'in_progress';
  file_name: string | null;
  file_size: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

// Types for API responses and forms
export interface TransactionWithCategory extends Transaction {
  sub_category_name?: string;
  upper_category_name?: string;
  upper_category_type?: UpperCategory['type'];
}

export interface SubCategoryWithUpper extends SubCategory {
  upper_category_name: string;
  upper_category_type: UpperCategory['type'];
}

export interface BudgetWithCategory extends Budget {
  sub_category_name: string;
  upper_category_name: string;
  upper_category_type: UpperCategory['type'];
  actual_amount?: number;
}

// Input types for creating/updating records
export interface CreateTransactionInput {
  date: string;
  description: string;
  amount: number;
  notes?: string | null;
  sub_category_id?: string | null;
}

export interface UpdateTransactionInput {
  date?: string;
  description?: string;
  amount?: number;
  notes?: string | null;
  sub_category_id?: string | null;
}

export interface CreateSubCategoryInput {
  upper_category_id: string;
  name: string;
}

export interface CreateBudgetInput {
  sub_category_id: string;
  year: number;
  month: number;
  amount: number;
}

export interface CreateAutoRuleInput {
  match_text: string;
  sub_category_id: string;
}



