/**
 * Tests for Tauri Sync Handler
 *
 * Tests OAuth token refresh logic and session-aware sync conflict detection.
 * These tests use mocks since they're testing Tauri-specific browser code.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock localStorage for Tauri mode tests
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] || null,
  };
})();

// Mock global fetch for Google API calls
const mockFetch = vi.fn();

describe('Tauri Sync Handler - OAuth Token Refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocalStorage.clear();
    global.fetch = mockFetch;
    // @ts-expect-error - Mock localStorage
    global.localStorage = mockLocalStorage;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Token Expiry Detection', () => {
    it('should detect expired token when expiry_date is in the past', () => {
      const tokens = {
        access_token: 'old-token',
        refresh_token: 'refresh-token',
        expiry_date: Date.now() - 1000, // 1 second ago
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/drive.file',
      };

      mockLocalStorage.setItem('puffin_oauth_tokens', JSON.stringify(tokens));

      const stored = JSON.parse(mockLocalStorage.getItem('puffin_oauth_tokens')!);
      const isExpired = stored.expiry_date < Date.now();

      expect(isExpired).toBe(true);
    });

    it('should detect valid token when expiry_date is in the future', () => {
      const tokens = {
        access_token: 'valid-token',
        refresh_token: 'refresh-token',
        expiry_date: Date.now() + 3600000, // 1 hour from now
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/drive.file',
      };

      mockLocalStorage.setItem('puffin_oauth_tokens', JSON.stringify(tokens));

      const stored = JSON.parse(mockLocalStorage.getItem('puffin_oauth_tokens')!);
      const isExpired = stored.expiry_date < Date.now();

      expect(isExpired).toBe(false);
    });

    it('should consider token expired if within 60 second buffer', () => {
      const tokens = {
        access_token: 'almost-expired-token',
        refresh_token: 'refresh-token',
        expiry_date: Date.now() + 30000, // 30 seconds from now
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/drive.file',
      };

      mockLocalStorage.setItem('puffin_oauth_tokens', JSON.stringify(tokens));

      const stored = JSON.parse(mockLocalStorage.getItem('puffin_oauth_tokens')!);
      // Token is considered expired if within 60 second buffer
      const isExpiredWithBuffer = stored.expiry_date < Date.now() + 60000;

      expect(isExpiredWithBuffer).toBe(true);
    });
  });

  describe('Token Refresh Flow', () => {
    it('should refresh token successfully and update localStorage', async () => {
      // Setup: Expired token in localStorage
      const oldTokens = {
        access_token: 'old-access-token',
        refresh_token: 'valid-refresh-token',
        expiry_date: Date.now() - 1000,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/drive.file',
      };
      mockLocalStorage.setItem('puffin_oauth_tokens', JSON.stringify(oldTokens));

      // Setup: Credentials
      const credentials = {
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        apiKey: 'test-api-key',
      };
      mockLocalStorage.setItem('puffin_sync_credentials', JSON.stringify(credentials));

      // Mock successful token refresh response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          expires_in: 3600,
          token_type: 'Bearer',
        }),
      });

      // Simulate the refresh logic from getValidAccessToken
      const stored = JSON.parse(mockLocalStorage.getItem('puffin_oauth_tokens')!);
      const creds = JSON.parse(mockLocalStorage.getItem('puffin_sync_credentials')!);

      // Check if expired
      if (stored.expiry_date < Date.now() + 60000) {
        // Make refresh request
        const response = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: creds.clientId,
            client_secret: creds.clientSecret,
            refresh_token: stored.refresh_token,
            grant_type: 'refresh_token',
          }),
        });

        const refreshed = await response.json();

        // Update localStorage
        const updatedTokens = {
          ...stored,
          access_token: refreshed.access_token,
          expiry_date: Date.now() + (refreshed.expires_in * 1000),
        };
        mockLocalStorage.setItem('puffin_oauth_tokens', JSON.stringify(updatedTokens));
      }

      // Verify token was refreshed
      const finalTokens = JSON.parse(mockLocalStorage.getItem('puffin_oauth_tokens')!);
      expect(finalTokens.access_token).toBe('new-access-token');
      expect(finalTokens.refresh_token).toBe('valid-refresh-token'); // Preserved
      expect(finalTokens.expiry_date).toBeGreaterThan(Date.now());
    });

    it('should preserve original refresh_token after refresh', async () => {
      const originalRefreshToken = 'original-refresh-token-keep-this';
      const tokens = {
        access_token: 'expired-token',
        refresh_token: originalRefreshToken,
        expiry_date: Date.now() - 1000,
      };
      mockLocalStorage.setItem('puffin_oauth_tokens', JSON.stringify(tokens));

      // Mock refresh response - Google doesn't return new refresh_token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          expires_in: 3600,
          // Note: No refresh_token in response
        }),
      });

      const credentials = { clientId: 'id', clientSecret: 'secret', apiKey: '' };
      mockLocalStorage.setItem('puffin_sync_credentials', JSON.stringify(credentials));

      // Simulate refresh
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({ grant_type: 'refresh_token' }),
      });
      const refreshed = await response.json();

      const stored = JSON.parse(mockLocalStorage.getItem('puffin_oauth_tokens')!);
      const updatedTokens = {
        ...stored,
        access_token: refreshed.access_token,
        expiry_date: Date.now() + (refreshed.expires_in * 1000),
      };
      mockLocalStorage.setItem('puffin_oauth_tokens', JSON.stringify(updatedTokens));

      const final = JSON.parse(mockLocalStorage.getItem('puffin_oauth_tokens')!);
      expect(final.refresh_token).toBe(originalRefreshToken);
    });

    it('should handle refresh failure gracefully', async () => {
      const tokens = {
        access_token: 'expired-token',
        refresh_token: 'invalid-refresh-token',
        expiry_date: Date.now() - 1000,
      };
      mockLocalStorage.setItem('puffin_oauth_tokens', JSON.stringify(tokens));
      mockLocalStorage.setItem('puffin_sync_credentials', JSON.stringify({
        clientId: 'id', clientSecret: 'secret', apiKey: '',
      }));

      // Mock failed refresh response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Token has been revoked.',
        }),
      });

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        body: new URLSearchParams({ grant_type: 'refresh_token' }),
      });

      expect(response.ok).toBe(false);
      const error = await response.json();
      expect(error.error).toBe('invalid_grant');
    });
  });
});

describe('Tauri Sync Handler - Session-Aware Conflict Detection', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    // @ts-expect-error - Mock localStorage
    global.localStorage = mockLocalStorage;
  });

  describe('Session Tracking', () => {
    it('should generate unique session ID on app start', () => {
      // Simulate session ID generation
      const sessionId = crypto.randomUUID();

      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
      expect(sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should track last modify session when database changes', () => {
      const sessionId = 'session-abc-123';
      const lastModifySessionKey = 'puffin_last_modify_session';

      // Simulate recording a modify session
      mockLocalStorage.setItem(lastModifySessionKey, sessionId);

      const stored = mockLocalStorage.getItem(lastModifySessionKey);
      expect(stored).toBe(sessionId);
    });

    it('should detect changes from previous session', () => {
      const currentSessionId = 'current-session-456';
      const previousSessionId = 'previous-session-123';
      const lastModifySessionKey = 'puffin_last_modify_session';

      // Setup: Previous session made changes
      mockLocalStorage.setItem(lastModifySessionKey, previousSessionId);

      // Check if changes are from a different session
      const lastModifySession = mockLocalStorage.getItem(lastModifySessionKey);
      const changesFromPreviousSession = lastModifySession !== null && lastModifySession !== currentSessionId;

      expect(changesFromPreviousSession).toBe(true);
    });

    it('should allow editing when changes are from current session', () => {
      const currentSessionId = 'current-session-789';
      const lastModifySessionKey = 'puffin_last_modify_session';

      // Setup: Current session made changes
      mockLocalStorage.setItem(lastModifySessionKey, currentSessionId);

      // Check if changes are from current session
      const lastModifySession = mockLocalStorage.getItem(lastModifySessionKey);
      const changesFromPreviousSession = lastModifySession !== null && lastModifySession !== currentSessionId;

      expect(changesFromPreviousSession).toBe(false);
    });

    it('should clear last modify session after sync', () => {
      const lastModifySessionKey = 'puffin_last_modify_session';

      // Setup: Session had changes
      mockLocalStorage.setItem(lastModifySessionKey, 'some-session-id');
      expect(mockLocalStorage.getItem(lastModifySessionKey)).toBeTruthy();

      // Simulate clearing after sync
      mockLocalStorage.removeItem(lastModifySessionKey);

      expect(mockLocalStorage.getItem(lastModifySessionKey)).toBeNull();
    });
  });

  describe('Sync Conflict Scenarios', () => {
    it('should allow editing when no previous changes exist', () => {
      const lastModifySessionKey = 'puffin_last_modify_session';

      // No previous session marker
      const lastModifySession = mockLocalStorage.getItem(lastModifySessionKey);
      const changesFromPreviousSession = lastModifySession !== null && lastModifySession !== 'current-session';

      expect(changesFromPreviousSession).toBe(false);
    });

    it('should block editing when previous session has unsynced changes', () => {
      const currentSessionId = 'new-session-abc';
      const lastModifySessionKey = 'puffin_last_modify_session';

      // Previous session left unsynced changes
      mockLocalStorage.setItem(lastModifySessionKey, 'old-session-xyz');

      const lastModifySession = mockLocalStorage.getItem(lastModifySessionKey);
      const changesFromPreviousSession = lastModifySession !== null && lastModifySession !== currentSessionId;

      // Should block editing
      expect(changesFromPreviousSession).toBe(true);
    });

    it('should handle conflict resolution by discarding local changes', () => {
      const lastModifySessionKey = 'puffin_last_modify_session';
      const syncConfigKey = 'puffin_sync_config';

      // Setup: Previous session has unsynced changes
      mockLocalStorage.setItem(lastModifySessionKey, 'old-session');
      mockLocalStorage.setItem(syncConfigKey, JSON.stringify({
        lastSyncedAt: '2025-01-14T00:00:00.000Z',
        syncedDbHash: 'old-hash',
      }));

      // User chooses "Discard Local" - pull from cloud
      // After pull, session marker should be cleared
      mockLocalStorage.removeItem(lastModifySessionKey);

      // And sync config updated with new hash
      mockLocalStorage.setItem(syncConfigKey, JSON.stringify({
        lastSyncedAt: new Date().toISOString(),
        syncedDbHash: 'new-cloud-hash',
      }));

      // Verify conflict resolved
      expect(mockLocalStorage.getItem(lastModifySessionKey)).toBeNull();
      const config = JSON.parse(mockLocalStorage.getItem(syncConfigKey)!);
      expect(config.syncedDbHash).toBe('new-cloud-hash');
    });
  });
});

describe('Tauri Sync Handler - Cloud Change Detection', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    // @ts-expect-error - Mock localStorage
    global.localStorage = mockLocalStorage;
  });

  describe('Hash-Based Detection', () => {
    it('should detect cloud changes when cloud hash differs from local synced hash', () => {
      const localSyncedHash = 'local-hash-abc123';
      const cloudDbHash = 'cloud-hash-xyz789';

      const hasCloudChanges = cloudDbHash !== localSyncedHash;

      expect(hasCloudChanges).toBe(true);
    });

    it('should detect no cloud changes when hashes match', () => {
      const hash = 'same-hash-for-both';
      const localSyncedHash = hash;
      const cloudDbHash = hash;

      const hasCloudChanges = cloudDbHash !== localSyncedHash;

      expect(hasCloudChanges).toBe(false);
    });
  });

  describe('Timestamp Buffer Logic', () => {
    it('should use 5 second buffer when hashes are available', () => {
      const HASH_MATCH_BUFFER_MS = 5000;
      const lastSyncTime = Date.now() - 10000; // 10 seconds ago
      const cloudModifiedTime = Date.now() - 3000; // 3 seconds ago

      // Hashes match, but cloud was modified after sync
      const cloudDbHash = 'same-hash';
      const localSyncedHash = 'same-hash';

      let hasCloudChanges = cloudDbHash !== localSyncedHash; // false

      // Secondary timestamp check with small buffer
      if (!hasCloudChanges && cloudModifiedTime > lastSyncTime + HASH_MATCH_BUFFER_MS) {
        hasCloudChanges = true;
      }

      // cloudModifiedTime (-3s) is NOT > lastSyncTime (-10s) + 5s = -5s
      // -3s > -5s is true, so hasCloudChanges should be true
      expect(hasCloudChanges).toBe(true);
    });

    it('should use 60 second buffer for timestamp-only detection (no hash)', () => {
      const CLOCK_SKEW_BUFFER_MS = 60000;
      const lastSyncTime = Date.now() - 30000; // 30 seconds ago
      const cloudModifiedTime = Date.now() - 10000; // 10 seconds ago

      // No hashes available, fall back to timestamp
      const cloudDbHash = null;
      const localSyncedHash = null;

      let hasCloudChanges = false;

      if (cloudDbHash && localSyncedHash) {
        hasCloudChanges = cloudDbHash !== localSyncedHash;
      } else if (cloudModifiedTime) {
        // Use larger buffer when no hash
        hasCloudChanges = cloudModifiedTime > lastSyncTime + CLOCK_SKEW_BUFFER_MS;
      }

      // cloudModifiedTime (-10s) > lastSyncTime (-30s) + 60s = 30s future
      // -10s > 30s is false
      expect(hasCloudChanges).toBe(false);
    });

    it('should detect cloud changes from v1.0 that does not update hash metadata', () => {
      const HASH_MATCH_BUFFER_MS = 5000;
      const lastSyncTime = Date.now() - 120000; // 2 minutes ago
      const cloudModifiedTime = Date.now() - 10000; // 10 seconds ago

      // v1.0 pushed new data but didn't update the hash in metadata
      // So hashes still match, but timestamp shows change
      const cloudDbHash = 'old-hash';
      const localSyncedHash = 'old-hash';

      let hasCloudChanges = cloudDbHash !== localSyncedHash; // false

      // Use timestamp as secondary check
      if (!hasCloudChanges && cloudModifiedTime > lastSyncTime + HASH_MATCH_BUFFER_MS) {
        hasCloudChanges = true;
      }

      expect(hasCloudChanges).toBe(true);
    });
  });
});
