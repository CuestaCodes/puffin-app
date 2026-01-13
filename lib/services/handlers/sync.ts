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
const SYNC_CREDENTIALS_KEY = 'puffin_sync_credentials';
const OAUTH_CONFIGURED_KEY = 'puffin_oauth_configured';
const OAUTH_AUTHENTICATED_KEY = 'puffin_oauth_authenticated';
const OAUTH_EXTENDED_SCOPE_KEY = 'puffin_oauth_extended_scope';

interface SyncCredentials {
  clientId: string;
  clientSecret: string;
  apiKey: string;
}

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
 * Checks sync status by comparing local database hash and cloud modified time.
 * Returns canEdit: false when there are unresolved conflicts.
 */
export async function handleSyncCheck(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'GET') {
    throw new Error(`Method ${method} not allowed`);
  }

  const config = getSyncConfig();

  // Check configuration - need either folder-based or file-based sync
  const hasValidConfig = config.isFileBasedSync
    ? !!config.backupFileId
    : !!config.folderId;

  // If not configured, allow editing
  if (!config.isConfigured || !hasValidConfig) {
    return {
      syncRequired: false,
      reason: 'not_configured',
      canEdit: true,
    };
  }

  // Get stored tokens
  const tokensStored = localStorage.getItem('puffin_oauth_tokens');
  if (!tokensStored) {
    // Not authenticated - allow editing but warn
    return {
      syncRequired: false,
      reason: 'check_failed',
      canEdit: true,
      warning: 'Not authenticated with Google. Sign in to check sync status.',
    };
  }

  const tokens = JSON.parse(tokensStored);
  const accessToken = tokens.access_token;

  if (!accessToken) {
    return {
      syncRequired: false,
      reason: 'check_failed',
      canEdit: true,
      warning: 'No access token. Please sign in again.',
    };
  }

  try {
    // Detect local changes by comparing current hash vs synced hash
    const hasLocalChanges = await detectLocalChanges(config);

    // Get cloud backup info
    let cloudInfo: { exists: boolean; modifiedTime?: string };

    if (config.isFileBasedSync && config.backupFileId) {
      // File-based sync: get info by file ID
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files/${config.backupFileId}?fields=id,modifiedTime&supportsAllDrives=true`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (response.ok) {
        const data = await response.json();
        cloudInfo = { exists: true, modifiedTime: data.modifiedTime };
      } else if (response.status === 404) {
        cloudInfo = { exists: false };
      } else {
        throw new Error('Failed to check cloud backup');
      }
    } else {
      // Folder-based sync: search for backup file in folder
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${config.folderId}'+in+parents+and+name='puffin-backup.db'+and+trashed=false&fields=files(id,modifiedTime)&supportsAllDrives=true`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );

      if (!searchResponse.ok) {
        throw new Error('Failed to search for cloud backup');
      }

      const searchData = await searchResponse.json();
      const file = searchData.files?.[0];

      if (file) {
        cloudInfo = { exists: true, modifiedTime: file.modifiedTime };
      } else {
        cloudInfo = { exists: false };
      }
    }

    // If no cloud backup exists
    if (!cloudInfo.exists) {
      return {
        syncRequired: true,
        reason: 'no_cloud_backup',
        message: 'No backup found in cloud. Upload your data to start syncing.',
        canEdit: true,
        hasLocalChanges,
      };
    }

    // If we have never synced
    if (!config.lastSyncedAt) {
      return {
        syncRequired: true,
        reason: 'never_synced',
        message: 'A backup exists in the cloud. Download it to start, or upload to replace it.',
        canEdit: false,
        hasLocalChanges,
        cloudModifiedAt: cloudInfo.modifiedTime,
      };
    }

    // Detect cloud changes by comparing cloud modified time vs last sync time
    let hasCloudChanges = false;
    if (cloudInfo.modifiedTime) {
      const lastSyncTime = new Date(config.lastSyncedAt).getTime();
      const cloudModifiedTime = new Date(cloudInfo.modifiedTime).getTime();
      // 1 minute buffer for clock differences
      hasCloudChanges = cloudModifiedTime > lastSyncTime + 60000;
    }

    // Determine scenario
    if (!hasLocalChanges && !hasCloudChanges) {
      return {
        syncRequired: false,
        reason: 'in_sync',
        canEdit: true,
        hasLocalChanges: false,
        hasCloudChanges: false,
        lastSyncedAt: config.lastSyncedAt,
      };
    }

    if (hasLocalChanges && !hasCloudChanges) {
      return {
        syncRequired: true,
        reason: 'local_only',
        message: "You have local changes that haven't been uploaded yet.",
        canEdit: true,
        hasLocalChanges: true,
        hasCloudChanges: false,
        lastSyncedAt: config.lastSyncedAt,
      };
    }

    if (!hasLocalChanges && hasCloudChanges) {
      return {
        syncRequired: true,
        reason: 'cloud_only',
        message: 'A newer version is available in the cloud.',
        canEdit: false,
        hasLocalChanges: false,
        hasCloudChanges: true,
        cloudModifiedAt: cloudInfo.modifiedTime,
        lastSyncedAt: config.lastSyncedAt,
      };
    }

    // Both have changes - CONFLICT
    return {
      syncRequired: true,
      reason: 'conflict',
      message: 'Both local and cloud have changes. Choose which version to keep.',
      canEdit: false,
      hasLocalChanges: true,
      hasCloudChanges: true,
      cloudModifiedAt: cloudInfo.modifiedTime,
      lastSyncedAt: config.lastSyncedAt,
    };

  } catch (error) {
    console.error('Sync check error:', error);
    return {
      syncRequired: false,
      reason: 'check_failed',
      canEdit: true,
      warning: 'Could not verify sync status. Proceed with caution.',
    };
  }
}

