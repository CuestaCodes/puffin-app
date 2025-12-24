/**
 * Sync Configuration Manager
 * Handles reading/writing sync configuration to a local JSON file
 * Configuration is stored outside the SQLite database for portability
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { SyncConfig, OAuthTokens } from '@/types/sync';

// Configuration file paths
const DATA_DIR = process.env.PUFFIN_DATA_DIR || path.join(process.cwd(), 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'sync-config.json');
const TOKENS_FILE = path.join(DATA_DIR, '.sync-tokens.enc');
const CREDENTIALS_FILE = path.join(DATA_DIR, '.sync-credentials.enc');

// Encryption key derived from machine-specific data (simplified for dev mode)
// In production/Tauri, this would use Windows Credential Manager
const ENCRYPTION_KEY = crypto
  .createHash('sha256')
  .update(process.env.SYNC_ENCRYPTION_KEY || 'puffin-dev-key-change-in-prod')
  .digest();

interface StoredConfig {
  folderId: string | null;
  folderName: string | null;
  lastSyncedAt: string | null;
  userEmail: string | null;
  /** Hash of local DB at the time of last sync - used to detect local changes */
  syncedDbHash: string | null;
  backupFileId: string | null;
  /** True when syncing to a shared file (multi-account mode) instead of a folder */
  isFileBasedSync: boolean;
}

/**
 * Google OAuth credentials (entered by user on first run)
 */
export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
  apiKey: string;
}

/**
 * Manages sync configuration storage
 */
export class SyncConfigManager {
  /**
   * Ensure data directory exists
   */
  private static ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  /**
   * Read sync configuration from file
   */
  static getConfig(): SyncConfig {
    const defaultConfig: SyncConfig = {
      folderId: null,
      folderName: null,
      isConfigured: false,
      lastSyncedAt: null,
      userEmail: null,
      syncedDbHash: null,
      backupFileId: null,
      isFileBasedSync: false,
    };

    try {
      if (!fs.existsSync(CONFIG_FILE)) {
        return defaultConfig;
      }

      const data = fs.readFileSync(CONFIG_FILE, 'utf-8');
      const stored: StoredConfig = JSON.parse(data);

      // Configured if we have either a folder ID or file-based sync with a backup file ID
      const isConfigured = !!stored.folderId || (stored.isFileBasedSync && !!stored.backupFileId);

      return {
        folderId: stored.folderId,
        folderName: stored.folderName,
        isConfigured,
        lastSyncedAt: stored.lastSyncedAt,
        userEmail: stored.userEmail,
        syncedDbHash: stored.syncedDbHash || null,
        backupFileId: stored.backupFileId || null,
        isFileBasedSync: stored.isFileBasedSync || false,
      };
    } catch (error) {
      console.error('Failed to read sync config:', error);
      return defaultConfig;
    }
  }

  /**
   * Save sync configuration to file
   */
  static saveConfig(config: Partial<StoredConfig>): void {
    this.ensureDataDir();

    const existing = this.getConfig();
    const updated: StoredConfig = {
      folderId: config.folderId ?? existing.folderId,
      folderName: config.folderName ?? existing.folderName,
      lastSyncedAt: config.lastSyncedAt ?? existing.lastSyncedAt,
      userEmail: config.userEmail ?? existing.userEmail,
      syncedDbHash: config.syncedDbHash ?? existing.syncedDbHash,
      backupFileId: config.backupFileId ?? existing.backupFileId,
      isFileBasedSync: config.isFileBasedSync ?? existing.isFileBasedSync,
    };

    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  }

  /**
   * Update last synced timestamp
   */
  static updateLastSynced(): void {
    this.saveConfig({ lastSyncedAt: new Date().toISOString() });
  }

