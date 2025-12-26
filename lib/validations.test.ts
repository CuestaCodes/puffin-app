/**
 * Tests for Zod validation schemas
 * 
 * These tests verify all validation schemas used across the application
 */

import { describe, it, expect } from 'vitest';
import {
  createTransactionSchema,
  updateTransactionSchema,
  splitTransactionSchema,
  createSubCategorySchema,
  updateSubCategorySchema,
  updateUpperCategorySchema,
  createBudgetSchema,
  updateBudgetSchema,
  createAutoRuleSchema,
  updateAutoRuleSchema,
  setupPinSchema,
  loginPinSchema,
  // Backward-compatible aliases
  setupPasswordSchema,
  loginSchema,
  columnMappingSchema,
  importOptionsSchema,
  transactionFilterSchema,
  paginationSchema,
} from './validations';

describe('Transaction Validation Schemas', () => {
  describe('createTransactionSchema', () => {
    it('should validate a valid transaction', () => {
      const result = createTransactionSchema.safeParse({
        date: '2025-01-15',
        description: 'Test transaction',
        amount: -50.00,
        notes: 'Some notes',
        sub_category_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate transaction without optional fields', () => {
      const result = createTransactionSchema.safeParse({
        date: '2025-01-15',
        description: 'Test transaction',
        amount: 100.00,
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const result = createTransactionSchema.safeParse({
        date: '15/01/2025',
        description: 'Test',
        amount: -50.00,
      });
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('date');
      }
    });

    it('should reject zero amount', () => {
      const result = createTransactionSchema.safeParse({
        date: '2025-01-15',
        description: 'Test',
        amount: 0,
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject empty description', () => {
      const result = createTransactionSchema.safeParse({
        date: '2025-01-15',
        description: '',
        amount: -50.00,
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject description over 500 characters', () => {
      const result = createTransactionSchema.safeParse({
        date: '2025-01-15',
        description: 'a'.repeat(501),
        amount: -50.00,
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject invalid category ID format', () => {
      const result = createTransactionSchema.safeParse({
        date: '2025-01-15',
        description: 'Test',
        amount: -50.00,
        sub_category_id: 'invalid-id',
      });
      
      expect(result.success).toBe(false);
    });

    it('should allow null category ID', () => {
      const result = createTransactionSchema.safeParse({
        date: '2025-01-15',
        description: 'Test',
        amount: -50.00,
        sub_category_id: null,
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate transaction with source_id', () => {
      const result = createTransactionSchema.safeParse({
        date: '2025-01-15',
        description: 'Test transaction',
        amount: -50.00,
        source_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      
      expect(result.success).toBe(true);
    });

    it('should allow null source_id', () => {
      const result = createTransactionSchema.safeParse({
        date: '2025-01-15',
        description: 'Test',
        amount: -50.00,
        source_id: null,
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid source_id format', () => {
      const result = createTransactionSchema.safeParse({
        date: '2025-01-15',
        description: 'Test',
        amount: -50.00,
        source_id: 'invalid-id',
      });
      
      expect(result.success).toBe(false);
    });
  });

  describe('updateTransactionSchema', () => {
    it('should validate partial update', () => {
      const result = updateTransactionSchema.safeParse({
        description: 'Updated description',
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate empty update', () => {
      const result = updateTransactionSchema.safeParse({});
      
      expect(result.success).toBe(true);
    });
  });

  describe('splitTransactionSchema', () => {
    it('should validate valid splits', () => {
      const result = splitTransactionSchema.safeParse({
        splits: [
          { amount: -60.00, sub_category_id: '123e4567-e89b-12d3-a456-426614174000' },
          { amount: -40.00, sub_category_id: '123e4567-e89b-12d3-a456-426614174001' },
        ],
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject single split', () => {
      const result = splitTransactionSchema.safeParse({
        splits: [
          { amount: -100.00 },
        ],
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject more than 5 splits', () => {
      const result = splitTransactionSchema.safeParse({
        splits: [
          { amount: -20.00 },
          { amount: -20.00 },
          { amount: -20.00 },
          { amount: -20.00 },
          { amount: -10.00 },
          { amount: -10.00 },
        ],
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject zero amount in splits', () => {
      const result = splitTransactionSchema.safeParse({
        splits: [
          { amount: 0 },
          { amount: -100.00 },
        ],
      });
      
      expect(result.success).toBe(false);
    });
  });
});

describe('Category Validation Schemas', () => {
  describe('createSubCategorySchema', () => {
    it('should validate valid sub-category', () => {
      const result = createSubCategorySchema.safeParse({
        upper_category_id: 'expense',
        name: 'Groceries',
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid upper category', () => {
      const result = createSubCategorySchema.safeParse({
        upper_category_id: 'invalid',
        name: 'Test',
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject empty name', () => {
      const result = createSubCategorySchema.safeParse({
        upper_category_id: 'expense',
        name: '',
      });
      
      expect(result.success).toBe(false);
    });

    it('should validate all valid upper categories', () => {
      const validCategories = ['income', 'expense', 'saving', 'bill', 'debt', 'transfer'];
      
      for (const category of validCategories) {
        const result = createSubCategorySchema.safeParse({
          upper_category_id: category,
          name: 'Test',
        });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('updateSubCategorySchema', () => {
    it('should validate name update', () => {
      const result = updateSubCategorySchema.safeParse({
        name: 'New Name',
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate sort_order update', () => {
      const result = updateSubCategorySchema.safeParse({
        sort_order: 5,
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject negative sort_order', () => {
      const result = updateSubCategorySchema.safeParse({
        sort_order: -1,
      });
      
      expect(result.success).toBe(false);
    });
  });

  describe('updateUpperCategorySchema', () => {
    it('should validate name update', () => {
      const result = updateUpperCategorySchema.safeParse({
        name: 'New Category Name',
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject empty name', () => {
      const result = updateUpperCategorySchema.safeParse({
        name: '',
      });
      
      expect(result.success).toBe(false);
    });
  });
});

describe('Budget Validation Schemas', () => {
  describe('createBudgetSchema', () => {
    it('should validate valid budget', () => {
      const result = createBudgetSchema.safeParse({
        sub_category_id: '123e4567-e89b-12d3-a456-426614174000',
        year: 2025,
        month: 1,
        amount: 500,
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const result = createBudgetSchema.safeParse({
        sub_category_id: 'invalid-id',
        year: 2025,
        month: 1,
        amount: 500,
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject year before 2000', () => {
      const result = createBudgetSchema.safeParse({
        sub_category_id: '123e4567-e89b-12d3-a456-426614174000',
        year: 1999,
        month: 1,
        amount: 500,
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject year after 2100', () => {
      const result = createBudgetSchema.safeParse({
        sub_category_id: '123e4567-e89b-12d3-a456-426614174000',
        year: 2101,
        month: 1,
        amount: 500,
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject month less than 1', () => {
      const result = createBudgetSchema.safeParse({
        sub_category_id: '123e4567-e89b-12d3-a456-426614174000',
        year: 2025,
        month: 0,
        amount: 500,
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject month greater than 12', () => {
      const result = createBudgetSchema.safeParse({
        sub_category_id: '123e4567-e89b-12d3-a456-426614174000',
        year: 2025,
        month: 13,
        amount: 500,
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject negative amount', () => {
      const result = createBudgetSchema.safeParse({
        sub_category_id: '123e4567-e89b-12d3-a456-426614174000',
        year: 2025,
        month: 1,
        amount: -100,
      });
      
      expect(result.success).toBe(false);
    });

    it('should allow zero amount', () => {
      const result = createBudgetSchema.safeParse({
        sub_category_id: '123e4567-e89b-12d3-a456-426614174000',
        year: 2025,
        month: 1,
        amount: 0,
      });
      
      expect(result.success).toBe(true);
    });
  });

  describe('updateBudgetSchema', () => {
    it('should validate amount update', () => {
      const result = updateBudgetSchema.safeParse({
        amount: 600,
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject negative amount', () => {
      const result = updateBudgetSchema.safeParse({
        amount: -100,
      });
      
      expect(result.success).toBe(false);
    });
  });
});

describe('Auto-Categorization Rule Schemas', () => {
  describe('createAutoRuleSchema', () => {
    it('should validate valid rule', () => {
      const result = createAutoRuleSchema.safeParse({
        match_text: 'GROCERY STORE',
        sub_category_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject empty match text', () => {
      const result = createAutoRuleSchema.safeParse({
        match_text: '',
        sub_category_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject match text over 200 characters', () => {
      const result = createAutoRuleSchema.safeParse({
        match_text: 'a'.repeat(201),
        sub_category_id: '123e4567-e89b-12d3-a456-426614174000',
      });
      
      expect(result.success).toBe(false);
    });
  });

  describe('updateAutoRuleSchema', () => {
    it('should validate partial update', () => {
      const result = updateAutoRuleSchema.safeParse({
        is_active: false,
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate priority update', () => {
      const result = updateAutoRuleSchema.safeParse({
        priority: 10,
      });
      
      expect(result.success).toBe(true);
    });
  });
});

describe('Authentication Schemas', () => {
  describe('setupPinSchema', () => {
    it('should validate matching 6-digit PINs', () => {
      const result = setupPinSchema.safeParse({
        password: '123456',
        confirmPassword: '123456',
      });

      expect(result.success).toBe(true);
    });

    it('should reject mismatched PINs', () => {
      const result = setupPinSchema.safeParse({
        password: '123456',
        confirmPassword: '654321',
      });

      expect(result.success).toBe(false);
    });

    it('should reject PIN less than 6 digits', () => {
      const result = setupPinSchema.safeParse({
        password: '12345',
        confirmPassword: '12345',
      });

      expect(result.success).toBe(false);
    });

    it('should reject PIN more than 6 digits', () => {
      const result = setupPinSchema.safeParse({
        password: '1234567',
        confirmPassword: '1234567',
      });

      expect(result.success).toBe(false);
    });

    it('should reject non-numeric PIN', () => {
      const result = setupPinSchema.safeParse({
        password: '12345a',
        confirmPassword: '12345a',
      });

      expect(result.success).toBe(false);
    });

    it('should be aliased as setupPasswordSchema for backward compatibility', () => {
      expect(setupPasswordSchema).toBe(setupPinSchema);
    });
  });

  describe('loginPinSchema', () => {
    it('should validate 6-digit PIN input', () => {
      const result = loginPinSchema.safeParse({
        password: '123456',
      });

      expect(result.success).toBe(true);
    });

    it('should reject empty PIN', () => {
      const result = loginPinSchema.safeParse({
        password: '',
      });

      expect(result.success).toBe(false);
    });

    it('should reject non-numeric PIN', () => {
      const result = loginPinSchema.safeParse({
        password: 'abcdef',
      });

      expect(result.success).toBe(false);
    });

    it('should be aliased as loginSchema for backward compatibility', () => {
      expect(loginSchema).toBe(loginPinSchema);
    });
  });
});

describe('Import Schemas', () => {
  describe('columnMappingSchema', () => {
    it('should validate valid mapping', () => {
      const result = columnMappingSchema.safeParse({
        date: 0,
        description: 1,
        amount: 2,
        ignore: [3, 4],
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate without ignore columns', () => {
      const result = columnMappingSchema.safeParse({
        date: 0,
        description: 1,
        amount: 2,
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject negative column indices', () => {
      const result = columnMappingSchema.safeParse({
        date: -1,
        description: 1,
        amount: 2,
      });
      
      expect(result.success).toBe(false);
    });
  });

  describe('importOptionsSchema', () => {
    it('should validate full options', () => {
      const result = importOptionsSchema.safeParse({
        columnMapping: {
          date: 0,
          description: 1,
          amount: 2,
        },
        dateFormat: 'YYYY-MM-DD',
        skipDuplicates: true,
        selectedRows: [0, 1, 2, 3],
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate auto date format', () => {
      const result = importOptionsSchema.safeParse({
        columnMapping: {
          date: 0,
          description: 1,
          amount: 2,
        },
        dateFormat: 'auto',
        skipDuplicates: false,
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const result = importOptionsSchema.safeParse({
        columnMapping: {
          date: 0,
          description: 1,
          amount: 2,
        },
        dateFormat: 'invalid-format',
        skipDuplicates: true,
      });
      
      expect(result.success).toBe(false);
    });
  });
});

describe('Filter and Pagination Schemas', () => {
  describe('transactionFilterSchema', () => {
    it('should validate full filter', () => {
      const result = transactionFilterSchema.safeParse({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        categoryId: '123e4567-e89b-12d3-a456-426614174000',
        sourceId: '123e4567-e89b-12d3-a456-426614174001',
        search: 'grocery',
        minAmount: -1000,
        maxAmount: 0,
        uncategorized: false,
      });
      
      expect(result.success).toBe(true);
    });

    it('should validate filter with sourceId', () => {
      const result = transactionFilterSchema.safeParse({
        sourceId: '123e4567-e89b-12d3-a456-426614174000',
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid sourceId format', () => {
      const result = transactionFilterSchema.safeParse({
        sourceId: 'invalid-source-id',
      });
      
      expect(result.success).toBe(false);
    });

    it('should validate empty filter', () => {
      const result = transactionFilterSchema.safeParse({});
      
      expect(result.success).toBe(true);
    });

    it('should reject invalid date format', () => {
      const result = transactionFilterSchema.safeParse({
        startDate: '01/15/2025',
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject search over 200 characters', () => {
      const result = transactionFilterSchema.safeParse({
        search: 'a'.repeat(201),
      });
      
      expect(result.success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('should provide defaults', () => {
      const result = paginationSchema.safeParse({});
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(50);
        expect(result.data.sortBy).toBe('date');
        expect(result.data.sortOrder).toBe('desc');
      }
    });

    it('should validate custom pagination', () => {
      const result = paginationSchema.safeParse({
        page: 5,
        limit: 25,
        sortBy: 'amount',
        sortOrder: 'asc',
      });
      
      expect(result.success).toBe(true);
    });

    it('should reject page less than 1', () => {
      const result = paginationSchema.safeParse({
        page: 0,
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject limit over 100', () => {
      const result = paginationSchema.safeParse({
        limit: 101,
      });
      
      expect(result.success).toBe(false);
    });

    it('should reject invalid sortBy', () => {
      const result = paginationSchema.safeParse({
        sortBy: 'invalid',
      });
      
      expect(result.success).toBe(false);
    });
  });
});