/**
 * Detect local changes by computing hash of current database
 * and comparing with the stored hash from last sync.
 */
async function detectLocalChanges(config: SyncConfig): Promise<boolean> {
  if (!config.syncedDbHash) {
    // No previous hash, assume changes exist
    return true;
  }

  try {
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');

    const dataDir = await appDataDir();
    const dbPath = await join(dataDir, 'puffin.db');

    // Checkpoint WAL first
    const { getDatabase } = await import('../tauri-db');
    const db = await getDatabase();
    await db.execute('PRAGMA wal_checkpoint(TRUNCATE)');

    // Read and hash the database file
    const fileData = await readFile(dbPath);
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const currentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return currentHash !== config.syncedDbHash;
  } catch (error) {
    console.error('Failed to detect local changes:', error);
    // On error, assume changes exist to be safe
    return true;
  }
}

/**
 * Sync push handler - /api/sync/push
 * Uploads the database to Google Drive
 */
export async function handleSyncPush(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  // Get stored tokens
  const tokensStored = localStorage.getItem('puffin_oauth_tokens');
  if (!tokensStored) {
    throw new Error('Not authenticated. Please sign in with Google first.');
  }

  const tokens = JSON.parse(tokensStored);
  const accessToken = tokens.access_token;

  if (!accessToken) {
    throw new Error('No access token available. Please sign in again.');
  }

  // Get sync config
  const config = getSyncConfig();
  if (!config.folderId && !config.backupFileId) {
    throw new Error('Sync not configured. Please select a folder or file first.');
  }

  try {
    // Import Tauri filesystem and path APIs
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');

    // Create a backup first
    const dataDir = await appDataDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
    const backupPath = await join(dataDir, 'backups', `pre-sync-${timestamp}.db`);

    // Ensure backups directory exists
    const { mkdir, exists } = await import('@tauri-apps/plugin-fs');
    const backupsDir = await join(dataDir, 'backups');
    if (!await exists(backupsDir)) {
      await mkdir(backupsDir, { recursive: true });
    }

    // Create backup using VACUUM INTO
    const { getDatabase } = await import('../tauri-db');
    const db = await getDatabase();
    await db.execute(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);

    // Checkpoint WAL to ensure all data is in main file
    await db.execute('PRAGMA wal_checkpoint(TRUNCATE)');

    // Read the database file
    const dbPath = await join(dataDir, 'puffin.db');
    const fileData = await readFile(dbPath);

    // Upload to Google Drive
    const fileName = 'puffin-backup.db';

    if (config.isFileBasedSync && config.backupFileId) {
      // Update existing file
      const updateResponse = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${config.backupFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
          },
          body: fileData,
        }
      );

      if (!updateResponse.ok) {
        const err = await updateResponse.json().catch(() => ({}));
        throw new Error(err.error?.message || 'Failed to upload file');
      }
    } else if (config.folderId) {
      // Check if file already exists in folder
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${config.folderId}'+in+parents+and+name='${fileName}'+and+trashed=false&fields=files(id,name)`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!searchResponse.ok) {
        throw new Error('Failed to search for existing backup');
      }

      const searchData = await searchResponse.json();
      const existingFile = searchData.files?.[0];

      if (existingFile) {
        // Update existing file
        const updateResponse = await fetch(
          `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/octet-stream',
            },
            body: fileData,
          }
        );

        if (!updateResponse.ok) {
          const err = await updateResponse.json().catch(() => ({}));
          throw new Error(err.error?.message || 'Failed to update file');
        }
      } else {
        // Create new file with multipart upload
        const metadata = {
          name: fileName,
          parents: [config.folderId],
        };

        const boundary = '-------314159265358979323846';
        const delimiter = '\r\n--' + boundary + '\r\n';
        const closeDelimiter = '\r\n--' + boundary + '--';

        // Convert Uint8Array to base64
        const base64Data = btoa(String.fromCharCode(...fileData));

        const multipartBody =
          delimiter +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: application/octet-stream\r\n' +
          'Content-Transfer-Encoding: base64\r\n\r\n' +
          base64Data +
          closeDelimiter;

        const createResponse = await fetch(
          'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': `multipart/related; boundary=${boundary}`,
            },
            body: multipartBody,
          }
        );

        if (!createResponse.ok) {
          const err = await createResponse.json().catch(() => ({}));
          throw new Error(err.error?.message || 'Failed to create file');
        }
      }
    }

    // Compute and save the database hash for change detection
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const dbHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Update sync config with hash
    saveSyncConfig({
      ...config,
      lastSyncedAt: new Date().toISOString(),
      syncedDbHash: dbHash,
    });

    return { success: true };
  } catch (error) {
    console.error('Sync push error:', error);
    throw error;
  }
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
  localStorage.removeItem(SYNC_CREDENTIALS_KEY);
  localStorage.removeItem(OAUTH_CONFIGURED_KEY);
  localStorage.removeItem(OAUTH_AUTHENTICATED_KEY);
  localStorage.removeItem(OAUTH_EXTENDED_SCOPE_KEY);

  return { success: true };
}

/**
 * Sync credentials handler - /api/sync/credentials
 */
export async function handleSyncCredentials(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  switch (method) {
    case 'GET':
      return getCredentials();
    case 'POST':
      return saveCredentials(body as Partial<SyncCredentials>);
    case 'DELETE':
      return clearCredentials();
    default:
      throw new Error(`Method ${method} not allowed`);
  }
}

function getCredentials(): { clientId: string; apiKey: string; configured: boolean; hasApiKey: boolean } {
  try {
    const stored = localStorage.getItem(SYNC_CREDENTIALS_KEY);
    if (stored) {
      const creds = JSON.parse(stored) as SyncCredentials;
      return {
        clientId: creds.clientId || '',
        apiKey: creds.apiKey || '',
        configured: !!(creds.clientId && creds.clientSecret),
        hasApiKey: !!creds.apiKey,
      };
    }
  } catch {
    // Ignore parse errors
  }

  return {
    clientId: '',
    apiKey: '',
    configured: false,
    hasApiKey: false,
  };
}

function saveCredentials(data: Partial<SyncCredentials>): { success: boolean } {
  if (!data.clientId || !data.clientSecret) {
    throw new Error('Client ID and Client Secret are required');
  }

  if (!data.clientId.includes('.apps.googleusercontent.com')) {
    throw new Error('Invalid Client ID format. It should end with .apps.googleusercontent.com');
  }

  const creds: SyncCredentials = {
    clientId: data.clientId.trim(),
    clientSecret: data.clientSecret.trim(),
    apiKey: (data.apiKey || '').trim(),
  };

  localStorage.setItem(SYNC_CREDENTIALS_KEY, JSON.stringify(creds));
  localStorage.setItem(OAUTH_CONFIGURED_KEY, 'true');

  return { success: true };
}

function clearCredentials(): { success: boolean } {
  localStorage.removeItem(SYNC_CREDENTIALS_KEY);
  localStorage.removeItem(SYNC_CONFIG_KEY);
  localStorage.removeItem(OAUTH_CONFIGURED_KEY);
  localStorage.removeItem(OAUTH_AUTHENTICATED_KEY);
  localStorage.removeItem(OAUTH_EXTENDED_SCOPE_KEY);

  return { success: true };
}

/**
 * OAuth URL handler - /api/sync/oauth/url
 *
 * NOTE: In Tauri mode, OAuth is handled by the start_oauth_flow Tauri command
 * which starts a local callback server. This handler is kept for dev mode fallback
 * but should throw an error in Tauri mode to ensure the correct flow is used.
 */
export async function handleOAuthUrl(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'GET') {
    throw new Error(`Method ${method} not allowed`);
  }

  // In Tauri mode, OAuth should be handled by the start_oauth_flow command
  // This handler should not be called - the frontend should use invoke() directly
  throw new Error(
    'OAuth in desktop mode uses the native flow. ' +
    'Please ensure you are using the latest version of the app.'
  );
}

/**
 * Sync validate handler - /api/sync/validate
 */
export async function handleSyncValidate(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  // Folder validation requires OAuth token - not fully supported in Tauri mode yet
  throw new Error('Folder validation requires OAuth authentication. Please complete OAuth setup first.');
}

/**
 * Sync pull handler - /api/sync/pull
 * Downloads the database from Google Drive
 */
export async function handleSyncPull(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  // Get stored tokens
  const tokensStored = localStorage.getItem('puffin_oauth_tokens');
  if (!tokensStored) {
    throw new Error('Not authenticated. Please sign in with Google first.');
  }

  const tokens = JSON.parse(tokensStored);
  const accessToken = tokens.access_token;

  if (!accessToken) {
    throw new Error('No access token available. Please sign in again.');
  }

  // Get sync config
  const config = getSyncConfig();
  if (!config.folderId && !config.backupFileId) {
    throw new Error('Sync not configured. Please select a folder or file first.');
  }

  try {
    // Import Tauri filesystem and path APIs
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');

    // Create a backup first
    const dataDir = await appDataDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_');
    const backupPath = await join(dataDir, 'backups', `pre-pull-${timestamp}.db`);

    // Ensure backups directory exists
    const { mkdir, exists } = await import('@tauri-apps/plugin-fs');
    const backupsDir = await join(dataDir, 'backups');
    if (!await exists(backupsDir)) {
      await mkdir(backupsDir, { recursive: true });
    }

    // Create backup of current database
    const { getDatabase, resetDatabaseConnection } = await import('../tauri-db');
    const db = await getDatabase();
    await db.execute(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);

    // Find the file to download
    let fileId: string | null = null;

    if (config.isFileBasedSync && config.backupFileId) {
      fileId = config.backupFileId;
    } else if (config.folderId) {
      // Search for puffin-backup.db in folder
      const searchResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${config.folderId}'+in+parents+and+name='puffin-backup.db'+and+trashed=false&fields=files(id,name)`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        }
      );

      if (!searchResponse.ok) {
        throw new Error('Failed to search for backup file');
      }

      const searchData = await searchResponse.json();
      fileId = searchData.files?.[0]?.id;

      if (!fileId) {
        throw new Error('No backup file found in the sync folder');
      }
    }

    if (!fileId) {
      throw new Error('No backup file configured');
    }

    // Download the file
    const downloadResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    if (!downloadResponse.ok) {
      const err = await downloadResponse.json().catch(() => ({}));
      throw new Error(err.error?.message || 'Failed to download backup file');
    }

    const fileData = new Uint8Array(await downloadResponse.arrayBuffer());

    // Close the current database connection
    await resetDatabaseConnection();

    // Write the downloaded file
    const dbPath = await join(dataDir, 'puffin.db');
    await writeFile(dbPath, fileData);

    // Clean up any stale WAL files
    const { remove } = await import('@tauri-apps/plugin-fs');
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';

    if (await exists(walPath)) {
      try {
        await remove(walPath);
      } catch {
        // Ignore removal errors
      }
    }
    if (await exists(shmPath)) {
      try {
        await remove(shmPath);
      } catch {
        // Ignore removal errors
      }
    }

    // Compute and save the database hash for change detection
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const dbHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Update sync config with hash
    saveSyncConfig({
      ...config,
      lastSyncedAt: new Date().toISOString(),
      syncedDbHash: dbHash,
    });

    return { success: true };
  } catch (error) {
    console.error('Sync pull error:', error);
    throw error;
  }
}