  /**
   * Clear all sync configuration (disconnect)
   */
  static clearConfig(): void {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        fs.unlinkSync(CONFIG_FILE);
      }
      if (fs.existsSync(TOKENS_FILE)) {
        fs.unlinkSync(TOKENS_FILE);
      }
    } catch (error) {
      console.error('Failed to clear sync config:', error);
      throw error;
    }
  }

  /**
   * Encrypt and store OAuth tokens
   */
  static saveTokens(tokens: OAuthTokens): void {
    this.ensureDataDir();

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(JSON.stringify(tokens), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const data = {
      iv: iv.toString('hex'),
      data: encrypted,
    };
    
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(data), 'utf-8');
  }

  /**
   * Read and decrypt OAuth tokens
   */
  static getTokens(): OAuthTokens | null {
    try {
      if (!fs.existsSync(TOKENS_FILE)) {
        return null;
      }

      const stored = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
      const iv = Buffer.from(stored.iv, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
      
      let decrypted = decipher.update(stored.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Failed to read tokens:', error);
      return null;
    }
  }

  /**
   * Check if OAuth tokens exist
   */
  static hasTokens(): boolean {
    return fs.existsSync(TOKENS_FILE);
  }

  /**
   * Encrypt and store Google OAuth credentials
   */
  static saveCredentials(credentials: GoogleCredentials): void {
    this.ensureDataDir();

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    
    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const data = {
      iv: iv.toString('hex'),
      data: encrypted,
    };
    
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(data), 'utf-8');
  }

  /**
   * Read and decrypt Google OAuth credentials
   */
  static getCredentials(): GoogleCredentials | null {
    try {
      // First check environment variables (for development)
      const envClientId = process.env.GOOGLE_CLIENT_ID;
      const envClientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const envApiKey = process.env.GOOGLE_API_KEY;
      
      if (envClientId && envClientSecret) {
        return {
          clientId: envClientId,
          clientSecret: envClientSecret,
          apiKey: envApiKey || '',
        };
      }

      // Then check stored credentials
      if (!fs.existsSync(CREDENTIALS_FILE)) {
        return null;
      }

      const stored = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8'));
      const iv = Buffer.from(stored.iv, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
      
      let decrypted = decipher.update(stored.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      console.error('Failed to read credentials:', error);
      return null;
    }
  }

  /**
   * Check if Google credentials are configured
   */
  static hasCredentials(): boolean {
    return this.getCredentials() !== null;
  }

  /**
   * Clear stored credentials
   */
  static clearCredentials(): void {
    try {
      if (fs.existsSync(CREDENTIALS_FILE)) {
        fs.unlinkSync(CREDENTIALS_FILE);
      }
    } catch (error) {
      console.error('Failed to clear credentials:', error);
    }
  }

  /**
   * Compute hash of the database file
   */
  static computeDbHash(dbPath?: string): string | null {
    const DB_PATH = dbPath || path.join(DATA_DIR, 'puffin.db');
    try {
      if (!fs.existsSync(DB_PATH)) {
        return null;
      }
      const content = fs.readFileSync(DB_PATH);
      return crypto.createHash('md5').update(content).digest('hex');
    } catch (error) {
      console.error('Failed to compute DB hash:', error);
      return null;
    }
  }

  /**
   * Update after successful sync (upload or download)
   * Stores the current local DB hash as the synced hash
   */
  static markSynced(): void {
    const currentHash = this.computeDbHash();
    this.saveConfig({
      syncedDbHash: currentHash,
      lastSyncedAt: new Date().toISOString(),
    });
  }

  /**
   * Check if local database has changed since last sync
   */
  static hasLocalChanges(): boolean {
    const config = this.getConfig();
    if (!config.syncedDbHash) return false; // Never synced, can't detect changes
    
    const currentHash = this.computeDbHash();
    return currentHash !== config.syncedDbHash;
  }

  /**
   * Save the backup file ID for multi-account access
   */
  static setBackupFileId(fileId: string): void {
    this.saveConfig({ backupFileId: fileId });
  }
}

