'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { EMPTY_FILTERS } from '@/lib/transaction-list-query';
import type { SortField, SortOrder, TransactionListState } from '@/types/transaction-list';

// Page state interfaces
type TransactionsState = TransactionListState;

/**
 * The list embedded in Monthly Budget. Its filters, search and sort carry across
 * months; its page number does not, so `pageScope` records which month and category
 * the saved page belongs to. A page saved under another scope reads as page 1.
 */
interface MonthlyTransactionsState extends TransactionListState {
  pageScope: string;
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

type SettingsView = 'main' | 'categories' | 'rules' | 'sync' | 'data' | 'security';

interface SettingsState {
  view: SettingsView;
}

interface PageState {
  transactions: TransactionsState;
  monthlyBudget: MonthlyBudgetState;
  monthlyTransactions: MonthlyTransactionsState;
  dashboard: DashboardState;
  settings: SettingsState;
}

/**
 * Land directly on the Sync sub-view when arriving via the Reconnect modal,
 * which sets `puffin_action_reauth` in sessionStorage and then reloads — so this
 * is read when the provider first mounts. Don't clear the flag here —
 * SyncManagement consumes it once it mounts to fire the OAuth flow automatically.
 */
function getInitialSettingsView(): SettingsView {
  if (typeof window === 'undefined') return 'main';
  try {
    if (sessionStorage.getItem('puffin_action_reauth') === '1') return 'sync';
  } catch {
    // ignore
  }
  return 'main';
}

// Default state values
const getDefaultState = (): PageState => ({
  transactions: {
    filters: EMPTY_FILTERS,
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
  monthlyTransactions: {
    filters: EMPTY_FILTERS,
    searchQuery: '',
    page: 1,
    pageScope: '',
    sortBy: 'date',
    sortOrder: 'desc',
  },
  dashboard: {
    collapsedCategories: new Set(),
    year: new Date().getFullYear(),
  },
  settings: {
    view: getInitialSettingsView(),
  },
});

// Context value interface
interface PageStateContextValue {
  state: PageState;
  setTransactionsState: (partial: Partial<TransactionsState>) => void;
  setMonthlyBudgetState: (partial: Partial<MonthlyBudgetState>) => void;
  setMonthlyTransactionsState: (partial: Partial<MonthlyTransactionsState>) => void;
  setDashboardState: (partial: Partial<DashboardState>) => void;
  setSettingsState: (partial: Partial<SettingsState>) => void;
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

  const setMonthlyTransactionsState = useCallback((partial: Partial<MonthlyTransactionsState>) => {
    setState(prev => ({
      ...prev,
      monthlyTransactions: { ...prev.monthlyTransactions, ...partial },
    }));
  }, []);

  const setDashboardState = useCallback((partial: Partial<DashboardState>) => {
    setState(prev => ({
      ...prev,
      dashboard: { ...prev.dashboard, ...partial },
    }));
  }, []);

  const setSettingsState = useCallback((partial: Partial<SettingsState>) => {
    setState(prev => ({
      ...prev,
      settings: { ...prev.settings, ...partial },
    }));
  }, []);

  return (
    <PageStateContext.Provider
      value={{
        state,
        setTransactionsState,
        setMonthlyBudgetState,
        setMonthlyTransactionsState,
        setDashboardState,
        setSettingsState,
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

export function useMonthlyTransactionsState() {
  const { state, setMonthlyTransactionsState } = usePageState();
  return {
    ...state.monthlyTransactions,
    setMonthlyTransactionsState,
  };
}

export function useDashboardState() {
  const { state, setDashboardState } = usePageState();
  return {
    ...state.dashboard,
    setDashboardState,
  };
}

export function useSettingsState() {
  const { state, setSettingsState } = usePageState();
  return {
    ...state.settings,
    setSettingsState,
  };
}

// Export types for use in components
export type {
  TransactionsState,
  MonthlyBudgetState,
  MonthlyTransactionsState,
  DashboardState,
  SettingsState,
  SettingsView,
  SortField,
  SortOrder,
};