/**
 * Refresh an expired access token using the refresh token.
 * Google does NOT return a new refresh_token - keep using the original one.
 */
async function refreshAccessToken(
  refreshToken: string,
  credentials: SyncCredentials
): Promise<{ access_token: string; expires_in: number }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error_description || 'Failed to refresh token');
  }

  return response.json();
}

/**
 * Access token handler - /api/sync/token
 * Returns the stored OAuth access token for the Google Picker.
 * Automatically refreshes the token if expired.
 */
export async function handleSyncToken(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'GET') {
    throw new Error(`Method ${method} not allowed`);
  }

  // Get stored tokens from localStorage
  const stored = localStorage.getItem('puffin_oauth_tokens');
  if (!stored) {
    throw new Error('Not authenticated. Please sign in with Google first.');
  }

  let tokens: {
    access_token: string;
    refresh_token?: string;
    expiry_date?: number;
    token_type?: string;
    scope?: string;
  };

  try {
    tokens = JSON.parse(stored);
  } catch {
    throw new Error('Invalid token data');
  }

  // Check if token is expired
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    // Token expired - attempt refresh
    if (!tokens.refresh_token) {
      throw new Error('Access token expired and no refresh token available. Please sign in again.');
    }

    // Get credentials for refresh
    const credentialsStored = localStorage.getItem(SYNC_CREDENTIALS_KEY);
    if (!credentialsStored) {
      throw new Error('OAuth credentials not found. Please sign in again.');
    }

    let credentials: SyncCredentials;
    try {
      credentials = JSON.parse(credentialsStored);
    } catch {
      throw new Error('Invalid credentials data. Please sign in again.');
    }

    try {
      const refreshed = await refreshAccessToken(tokens.refresh_token, credentials);

      // Update stored tokens (keep original refresh_token)
      const updatedTokens = {
        ...tokens,
        access_token: refreshed.access_token,
        expiry_date: Date.now() + (refreshed.expires_in * 1000),
      };
      localStorage.setItem('puffin_oauth_tokens', JSON.stringify(updatedTokens));

      return { accessToken: refreshed.access_token };
    } catch (e) {
      // Refresh failed - user needs to re-authenticate
      console.error('Token refresh failed:', e);
      throw new Error('Failed to refresh access token. Please sign in again.');
    }
  }

  return { accessToken: tokens.access_token };
}

