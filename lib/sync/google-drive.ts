/**
 * Google Drive Service
 * Handles all Google Drive API operations for sync
 */

import { google, drive_v3 } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { getAuthenticatedClient } from './oauth';
import { SyncConfigManager } from './config';
import type { FolderValidationResult } from '@/types/sync';

const DATABASE_FILENAME = 'puffin-backup.db';
const VALIDATION_TEST_FILENAME = '.puffin-validation-test';

/**
 * Sanitize a Google Drive ID for use in query strings
 * Removes any characters that could be used for query injection
 */
function sanitizeDriveId(id: string): string {
  // Google Drive IDs are alphanumeric with dashes and underscores
  return id.replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * Build a safe query for finding files in a folder
 */
function buildFolderQuery(folderId: string, filename: string): string {
  const safeId = sanitizeDriveId(folderId);
  const safeName = filename.replace(/'/g, "\\'");
  return `'${safeId}' in parents and name='${safeName}' and trashed=false`;
}

/**
 * Retry configuration for transient API errors
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504], // Rate limit and server errors
};

/**
 * Execute a function with exponential backoff retry for transient errors
 * @param fn - Async function to execute
 * @param context - Description of the operation for logging
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  context: string
): Promise<T> {
  let lastError: Error | undefined;
  let delay = RETRY_CONFIG.initialDelayMs;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error as Error;
      const gError = error as { code?: number; message?: string };

      // Check if error is retryable
      const isRetryable = gError.code && RETRY_CONFIG.retryableStatusCodes.includes(gError.code);

      if (!isRetryable || attempt === RETRY_CONFIG.maxRetries) {
        throw error;
      }

      console.warn(`[GoogleDrive] ${context} failed (attempt ${attempt}/${RETRY_CONFIG.maxRetries}), retrying in ${delay}ms:`, gError.message);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));

      // Exponential backoff with cap
      delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Google Drive Service for sync operations
 */
export class GoogleDriveService {
  private drive: drive_v3.Drive | null = null;

  /**
   * Initialize the Drive service with authenticated client
   */
  async initialize(): Promise<boolean> {
    const client = await getAuthenticatedClient();
    if (!client) {
      return false;
    }
    this.drive = google.drive({ version: 'v3', auth: client });
    return true;
  }

  /**
   * Validate a folder by ID - checks existence, access, and write permissions
   */
  async validateFolder(folderId: string): Promise<FolderValidationResult> {
    if (!this.drive) {
      const initialized = await this.initialize();
      if (!initialized) {
        return { 
          success: false, 
          error: 'Not authenticated with Google', 
          errorCode: 'AUTH_REQUIRED' 
        };
      }
    }

    try {
      // Step 1: Get folder metadata to verify it exists and user has access
      const folderResponse = await this.drive!.files.get({
        fileId: folderId,
        fields: 'id,name,mimeType,capabilities',
      });

      const folder = folderResponse.data;

      // Verify it's actually a folder
      if (folder.mimeType !== 'application/vnd.google-apps.folder') {
        return { 
          success: false, 
          error: 'The provided ID is not a folder', 
          errorCode: 'NOT_FOUND' 
        };
      }

      // Step 2: Test write access by creating and deleting a test file
      const testFile = await this.drive!.files.create({
        requestBody: {
          name: VALIDATION_TEST_FILENAME,
          parents: [folderId],
        },
        fields: 'id',
      });

      if (testFile.data.id) {
        // Clean up test file
        await this.drive!.files.delete({ fileId: testFile.data.id });
      }

      return {
        success: true,
        folderId: folder.id!,
        folderName: folder.name!,
      };
    } catch (error: unknown) {
      const gError = error as { code?: number; message?: string };
      console.error('Folder validation error:', error);

      if (gError.code === 404) {
        return { 
          success: false, 
          error: 'Folder not found. Please check the URL and try again.', 
          errorCode: 'NOT_FOUND' 
        };
      }

      if (gError.code === 403) {
        // Check if it's a read-only access issue
        if (gError.message?.includes('write')) {
          return { 
            success: false, 
            error: 'You only have read-only access to this folder. Please request edit access from the folder owner.', 
            errorCode: 'READ_ONLY' 
          };
        }
        return { 
          success: false, 
          error: 'You don\'t have access to this folder. Please check the sharing settings.', 
          errorCode: 'NO_ACCESS' 
        };
      }

      return { 
        success: false, 
        error: gError.message || 'Failed to validate folder access', 
      };
    }
  }

  /**
   * Upload database to Google Drive
   */
  async uploadDatabase(localDbPath: string, folderId: string): Promise<{ success: boolean; error?: string; fileId?: string }> {
    if (!this.drive) {
      const initialized = await this.initialize();
      if (!initialized) {
        return { success: false, error: 'Not authenticated with Google' };
      }
    }

    try {
      // Check if backup file already exists in folder
      const existingFiles = await withRetry(
        () => this.drive!.files.list({
          q: buildFolderQuery(folderId, DATABASE_FILENAME),
          fields: 'files(id,name)',
        }),
        'list files in folder'
      );

      const existingFile = existingFiles.data.files?.[0];
      let fileId: string;

      if (existingFile?.id) {
        // Update existing file
        const existingFileId = existingFile.id;
        await withRetry(
          () => this.drive!.files.update({
            fileId: existingFileId,
            media: {
              mimeType: 'application/x-sqlite3',
              body: fs.createReadStream(localDbPath),
            },
          }),
          'update database file'
        );
        fileId = existingFileId;
      } else {
        // Create new file
        const createResult = await withRetry(
          () => this.drive!.files.create({
            requestBody: {
              name: DATABASE_FILENAME,
              parents: [folderId],
            },
            media: {
              mimeType: 'application/x-sqlite3',
              body: fs.createReadStream(localDbPath),
            },
            fields: 'id',
          }),
          'create database file'
        );
        fileId = createResult.data.id!;
      }

      // Update last synced timestamp
      SyncConfigManager.updateLastSynced();

      return { success: true, fileId };
    } catch (error: unknown) {
      const gError = error as { message?: string };
      console.error('Upload error:', error);
      return {
        success: false,
        error: gError.message || 'Failed to upload database'
      };
    }
  }

  /**
   * Download database from Google Drive
   */
  async downloadDatabase(folderId: string, localDestPath: string): Promise<{ success: boolean; error?: string; notFound?: boolean }> {
    if (!this.drive) {
      const initialized = await this.initialize();
      if (!initialized) {
        return { success: false, error: 'Not authenticated with Google' };
      }
    }

    try {
      // Find the backup file in the folder
      const files = await withRetry(
        () => this.drive!.files.list({
          q: buildFolderQuery(folderId, DATABASE_FILENAME),
          fields: 'files(id,name,modifiedTime)',
        }),
        'list files for download'
      );

      const backupFile = files.data.files?.[0];
      if (!backupFile?.id) {
        return { success: false, error: 'No backup found in the sync folder', notFound: true };
      }

      // Download the file
      const backupFileId = backupFile.id;
      const response = await withRetry(
        () => this.drive!.files.get(
          { fileId: backupFileId, alt: 'media' },
          { responseType: 'stream' }
        ),
        'download database file'
      );

      // Ensure destination directory exists
      const destDir = path.dirname(localDestPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Write to destination with timeout
      return new Promise((resolve) => {
        const dest = fs.createWriteStream(localDestPath);
        const stream = response.data as NodeJS.ReadableStream & { destroy?: () => void };
        
        // Timeout after 2 minutes
        const timeout = setTimeout(() => {
          if (stream.destroy) stream.destroy();
          dest.close();
          resolve({ success: false, error: 'Download timed out' });
        }, 120000);

        stream
          .on('error', (err: Error) => {
            clearTimeout(timeout);
            dest.close();
            resolve({ success: false, error: err.message });
          })
          .pipe(dest)
          .on('finish', () => {
            clearTimeout(timeout);
            SyncConfigManager.updateLastSynced();
            resolve({ success: true });
          })
          .on('error', (err: Error) => {
            clearTimeout(timeout);
            resolve({ success: false, error: err.message });
          });
      });
    } catch (error: unknown) {
      const gError = error as { message?: string };
      console.error('Download error:', error);
      return { 
        success: false, 
        error: gError.message || 'Failed to download database' 
      };
    }
  }

  /**
   * Get the last modified time of the remote backup
   */
  async getRemoteBackupInfo(folderId: string): Promise<{ exists: boolean; modifiedTime?: Date; error?: string }> {
    if (!this.drive) {
      const initialized = await this.initialize();
      if (!initialized) {
        return { exists: false, error: 'Not authenticated with Google' };
      }
    }

    try {
      const files = await this.drive!.files.list({
        q: buildFolderQuery(folderId, DATABASE_FILENAME),
        fields: 'files(id,name,modifiedTime)',
      });

      const backupFile = files.data.files?.[0];
      if (!backupFile) {
        return { exists: false };
      }

      return {
        exists: true,
        modifiedTime: backupFile.modifiedTime ? new Date(backupFile.modifiedTime) : undefined,
      };
    } catch (error: unknown) {
      const gError = error as { message?: string };
      console.error('Get remote backup info error:', error);
      return {
        exists: false,
        error: gError.message || 'Failed to get backup info'
      };
    }
  }

  /**
   * Get file info by ID (for multi-account sync validation)
   */
  async getFileInfo(fileId: string): Promise<{ success: boolean; name?: string; modifiedTime?: Date; error?: string }> {
    if (!this.drive) {
      const initialized = await this.initialize();
      if (!initialized) {
        return { success: false, error: 'Not authenticated with Google' };
      }
    }

    try {
      const response = await this.drive!.files.get({
        fileId,
        fields: 'id,name,modifiedTime,mimeType',
        supportsAllDrives: true,
      });

      return {
        success: true,
        name: response.data.name || undefined,
        modifiedTime: response.data.modifiedTime ? new Date(response.data.modifiedTime) : undefined,
      };
    } catch (error: unknown) {
      const gError = error as { code?: number; message?: string };
      console.error('Get file info error:', error);

      if (gError.code === 404) {
        return { success: false, error: 'File not found' };
      }
      if (gError.code === 403) {
        return { success: false, error: 'You don\'t have access to this file' };
      }

      return {
        success: false,
        error: gError.message || 'Failed to get file info'
      };
    }
  }

  /**
   * Upload database to an existing file by ID (for multi-account sync)
   */
  async uploadDatabaseByFileId(localDbPath: string, fileId: string): Promise<{ success: boolean; error?: string }> {
    if (!this.drive) {
      const initialized = await this.initialize();
      if (!initialized) {
        return { success: false, error: 'Not authenticated with Google' };
      }
    }

    try {
      // supportsAllDrives is required to update files shared from other accounts
      await withRetry(
        () => this.drive!.files.update({
          fileId,
          supportsAllDrives: true,
          media: {
            mimeType: 'application/x-sqlite3',
            body: fs.createReadStream(localDbPath),
          },
        }),
        'update database by file ID'
      );

      SyncConfigManager.updateLastSynced();
      return { success: true };
    } catch (error: unknown) {
      const gError = error as { code?: number; message?: string };
      console.error('Upload by file ID error:', error);

      if (gError.code === 404) {
        return {
          success: false,
          error: 'Cannot access backup file. This may happen if: (1) The file was deleted, (2) You need to re-authenticate with extended permissions for multi-account sync, or (3) The file hasn\'t been shared with your account. Try disconnecting and reconnecting with "Connect to Existing Backup".'
        };
      }
      if (gError.code === 403) {
        return {
          success: false,
          error: 'You don\'t have permission to update this file. Ensure the file is shared with edit access, or try re-authenticating with extended permissions.'
        };
      }

      return {
        success: false,
        error: gError.message || 'Failed to upload database'
      };
    }
  }

  /**
   * Download database by file ID (for multi-account sync)
   */
  async downloadDatabaseByFileId(fileId: string, localDestPath: string): Promise<{ success: boolean; error?: string }> {
    if (!this.drive) {
      const initialized = await this.initialize();
      if (!initialized) {
        return { success: false, error: 'Not authenticated with Google' };
      }
    }

    try {
      // supportsAllDrives is required to access files shared from other accounts
      const response = await this.drive!.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      );

      // Ensure destination directory exists
      const destDir = path.dirname(localDestPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      // Write to destination with timeout
      return new Promise((resolve) => {
        const dest = fs.createWriteStream(localDestPath);
        const stream = response.data as NodeJS.ReadableStream & { destroy?: () => void };

        // Timeout after 2 minutes
        const timeout = setTimeout(() => {
          if (stream.destroy) stream.destroy();
          dest.close();
          resolve({ success: false, error: 'Download timed out' });
        }, 120000);

        stream
          .on('error', (err: Error) => {
            clearTimeout(timeout);
            dest.close();
            resolve({ success: false, error: err.message });
          })
          .pipe(dest)
          .on('finish', () => {
            clearTimeout(timeout);
            SyncConfigManager.updateLastSynced();
            resolve({ success: true });
          })
          .on('error', (err: Error) => {
            clearTimeout(timeout);
            resolve({ success: false, error: err.message });
          });
      });
    } catch (error: unknown) {
      const gError = error as { code?: number; message?: string };
      console.error('Download by file ID error:', error);

      if (gError.code === 404) {
        return { success: false, error: 'Backup file not found' };
      }
      if (gError.code === 403) {
        return { success: false, error: 'You don\'t have access to this file' };
      }

      return {
        success: false,
        error: gError.message || 'Failed to download database'
      };
    }
  }

  /**
   * Get backup info by file ID (for multi-account sync)
   */
  async getRemoteBackupInfoByFileId(fileId: string): Promise<{ exists: boolean; modifiedTime?: Date; error?: string }> {
    const result = await this.getFileInfo(fileId);
    if (!result.success) {
      return { exists: false, error: result.error };
    }
    return {
      exists: true,
      modifiedTime: result.modifiedTime,
    };
  }
}

