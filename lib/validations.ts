// Zod validation schemas for Puffin
import { z } from 'zod';

// UUID pattern for validation
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Date string pattern (YYYY-MM-DD)
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

// Transaction schemas
export const createTransactionSchema = z.object({
  date: z.string().regex(datePattern, 'Date must be in YYYY-MM-DD format'),
  description: z.string().min(1, 'Description is required').max(500, 'Description too long'),
  amount: z.number().refine(val => val !== 0, 'Amount cannot be zero'),
  notes: z.string().max(1000, 'Notes too long').nullable().optional(),
  sub_category_id: z.string().regex(uuidPattern, 'Invalid category ID').nullable().optional(),
  source_id: z.string().regex(uuidPattern, 'Invalid source ID').nullable().optional(),
});

export const updateTransactionSchema = z.object({
  date: z.string().regex(datePattern, 'Date must be in YYYY-MM-DD format').optional(),
  description: z.string().min(1, 'Description is required').max(500, 'Description too long').optional(),
  amount: z.number().refine(val => val !== 0, 'Amount cannot be zero').optional(),
  notes: z.string().max(1000, 'Notes too long').nullable().optional(),
  sub_category_id: z.string().regex(uuidPattern, 'Invalid category ID').nullable().optional(),
  source_id: z.string().regex(uuidPattern, 'Invalid source ID').nullable().optional(),
});

export const splitTransactionSchema = z.object({
  splits: z.array(z.object({
    amount: z.number().refine(val => val !== 0, 'Split amount cannot be zero'),
    sub_category_id: z.string().regex(uuidPattern, 'Invalid category ID').nullable().optional(),
    description: z.string().max(500).optional(),
  })).min(2, 'Must have at least 2 splits').max(5, 'Maximum 5 splits allowed'),
});

// Category schemas
export const createSubCategorySchema = z.object({
  upper_category_id: z.enum(['income', 'expense', 'saving', 'bill', 'debt', 'sinking', 'transfer']),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
});

export const updateSubCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const updateUpperCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
});

// Budget schemas
export const createBudgetSchema = z.object({
  sub_category_id: z.string().uuid('Invalid category ID'),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  amount: z.number().min(0, 'Budget amount must be positive'),
});

export const updateBudgetSchema = z.object({
  amount: z.number().min(0, 'Budget amount must be positive'),
});

// Auto-categorization rule schemas
export const createAutoRuleSchema = z.object({
  match_text: z.string().min(1, 'Match text is required').max(200, 'Match text too long'),
  sub_category_id: z.string().regex(uuidPattern, 'Invalid category ID'),
  add_to_top: z.boolean().optional(),
});

export const updateAutoRuleSchema = z.object({
  match_text: z.string().min(1, 'Match text is required').max(200, 'Match text too long').optional(),
  sub_category_id: z.string().regex(uuidPattern, 'Invalid category ID').optional(),
  priority: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

export const reorderRulesSchema = z.object({
  ruleIds: z.array(z.string().regex(uuidPattern, 'Invalid rule ID')),
});

// PIN validation helper
const pinValidation = z.string()
  .length(6, 'PIN must be exactly 6 digits')
  .regex(/^\d{6}$/, 'PIN must contain only digits');

// Auth schemas (6-digit PIN)
// Note: Field names use 'password' for API backward compatibility with use-auth.tsx
export const setupPinSchema = z.object({
  password: pinValidation,
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: 'PINs do not match',
  path: ['confirmPassword'],
});

export const loginPinSchema = z.object({
  password: pinValidation,
});

// Backward-compatible aliases (deprecated, use setupPinSchema/loginPinSchema)
export const setupPasswordSchema = setupPinSchema;
export const loginSchema = loginPinSchema;

// Import schemas
/** Maximum length for notes during import (truncated to this length) */
export const IMPORT_NOTES_MAX_LENGTH = 250;

/** Maximum transactions allowed per import */
export const MAX_IMPORT_TRANSACTIONS = 5000;

export const columnMappingSchema = z.object({
  date: z.number().int().min(0),
  description: z.number().int().min(0),
  amount: z.number().int().min(0),
  notes: z.number().int().min(0).optional(),
  ignore: z.array(z.number().int().min(0)).optional(),
});

export const importOptionsSchema = z.object({
  columnMapping: columnMappingSchema,
  dateFormat: z.enum(['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'auto']),
  skipDuplicates: z.boolean().default(true),
  selectedRows: z.array(z.number().int().min(0)).optional(),
});

// Net Worth schemas
const netWorthFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().max(100),
  value: z.number(),
});

const assetsDataSchema = z.object({
  fields: z.array(netWorthFieldSchema),
});

const liabilitiesDataSchema = z.object({
  fields: z.array(netWorthFieldSchema),
});

export const createNetWorthSchema = z.object({
  recorded_at: z.string().regex(datePattern, 'Date must be in YYYY-MM-DD format'),
  assets: assetsDataSchema,
  liabilities: liabilitiesDataSchema,
  notes: z.string().max(500, 'Notes too long').nullable().optional(),
});

export const updateNetWorthSchema = z.object({
  recorded_at: z.string().regex(datePattern, 'Date must be in YYYY-MM-DD format').optional(),
  assets: assetsDataSchema.optional(),
  liabilities: liabilitiesDataSchema.optional(),
  notes: z.string().max(500, 'Notes too long').nullable().optional(),
});

// Query filter schemas
export const transactionFilterSchema = z.object({
  startDate: z.string().regex(datePattern).optional(),
  endDate: z.string().regex(datePattern).optional(),
  categoryId: z.string().regex(uuidPattern).optional(),
  upperCategoryId: z.enum(['income', 'expense', 'saving', 'bill', 'debt', 'sinking', 'transfer']).optional(),
  sourceId: z.string().regex(uuidPattern).optional(),
  search: z.string().max(200).optional(),
  minAmount: z.number().optional(),
  maxAmount: z.number().optional(),
  uncategorized: z.boolean().optional(),
  includeDeleted: z.boolean().optional(),
});

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(50),
  sortBy: z.enum(['date', 'amount', 'description', 'created_at']).default('date'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Type exports
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type SplitTransactionInput = z.infer<typeof splitTransactionSchema>;
export type CreateSubCategoryInput = z.infer<typeof createSubCategorySchema>;
export type UpdateSubCategoryInput = z.infer<typeof updateSubCategorySchema>;
export type CreateBudgetInput = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type CreateAutoRuleInput = z.infer<typeof createAutoRuleSchema>;
export type UpdateAutoRuleInput = z.infer<typeof updateAutoRuleSchema>;
export type SetupPinInput = z.infer<typeof setupPinSchema>;
export type LoginPinInput = z.infer<typeof loginPinSchema>;
// Backward-compatible type aliases
export type SetupPasswordInput = SetupPinInput;
export type LoginInput = LoginPinInput;
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;
export type PaginationParams = z.infer<typeof paginationSchema>;
export type CreateNetWorthInput = z.infer<typeof createNetWorthSchema>;
export type UpdateNetWorthInput = z.infer<typeof updateNetWorthSchema>;

