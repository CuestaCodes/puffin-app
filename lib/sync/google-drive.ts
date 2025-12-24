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
      const existingFiles = await this.drive!.files.list({
        q: `'${folderId}' in parents and name='${DATABASE_FILENAME}' and trashed=false`,
        fields: 'files(id,name)',
      });

      const existingFile = existingFiles.data.files?.[0];
      let fileId: string;

      if (existingFile?.id) {
        // Update existing file
        await this.drive!.files.update({
          fileId: existingFile.id,
          media: {
            mimeType: 'application/x-sqlite3',
            body: fs.createReadStream(localDbPath),
          },
        });
        fileId = existingFile.id;
      } else {
        // Create new file
        const createResult = await this.drive!.files.create({
          requestBody: {
            name: DATABASE_FILENAME,
            parents: [folderId],
          },
          media: {
            mimeType: 'application/x-sqlite3',
            body: fs.createReadStream(localDbPath),
          },
          fields: 'id',
        });
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
      const files = await this.drive!.files.list({
        q: `'${folderId}' in parents and name='${DATABASE_FILENAME}' and trashed=false`,
        fields: 'files(id,name,modifiedTime)',
      });

      const backupFile = files.data.files?.[0];
      if (!backupFile?.id) {
        return { success: false, error: 'No backup found in the sync folder', notFound: true };
      }

      // Download the file
      const response = await this.drive!.files.get(
        { fileId: backupFile.id, alt: 'media' },
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
        q: `'${folderId}' in parents and name='${DATABASE_FILENAME}' and trashed=false`,
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
}

