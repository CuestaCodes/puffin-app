/**
 * Tauri Handler Registry
 *
 * Registers all route handlers for Tauri mode.
 * These handlers are loaded lazily to avoid circular dependencies.
 */

import { registerHandler } from '../api-client';

/**
 * Initialize all Tauri handlers.
 * Call this once at app startup when in Tauri mode.
 */
export function initializeTauriHandlers(): void {
  // Auth handlers
  registerHandler('/api/auth/session', async () => {
    const { handleSession } = await import('./auth');
    return handleSession;
  });

  registerHandler('/api/auth/login', async () => {
    const { handleLogin } = await import('./auth');
    return handleLogin;
  });

  registerHandler('/api/auth/logout', async () => {
    const { handleLogout } = await import('./auth');
    return handleLogout;
  });

  registerHandler('/api/auth/setup', async () => {
    const { handleSetup } = await import('./auth');
    return handleSetup;
  });

  registerHandler('/api/auth/change-password', async () => {
    const { handleChangePin } = await import('./auth');
    return handleChangePin;
  });

  // Transaction handlers
  registerHandler('/api/transactions', async () => {
    const { handleTransactions } = await import('./transactions');
    return handleTransactions;
  });

  registerHandler('/api/transactions/[id]', async () => {
    const { handleTransaction } = await import('./transactions');
    return handleTransaction;
  });

  // Category handlers
  registerHandler('/api/categories', async () => {
    const { handleCategories } = await import('./categories');
    return handleCategories;
  });

  registerHandler('/api/categories/[id]', async () => {
    const { handleCategory } = await import('./categories');
    return handleCategory;
  });

  // Source handlers
  registerHandler('/api/sources', async () => {
    const { handleSources } = await import('./sources');
    return handleSources;
  });

  registerHandler('/api/sources/[id]', async () => {
    const { handleSource } = await import('./sources');
    return handleSource;
  });

  // Budget handlers
  registerHandler('/api/budgets', async () => {
    const { handleBudgets } = await import('./budgets');
    return handleBudgets;
  });

  registerHandler('/api/budgets/templates', async () => {
    const { handleBudgetTemplates } = await import('./budgets');
    return handleBudgetTemplates;
  });

  // Rule handlers
  registerHandler('/api/rules', async () => {
    const { handleRules } = await import('./rules');
    return handleRules;
  });

  registerHandler('/api/rules/[id]', async () => {
    const { handleRule } = await import('./rules');
    return handleRule;
  });

  // Analytics handlers
  registerHandler('/api/analytics/dashboard', async () => {
    const { handleDashboard } = await import('./analytics');
    return handleDashboard;
  });

  // TODO: Add more handlers as needed:
  // - /api/sync/*
  // - /api/data/*
  // - /api/net-worth
}

/**
 * Check if handlers are initialized.
 */
let handlersInitialized = false;

/**
 * Ensure handlers are initialized (call from api-client).
 */
export function ensureHandlersInitialized(): void {
  if (!handlersInitialized) {
    initializeTauriHandlers();
    handlersInitialized = true;
  }
}