/**
 * OAuth token exchange handler - /api/sync/oauth/token
 * Exchanges authorization code for access tokens in Tauri mode
 */
export async function handleOAuthToken(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  const { code, state, redirectUri } = body as { code: string; state?: string; redirectUri?: string };

  if (!code) {
    throw new Error('Authorization code is required');
  }

  // Get stored credentials
  const stored = localStorage.getItem(SYNC_CREDENTIALS_KEY);
  if (!stored) {
    throw new Error('OAuth credentials not found');
  }

  const credentials = JSON.parse(stored) as SyncCredentials;

  // Use the provided redirect URI or fall back to localhost
  // The redirect URI must match what was used in the authorization request
  const finalRedirectUri = redirectUri || 'http://127.0.0.1';

  // Exchange code for tokens via Google's token endpoint
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: finalRedirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const errorData = await tokenResponse.json().catch(() => ({}));
    throw new Error(errorData.error_description || errorData.error || 'Failed to exchange authorization code');
  }

  const tokens = await tokenResponse.json();

  if (!tokens.access_token) {
    throw new Error('No access token received from Google');
  }

  // Parse state to get scope level
  let scopeLevel = 'standard';
  if (state) {
    try {
      const stateData = JSON.parse(atob(state));
      scopeLevel = stateData.scopeLevel || 'standard';
    } catch {
      // Ignore parse errors
    }
  }

  // Store tokens in localStorage
  const tokenData = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: Date.now() + (tokens.expires_in * 1000),
    token_type: tokens.token_type || 'Bearer',
    scope: tokens.scope || '',
  };

  localStorage.setItem('puffin_oauth_tokens', JSON.stringify(tokenData));
  localStorage.setItem(OAUTH_AUTHENTICATED_KEY, 'true');

  // Check if we have extended scope (full drive access, not just drive.file)
  // Split by space and check for exact match to avoid matching drive.file
  const grantedScopes = (tokens.scope || '').split(' ');
  const hasFullDriveAccess = grantedScopes.includes('https://www.googleapis.com/auth/drive');
  if (hasFullDriveAccess) {
    localStorage.setItem(OAUTH_EXTENDED_SCOPE_KEY, 'true');
  } else {
    // Clear extended scope flag if we got standard scope
    localStorage.removeItem(OAUTH_EXTENDED_SCOPE_KEY);
  }

  // Fetch user email
  try {
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      if (userInfo.email) {
        const config = getSyncConfig();
        saveSyncConfig({ ...config, userEmail: userInfo.email });
      }
    }
  } catch {
    // Non-fatal error, continue without email
  }

  return { success: true, scopeLevel };
}
