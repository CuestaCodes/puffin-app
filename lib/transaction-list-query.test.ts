import { describe, it, expect } from 'vitest';
import {
  EMPTY_FILTERS,
  TRANSACTION_LIST_PAGE_SIZE,
  buildTransactionListQuery,
  categoryChangeLeavesFilter,
  getEffectiveCategoryId,
  getMonthDateRange,
} from './transaction-list-query';
import type { TransactionListState } from '@/types/transaction-list';

const baseState: TransactionListState = {
  filters: EMPTY_FILTERS,
  searchQuery: '',
  page: 1,
  sortBy: 'date',
  sortOrder: 'desc',
};

const parse = (query: string) => Object.fromEntries(new URLSearchParams(query));

describe('transaction-list-query', () => {
  describe('getMonthDateRange', () => {
    it('covers a 31-day month', () => {
      expect(getMonthDateRange(2026, 10)).toEqual({ startDate: '2026-10-01', endDate: '2026-10-31' });
    });

    it('covers a 30-day month and pads single-digit months', () => {
      expect(getMonthDateRange(2026, 4)).toEqual({ startDate: '2026-04-01', endDate: '2026-04-30' });
    });

    it('ends February on the 28th, or the 29th in a leap year', () => {
      expect(getMonthDateRange(2026, 2).endDate).toBe('2026-02-28');
      expect(getMonthDateRange(2028, 2).endDate).toBe('2028-02-29');
    });

    it('does not spill December into the next year', () => {
      expect(getMonthDateRange(2026, 12)).toEqual({ startDate: '2026-12-01', endDate: '2026-12-31' });
    });
  });

  describe('getEffectiveCategoryId', () => {
    it('is null when nothing is set', () => {
      expect(getEffectiveCategoryId(EMPTY_FILTERS)).toBeNull();
      expect(getEffectiveCategoryId(EMPTY_FILTERS, { categoryId: null })).toBeNull();
    });

    it('uses the popover category when the scope has none', () => {
      const filters = { ...EMPTY_FILTERS, categoryId: 'popover' };
      expect(getEffectiveCategoryId(filters)).toBe('popover');
      expect(getEffectiveCategoryId(filters, { categoryId: null })).toBe('popover');
    });

    it('lets the scope category win over the popover', () => {
      const filters = { ...EMPTY_FILTERS, categoryId: 'popover' };
      expect(getEffectiveCategoryId(filters, { categoryId: 'tile' })).toBe('tile');
    });
  });

  describe('buildTransactionListQuery', () => {
    it('sends only paging and sort for an unfiltered list', () => {
      expect(parse(buildTransactionListQuery(baseState))).toEqual({
        page: '1',
        limit: String(TRANSACTION_LIST_PAGE_SIZE),
        sortBy: 'date',
        sortOrder: 'desc',
      });
    });

    it('sends every filter that is set', () => {
      const state: TransactionListState = {
        filters: {
          startDate: '2026-01-01',
          endDate: '2026-01-31',
          categoryId: 'cat-1',
          sourceId: 'src-1',
          minAmount: -50,
          maxAmount: 100,
          uncategorized: true,
        },
        searchQuery: 'coffee',
        page: 3,
        sortBy: 'amount',
        sortOrder: 'asc',
      };
      expect(parse(buildTransactionListQuery(state))).toEqual({
        page: '3',
        limit: String(TRANSACTION_LIST_PAGE_SIZE),
        sortBy: 'amount',
        sortOrder: 'asc',
        search: 'coffee',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        categoryId: 'cat-1',
        sourceId: 'src-1',
        minAmount: '-50',
        maxAmount: '100',
        uncategorized: 'true',
      });
    });

    it('keeps a zero amount bound, which is a real filter and not "unset"', () => {
      const state = { ...baseState, filters: { ...EMPTY_FILTERS, minAmount: 0, maxAmount: 0 } };
      const params = parse(buildTransactionListQuery(state));
      expect(params.minAmount).toBe('0');
      expect(params.maxAmount).toBe('0');
    });

    it('omits uncategorized when false', () => {
      expect(parse(buildTransactionListQuery(baseState))).not.toHaveProperty('uncategorized');
    });

    it('scopes the monthly list to its month', () => {
      const params = parse(buildTransactionListQuery(baseState, getMonthDateRange(2026, 10)));
      expect(params.startDate).toBe('2026-10-01');
      expect(params.endDate).toBe('2026-10-31');
    });

    it('never lets a date filter widen the scoped month', () => {
      const state = {
        ...baseState,
        filters: { ...EMPTY_FILTERS, startDate: '2020-01-01', endDate: '2030-12-31' },
      };
      const params = parse(buildTransactionListQuery(state, getMonthDateRange(2026, 10)));
      expect(params.startDate).toBe('2026-10-01');
      expect(params.endDate).toBe('2026-10-31');
    });

    it('sends the scope category in place of the popover category', () => {
      const state = { ...baseState, filters: { ...EMPTY_FILTERS, categoryId: 'popover' } };
      expect(parse(buildTransactionListQuery(state, { categoryId: 'tile' })).categoryId).toBe('tile');
      expect(parse(buildTransactionListQuery(state, { categoryId: null })).categoryId).toBe('popover');
    });

    it('asks for the same rows from both screens given the same inputs', () => {
      const range = getMonthDateRange(2026, 10);
      const pageState = {
        ...baseState,
        filters: { ...EMPTY_FILTERS, ...range, categoryId: 'cat-1', sourceId: 'src-1' },
      };
      const monthlyState = { ...baseState, filters: { ...EMPTY_FILTERS, sourceId: 'src-1' } };
      expect(parse(buildTransactionListQuery(monthlyState, { ...range, categoryId: 'cat-1' })))
        .toEqual(parse(buildTransactionListQuery(pageState)));
    });

    it('is unchanged by a state change that asks for the same rows', () => {
      // The fetch is keyed on this string. Dropping a popover category that the scope
      // already overrides must not look like a new query.
      const scope = { categoryId: 'tile' };
      const before = { ...baseState, filters: { ...EMPTY_FILTERS, categoryId: 'popover' } };
      const after = { ...baseState, filters: { ...EMPTY_FILTERS } };
      expect(buildTransactionListQuery(before, scope)).toBe(buildTransactionListQuery(after, scope));
    });

    it('changes when the page changes', () => {
      expect(buildTransactionListQuery({ ...baseState, page: 2 }))
        .not.toBe(buildTransactionListQuery(baseState));
    });

    it('encodes search text that contains query-string characters', () => {
      const params = parse(buildTransactionListQuery({ ...baseState, searchQuery: 'a&b=c d' }));
      expect(params.search).toBe('a&b=c d');
    });

    it('honours an explicit page size', () => {
      expect(parse(buildTransactionListQuery(baseState, undefined, 50)).limit).toBe('50');
    });
  });

  describe('categoryChangeLeavesFilter', () => {
    it('is false when no category or uncategorised filter is active', () => {
      expect(categoryChangeLeavesFilter('cat-1', EMPTY_FILTERS)).toBe(false);
      expect(categoryChangeLeavesFilter(null, EMPTY_FILTERS)).toBe(false);
    });

    it('is true when a row is categorised under the uncategorised filter', () => {
      const filters = { ...EMPTY_FILTERS, uncategorized: true };
      expect(categoryChangeLeavesFilter('cat-1', filters)).toBe(true);
      expect(categoryChangeLeavesFilter(null, filters)).toBe(false);
    });

    it('is true when a row moves out of the filtered category', () => {
      const filters = { ...EMPTY_FILTERS, categoryId: 'cat-1' };
      expect(categoryChangeLeavesFilter('cat-2', filters)).toBe(true);
      expect(categoryChangeLeavesFilter(null, filters)).toBe(true);
      expect(categoryChangeLeavesFilter('cat-1', filters)).toBe(false);
    });

    it('judges against the scope category on the monthly list', () => {
      // The budget-tile category is not in `filters`; missing it here is what would
      // let Next skip a page after categorising a row out of the tile's category.
      const scope = { categoryId: 'tile' };
      expect(categoryChangeLeavesFilter('cat-2', EMPTY_FILTERS, scope)).toBe(true);
      expect(categoryChangeLeavesFilter('tile', EMPTY_FILTERS, scope)).toBe(false);
    });

    it('uses the scope category over a popover category it overrides', () => {
      const filters = { ...EMPTY_FILTERS, categoryId: 'popover' };
      expect(categoryChangeLeavesFilter('popover', filters, { categoryId: 'tile' })).toBe(true);
    });
  });
});
