/**
 * Google Drive Sync Configuration Types
 */

export interface SyncConfig {
  /** Google Drive folder ID */
  folderId: string | null;
  /** Google Drive folder name (for display) */
  folderName: string | null;
  /** Whether sync is fully configured and validated */
  isConfigured: boolean;
  /** Last successful sync timestamp */
  lastSyncedAt: string | null;
  /** User's Google email (for display) */
  userEmail: string | null;
  /** Hash of the local database at the time of last sync - used to detect local changes */
  syncedDbHash: string | null;
  /** Backup file ID in Google Drive (for multi-account access) */
  backupFileId: string | null;
  /** True when syncing to a shared file (multi-account mode) instead of a folder */
  isFileBasedSync: boolean;
}

export interface SyncStatus {
  /** Current sync operation state */
  state: 'idle' | 'syncing' | 'error';
  /** Error message if state is 'error' */
  error?: string;
  /** Progress percentage (0-100) during sync */
  progress?: number;
  /** Current operation description */
  operation?: string;
}

export interface SyncCheckResponse {
  syncRequired: boolean;
  reason: 'not_configured' | 'no_cloud_backup' | 'never_synced' | 'in_sync' | 'local_only' | 'cloud_only' | 'conflict' | 'check_failed';
  message?: string;
  canEdit: boolean;
  hasLocalChanges?: boolean;
  hasCloudChanges?: boolean;
  cloudModifiedAt?: string;
  lastSyncedAt?: string;
  warning?: string;
}

export interface FolderValidationResult {
  success: boolean;
  folderId?: string;
  folderName?: string;
  error?: string;
  errorCode?: 'NOT_FOUND' | 'NO_ACCESS' | 'READ_ONLY' | 'INVALID_URL' | 'AUTH_REQUIRED';
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope: string;
}

/**
 * Extract folder ID from a Google Drive URL
 * Supports formats:
 * - https://drive.google.com/drive/folders/FOLDER_ID
 * - https://drive.google.com/drive/u/0/folders/FOLDER_ID
 * - https://drive.google.com/drive/folders/FOLDER_ID?usp=sharing
 * - Just the folder ID itself
 */
export function extractFolderIdFromUrl(input: string): string | null {
  if (!input) return null;
  
  const trimmed = input.trim();
  
  // If it looks like just a folder ID (alphanumeric with dashes/underscores, 20-50 chars)
  if (/^[\w-]{20,50}$/.test(trimmed)) {
    return trimmed;
  }
  
  // Try to extract from URL
  const patterns = [
    /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([^/?]+)/,
    /drive\.google\.com\/.*[?&]id=([^&]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }
  
  return null;
}

