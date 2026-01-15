/**
 * Tests for SyncConfigManager
 *
 * Tests configuration management, encryption/decryption, and hash computation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SyncConfigManager, GoogleCredentials } from './config';

// Mock the fs module for isolated testing
vi.mock('fs');

// Mock os module
vi.mock('os', () => ({
  default: {
    hostname: () => 'test-host',
    userInfo: () => ({ username: 'test-user' }),
  },
  hostname: () => 'test-host',
  userInfo: () => ({ username: 'test-user' }),
}));

describe('SyncConfigManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.SYNC_ENCRYPTION_KEY;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_API_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getConfig', () => {
    it('should return default config when no config file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const config = SyncConfigManager.getConfig();

      expect(config).toEqual({
        folderId: null,
        folderName: null,
        isConfigured: false,
        lastSyncedAt: null,
        userEmail: null,
        syncedDbHash: null,
        backupFileId: null,
        isFileBasedSync: false,
      });
    });

    it('should return stored config when file exists', () => {
      const storedConfig = {
        folderId: 'folder-123',
        folderName: 'My Sync Folder',
        lastSyncedAt: '2025-01-15T10:00:00.000Z',
        userEmail: 'user@example.com',
        syncedDbHash: 'abc123hash',
        backupFileId: 'backup-456',
        isFileBasedSync: false,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(storedConfig));

      const config = SyncConfigManager.getConfig();

      expect(config.folderId).toBe('folder-123');
      expect(config.folderName).toBe('My Sync Folder');
      expect(config.isConfigured).toBe(true);
      expect(config.userEmail).toBe('user@example.com');
    });

    it('should set isConfigured true for file-based sync with backup file ID', () => {
      const storedConfig = {
        folderId: null,
        folderName: null,
        lastSyncedAt: null,
        userEmail: null,
        syncedDbHash: null,
        backupFileId: 'backup-789',
        isFileBasedSync: true,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(storedConfig));

      const config = SyncConfigManager.getConfig();

      expect(config.isConfigured).toBe(true);
      expect(config.isFileBasedSync).toBe(true);
    });

    it('should return default config on JSON parse error', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('invalid json');

      const config = SyncConfigManager.getConfig();

      expect(config.isConfigured).toBe(false);
      expect(config.folderId).toBeNull();
    });
  });

  describe('saveConfig', () => {
    it('should merge partial config with existing', () => {
      const existingConfig = {
        folderId: 'folder-123',
        folderName: 'My Folder',
        lastSyncedAt: '2025-01-15T10:00:00.000Z',
        userEmail: 'user@example.com',
        syncedDbHash: null,
        backupFileId: null,
        isFileBasedSync: false,
      };

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existingConfig));
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      SyncConfigManager.saveConfig({ userEmail: 'new@example.com' });

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall[1] as string;
      const parsed = JSON.parse(writtenData);

      // Should update userEmail
      expect(parsed.userEmail).toBe('new@example.com');
      // Should preserve existing folderId
      expect(parsed.folderId).toBe('folder-123');
    });

    it('should create data directory if it does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      SyncConfigManager.saveConfig({ folderId: 'new-folder' });

      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });
  });

  describe('clearConfig', () => {
    it('should delete config and tokens files', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockImplementation(() => {});

      SyncConfigManager.clearConfig();

      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
    });

    it('should not throw if files do not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => SyncConfigManager.clearConfig()).not.toThrow();
    });
  });

  describe('saveTokens and getTokens', () => {
    it('should encrypt and decrypt tokens correctly', () => {
      const tokens = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-456',
        expiry_date: Date.now() + 3600000,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/drive.file',
      };

      let savedData: string | null = null;

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.writeFileSync).mockImplementation((_, data) => {
        savedData = data as string;
      });
      vi.mocked(fs.readFileSync).mockImplementation(() => savedData || '');
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      SyncConfigManager.saveTokens(tokens);

      // Verify data was written in encrypted format
      expect(savedData).toBeTruthy();
      const parsed = JSON.parse(savedData!);
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('data');

      // Verify we can read it back
      const retrieved = SyncConfigManager.getTokens();
      expect(retrieved).toEqual(tokens);
    });

    it('should return null when no tokens file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const tokens = SyncConfigManager.getTokens();

      expect(tokens).toBeNull();
    });
  });

  describe('hasTokens', () => {
    it('should return true when tokens file exists', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      expect(SyncConfigManager.hasTokens()).toBe(true);
    });

    it('should return false when tokens file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(SyncConfigManager.hasTokens()).toBe(false);
    });
  });

  describe('saveCredentials and getCredentials', () => {
    it('should encrypt and store credentials', () => {
      const credentials: GoogleCredentials = {
        clientId: 'client-id-123',
        clientSecret: 'client-secret-456',
        apiKey: 'api-key-789',
      };

      let savedData: string | null = null;

      // First call for getConfig check, second for credential read
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return (filePath as string).includes('credentials');
      });
      vi.mocked(fs.writeFileSync).mockImplementation((_, data) => {
        savedData = data as string;
      });
      vi.mocked(fs.readFileSync).mockImplementation(() => savedData || '');
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      SyncConfigManager.saveCredentials(credentials);

      // Verify encrypted format
      expect(savedData).toBeTruthy();
      const parsed = JSON.parse(savedData!);
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('data');

      // Verify we can read back
      const retrieved = SyncConfigManager.getCredentials();
      expect(retrieved).toEqual(credentials);
    });

    it('should return credentials from environment variables', () => {
      process.env.GOOGLE_CLIENT_ID = 'env-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'env-secret';
      process.env.GOOGLE_API_KEY = 'env-api-key';

      const credentials = SyncConfigManager.getCredentials();

      expect(credentials).toEqual({
        clientId: 'env-client-id',
        clientSecret: 'env-secret',
        apiKey: 'env-api-key',
      });
    });

    it('should return null when no credentials available', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const credentials = SyncConfigManager.getCredentials();

      expect(credentials).toBeNull();
    });
  });

  describe('hasCredentials', () => {
    it('should return true when credentials exist', () => {
      process.env.GOOGLE_CLIENT_ID = 'client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'secret';

      expect(SyncConfigManager.hasCredentials()).toBe(true);
    });

    it('should return false when no credentials', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(SyncConfigManager.hasCredentials()).toBe(false);
    });
  });

  describe('computeDbHash', () => {
    it('should compute SHA-256 hash of database file', () => {
      const dbContent = Buffer.from('test database content');
      const expectedHash = crypto.createHash('sha256').update(dbContent).digest('hex');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(dbContent);

      const hash = SyncConfigManager.computeDbHash('/path/to/db');

      expect(hash).toBe(expectedHash);
    });

    it('should return null when database file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const hash = SyncConfigManager.computeDbHash('/path/to/db');

      expect(hash).toBeNull();
    });
  });

  describe('hasLocalChanges', () => {
    it('should return false when never synced', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        folderId: 'folder-123',
        syncedDbHash: null, // Never synced
      }));

      expect(SyncConfigManager.hasLocalChanges()).toBe(false);
    });

    it('should return false when hash matches', () => {
      const dbContent = Buffer.from('test content');
      const hash = crypto.createHash('sha256').update(dbContent).digest('hex');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if ((filePath as string).includes('config')) {
          return JSON.stringify({ folderId: 'folder-123', syncedDbHash: hash });
        }
        return dbContent;
      });

      expect(SyncConfigManager.hasLocalChanges()).toBe(false);
    });

    it('should return true when hash differs', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if ((filePath as string).includes('config')) {
          return JSON.stringify({ folderId: 'folder-123', syncedDbHash: 'old-hash' });
        }
        return Buffer.from('new content');
      });

      expect(SyncConfigManager.hasLocalChanges()).toBe(true);
    });
  });

  describe('markSynced', () => {
    it('should update syncedDbHash and lastSyncedAt', () => {
      const dbContent = Buffer.from('database content');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if ((filePath as string).includes('config')) {
          return JSON.stringify({ folderId: 'folder-123' });
        }
        return dbContent;
      });
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      const beforeTime = new Date().toISOString();
      SyncConfigManager.markSynced();

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('syncedDbHash'),
        'utf-8'
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('lastSyncedAt'),
        'utf-8'
      );
    });
  });

  describe('Hash-Based Sync Detection', () => {
    it('should detect changes when database hash differs from synced hash', () => {
      const oldContent = Buffer.from('old database content');
      const newContent = Buffer.from('new database content');
      const oldHash = crypto.createHash('sha256').update(oldContent).digest('hex');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if ((filePath as string).includes('config')) {
          return JSON.stringify({ folderId: 'folder-123', syncedDbHash: oldHash });
        }
        return newContent; // Current DB has different content
      });

      expect(SyncConfigManager.hasLocalChanges()).toBe(true);
    });

    it('should detect no changes when database hash matches synced hash', () => {
      const content = Buffer.from('same database content');
      const hash = crypto.createHash('sha256').update(content).digest('hex');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if ((filePath as string).includes('config')) {
          return JSON.stringify({ folderId: 'folder-123', syncedDbHash: hash });
        }
        return content; // Same content as stored hash
      });

      expect(SyncConfigManager.hasLocalChanges()).toBe(false);
    });

    it('should compute consistent SHA-256 hash for same content', () => {
      const content = Buffer.from('test content for hashing');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(content);

      const hash1 = SyncConfigManager.computeDbHash('/path/to/db');
      const hash2 = SyncConfigManager.computeDbHash('/path/to/db');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex characters
    });

    it('should produce different hashes for different content', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.mocked(fs.readFileSync).mockReturnValueOnce(Buffer.from('content A'));
      const hashA = SyncConfigManager.computeDbHash('/path/to/db');

      vi.mocked(fs.readFileSync).mockReturnValueOnce(Buffer.from('content B'));
      const hashB = SyncConfigManager.computeDbHash('/path/to/db');

      expect(hashA).not.toBe(hashB);
    });

    it('should update syncedDbHash when marking as synced', () => {
      const dbContent = Buffer.from('database content after sync');
      const expectedHash = crypto.createHash('sha256').update(dbContent).digest('hex');

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
        if ((filePath as string).includes('config')) {
          return JSON.stringify({ folderId: 'folder-123', syncedDbHash: null });
        }
        return dbContent;
      });

      let writtenConfig: string | null = null;
      vi.mocked(fs.writeFileSync).mockImplementation((_, data) => {
        writtenConfig = data as string;
      });
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      SyncConfigManager.markSynced();

      expect(writtenConfig).toBeTruthy();
      const parsed = JSON.parse(writtenConfig!);
      expect(parsed.syncedDbHash).toBe(expectedHash);
      expect(parsed.lastSyncedAt).toBeDefined();
    });
  });

  describe('setBackupFileId', () => {
    it('should save backup file ID to config', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ folderId: null }));
      vi.mocked(fs.writeFileSync).mockImplementation(() => {});
      vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);

      SyncConfigManager.setBackupFileId('backup-file-id');

      expect(fs.writeFileSync).toHaveBeenCalled();
      const writeCall = vi.mocked(fs.writeFileSync).mock.calls[0];
      const writtenData = writeCall[1] as string;
      const parsed = JSON.parse(writtenData);

      expect(parsed.backupFileId).toBe('backup-file-id');
    });
  });
});
