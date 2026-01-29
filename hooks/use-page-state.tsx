'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { FilterValues } from '@/components/transactions';

// Types for sort fields (matching transactions.tsx)
type SortField = 'date' | 'description' | 'amount';
type SortOrder = 'asc' | 'desc';

// Default filter values
const emptyFilters: FilterValues = {
  startDate: null,
  endDate: null,
  categoryId: null,
  sourceId: null,
  minAmount: null,
  maxAmount: null,
  uncategorized: false,
};

// Page state interfaces
interface TransactionsState {
  filters: FilterValues;
  searchQuery: string;
  page: number;
  sortBy: SortField;
  sortOrder: SortOrder;
}

interface MonthlyBudgetState {
  currentDate: Date;
  selectedCategoryId: string | null;
  collapsedSections: Set<string>;
}

interface DashboardState {
  collapsedCategories: Set<string>;
  year: number;
}

interface PageState {
  transactions: TransactionsState;
  monthlyBudget: MonthlyBudgetState;
  dashboard: DashboardState;
}

// Default state values
const getDefaultState = (): PageState => ({
  transactions: {
    filters: emptyFilters,
    searchQuery: '',
    page: 1,
    sortBy: 'date',
    sortOrder: 'desc',
  },
  monthlyBudget: {
    currentDate: new Date(),
    selectedCategoryId: null,
    collapsedSections: new Set(),
  },
  dashboard: {
    collapsedCategories: new Set(),
    year: new Date().getFullYear(),
  },
});

// Context value interface
interface PageStateContextValue {
  state: PageState;
  setTransactionsState: (partial: Partial<TransactionsState>) => void;
  setMonthlyBudgetState: (partial: Partial<MonthlyBudgetState>) => void;
  setDashboardState: (partial: Partial<DashboardState>) => void;
}

const PageStateContext = createContext<PageStateContextValue | null>(null);

export function PageStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PageState>(getDefaultState);

  const setTransactionsState = useCallback((partial: Partial<TransactionsState>) => {
    setState(prev => ({
      ...prev,
      transactions: { ...prev.transactions, ...partial },
    }));
  }, []);

  const setMonthlyBudgetState = useCallback((partial: Partial<MonthlyBudgetState>) => {
    setState(prev => ({
      ...prev,
      monthlyBudget: { ...prev.monthlyBudget, ...partial },
    }));
  }, []);

  const setDashboardState = useCallback((partial: Partial<DashboardState>) => {
    setState(prev => ({
      ...prev,
      dashboard: { ...prev.dashboard, ...partial },
    }));
  }, []);

  return (
    <PageStateContext.Provider
      value={{
        state,
        setTransactionsState,
        setMonthlyBudgetState,
        setDashboardState,
      }}
    >
      {children}
    </PageStateContext.Provider>
  );
}

export function usePageState() {
  const context = useContext(PageStateContext);
  if (!context) {
    throw new Error('usePageState must be used within a PageStateProvider');
  }
  return context;
}

// Convenience hooks for individual pages
export function useTransactionsState() {
  const { state, setTransactionsState } = usePageState();
  return {
    ...state.transactions,
    setTransactionsState,
  };
}

export function useMonthlyBudgetState() {
  const { state, setMonthlyBudgetState } = usePageState();
  return {
    ...state.monthlyBudget,
    setMonthlyBudgetState,
  };
}

export function useDashboardState() {
  const { state, setDashboardState } = usePageState();
  return {
    ...state.dashboard,
    setDashboardState,
  };
}

// Export types for use in components
export type { TransactionsState, MonthlyBudgetState, DashboardState, SortField, SortOrder };
