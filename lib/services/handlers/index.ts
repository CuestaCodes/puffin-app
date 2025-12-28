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

  registerHandler('/api/auth/reset', async () => {
    const { handleReset } = await import('./auth');
    return handleReset;
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

  registerHandler('/api/transactions/[id]/split', async () => {
    const { handleTransactionSplit } = await import('./transactions');
    return handleTransactionSplit;
  });

  registerHandler('/api/transactions/import', async () => {
    const { handleTransactionImport } = await import('./transactions');
    return handleTransactionImport;
  });

  registerHandler('/api/transactions/check-duplicates', async () => {
    const { handleCheckDuplicates } = await import('./transactions');
    return handleCheckDuplicates;
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

  // Sync handlers
  registerHandler('/api/sync/check', async () => {
    const { handleSyncCheck } = await import('./sync');
    return handleSyncCheck;
  });

  registerHandler('/api/sync/config', async () => {
    const { handleSyncConfig } = await import('./sync');
    return handleSyncConfig;
  });

  registerHandler('/api/sync/status', async () => {
    const { handleSyncStatus } = await import('./sync');
    return handleSyncStatus;
  });

  registerHandler('/api/sync/push', async () => {
    const { handleSyncPush } = await import('./sync');
    return handleSyncPush;
  });

  registerHandler('/api/sync/disconnect', async () => {
    const { handleSyncDisconnect } = await import('./sync');
    return handleSyncDisconnect;
  });

  // Data handlers
  registerHandler('/api/data/stats', async () => {
    const { handleStats } = await import('./data');
    return handleStats;
  });

  registerHandler('/api/data/backups', async () => {
    const { handleBackups } = await import('./data');
    return handleBackups;
  });

  registerHandler('/api/data/backups/[filename]', async () => {
    const { handleBackup } = await import('./data');
    return handleBackup;
  });

  registerHandler('/api/data/clear', async () => {
    const { handleClear } = await import('./data');
    return handleClear;
  });

  registerHandler('/api/data/reset', async () => {
    const { handleReset } = await import('./data');
    return handleReset;
  });

  registerHandler('/api/data/export/transactions', async () => {
    const { handleExportTransactions } = await import('./data');
    return handleExportTransactions;
  });

  registerHandler('/api/data/export/backup', async () => {
    const { handleExportBackup } = await import('./data');
    return handleExportBackup;
  });

  registerHandler('/api/data/import/backup', async () => {
    const { handleImportBackup } = await import('./data');
    return handleImportBackup;
  });

  // Net worth handlers
  registerHandler('/api/net-worth', async () => {
    const { handleNetWorth } = await import('./net-worth');
    return handleNetWorth;
  });

  registerHandler('/api/net-worth/[id]', async () => {
    const { handleNetWorthEntry } = await import('./net-worth');
    return handleNetWorthEntry;
  });
}
