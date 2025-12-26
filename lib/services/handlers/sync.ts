/**
 * Tauri Handler: Sync
 *
 * Handles sync-related operations in Tauri mode.
 * Note: Full sync functionality (OAuth, Google Drive) runs in browser context.
 * These handlers only provide status checks and configuration.
 */

interface HandlerContext {
  method: string;
  body?: unknown;
  params: Record<string, string>;
  path: string;
}

// Sync config is stored in localStorage in Tauri mode
const SYNC_CONFIG_KEY = 'puffin_sync_config';

interface SyncConfig {
  folderId: string | null;
  folderName: string | null;
  isConfigured: boolean;
  lastSyncedAt: string | null;
  userEmail: string | null;
  syncedDbHash: string | null;
  backupFileId: string | null;
  isFileBasedSync: boolean;
}

/**
 * Get sync config from localStorage.
 */
function getSyncConfig(): SyncConfig {
  if (typeof window === 'undefined' || !window.localStorage) {
    return getDefaultConfig();
  }

  try {
    const stored = localStorage.getItem(SYNC_CONFIG_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }

  return getDefaultConfig();
}

/**
 * Save sync config to localStorage.
 */
function saveSyncConfig(config: SyncConfig): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(config));
}

/**
 * Get default sync config.
 */
function getDefaultConfig(): SyncConfig {
  return {
    folderId: null,
    folderName: null,
    isConfigured: false,
    lastSyncedAt: null,
    userEmail: null,
    syncedDbHash: null,
    backupFileId: null,
    isFileBasedSync: false,
  };
}

/**
 * Sync config handler - /api/sync/config
 */
export async function handleSyncConfig(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  switch (method) {
    case 'GET':
      return getSyncConfigStatus();
    case 'POST':
      return updateSyncConfig(body as Partial<SyncConfig>);
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

/**
 * Get sync config status.
 */
async function getSyncConfigStatus(): Promise<SyncConfig & { isAuthenticated: boolean; oauthConfigured: boolean; hasExtendedScope: boolean }> {
  const config = getSyncConfig();

  // In Tauri mode, OAuth state is also stored locally
  const oauthConfigured = !!localStorage.getItem('puffin_oauth_configured');
  const isAuthenticated = !!localStorage.getItem('puffin_oauth_authenticated');
  const hasExtendedScope = !!localStorage.getItem('puffin_oauth_extended_scope');

  return {
    ...config,
    isAuthenticated,
    oauthConfigured,
    hasExtendedScope,
  };
}

/**
 * Update sync config.
 */
async function updateSyncConfig(data: Partial<SyncConfig>): Promise<SyncConfig> {
  const current = getSyncConfig();
  const updated = {
    ...current,
    ...data,
    isConfigured: !!(data.folderId || current.folderId || data.backupFileId || current.backupFileId),
  };

  saveSyncConfig(updated);
  return updated;
}

/**
 * Sync status handler - /api/sync/status
 */
export async function handleSyncStatus(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'GET') {
    throw new Error(`Method ${method} not allowed`);
  }

  const config = getSyncConfig();

  return {
    isConfigured: config.isConfigured,
    lastSyncedAt: config.lastSyncedAt,
    folderName: config.folderName,
    userEmail: config.userEmail,
  };
}

/**
 * Sync push handler - /api/sync/push
 * Note: In Tauri mode, actual sync is handled by browser-based OAuth flow.
 * This is a placeholder that would be called after OAuth is complete.
 */
export async function handleSyncPush(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  // In Tauri mode, sync operations use the browser OAuth flow
  // This handler updates the sync timestamp after successful sync
  const config = getSyncConfig();

  if (!config.isConfigured) {
    throw new Error('Sync not configured');
  }

  // Update last synced timestamp
  saveSyncConfig({
    ...config,
    lastSyncedAt: new Date().toISOString(),
  });

  return { success: true };
}

/**
 * Sync disconnect handler - /api/sync/disconnect
 */
export async function handleSyncDisconnect(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  // Clear all sync-related localStorage
  localStorage.removeItem(SYNC_CONFIG_KEY);
  localStorage.removeItem('puffin_oauth_configured');
  localStorage.removeItem('puffin_oauth_authenticated');
  localStorage.removeItem('puffin_oauth_extended_scope');

  return { success: true };
}
