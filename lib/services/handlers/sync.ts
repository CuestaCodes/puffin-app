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

// localStorage keys for sync state
const SYNC_CONFIG_KEY = 'puffin_sync_config';
const OAUTH_CONFIGURED_KEY = 'puffin_oauth_configured';
const OAUTH_AUTHENTICATED_KEY = 'puffin_oauth_authenticated';
const OAUTH_EXTENDED_SCOPE_KEY = 'puffin_oauth_extended_scope';

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
  const oauthConfigured = !!localStorage.getItem(OAUTH_CONFIGURED_KEY);
  const isAuthenticated = !!localStorage.getItem(OAUTH_AUTHENTICATED_KEY);
  const hasExtendedScope = !!localStorage.getItem(OAUTH_EXTENDED_SCOPE_KEY);

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
 * Sync check handler - /api/sync/check
 *
 * In Tauri mode, returns basic sync status without cloud check.
 * Full cloud-based sync check requires browser OAuth context.
 */
export async function handleSyncCheck(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'GET') {
    throw new Error(`Method ${method} not allowed`);
  }

  const config = getSyncConfig();

  // If sync is not configured, allow editing
  if (!config.isConfigured) {
    return {
      syncRequired: false,
      reason: 'not_configured',
      canEdit: true,
    };
  }

  // If configured but never synced, we can't check cloud status in Tauri
  // Allow editing but note that sync hasn't happened
  if (!config.lastSyncedAt) {
    return {
      syncRequired: false,
      reason: 'not_configured',
      canEdit: true,
      message: 'Sync configured but not yet synced. Use Settings > Sync to sync.',
    };
  }

  // Sync was configured and has been used - assume in sync
  // Full cloud checking requires OAuth which happens in browser context
  return {
    syncRequired: false,
    reason: 'in_sync',
    canEdit: true,
    hasLocalChanges: false,
    hasCloudChanges: false,
    lastSyncedAt: config.lastSyncedAt,
  };
}

/**
 * Sync push handler - /api/sync/push
 *
 * In Tauri mode, sync operations require browser-based OAuth flow.
 * This handler is not supported - use the web-based sync flow instead.
 */
export async function handleSyncPush(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  // Sync push is not supported in Tauri mode - requires browser OAuth flow
  // The sync functionality should be triggered via the Settings > Sync page
  // which handles OAuth authentication and Google Drive operations in browser context
  throw new Error(
    'Sync push not supported in desktop mode. Please use Settings > Sync to sync your data.'
  );
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
  localStorage.removeItem(OAUTH_CONFIGURED_KEY);
  localStorage.removeItem(OAUTH_AUTHENTICATED_KEY);
  localStorage.removeItem(OAUTH_EXTENDED_SCOPE_KEY);

  return { success: true };
}
