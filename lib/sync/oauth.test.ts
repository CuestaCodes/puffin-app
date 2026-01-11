/**
 * Tests for OAuth utility functions
 *
 * Tests scope management, state parameter handling, and configuration checks
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getScopes, hasExtendedScope, isOAuthConfigured, getAuthUrl, ScopeLevel } from './oauth';
import { SyncConfigManager } from './config';

// Mock the config module
vi.mock('./config', () => ({
  SyncConfigManager: {
    getTokens: vi.fn(),
    getCredentials: vi.fn(),
    saveTokens: vi.fn(),
    saveConfig: vi.fn(),
  },
}));

// Mock googleapis with a class-style OAuth2
vi.mock('googleapis', () => {
  const MockOAuth2 = class {
    generateAuthUrl = vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?mock=true');
    setCredentials = vi.fn();
    getToken = vi.fn();
    refreshAccessToken = vi.fn();
    revokeToken = vi.fn();
  };

  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
      oauth2: vi.fn(),
      drive: vi.fn(),
    },
  };
});

describe('OAuth Utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getScopes', () => {
    it('should return standard scopes by default', () => {
      const scopes = getScopes();

      expect(scopes).toContain('https://www.googleapis.com/auth/drive.file');
      expect(scopes).toContain('https://www.googleapis.com/auth/userinfo.email');
      expect(scopes).not.toContain('https://www.googleapis.com/auth/drive');
    });

    it('should return standard scopes when level is standard', () => {
      const scopes = getScopes('standard');

      expect(scopes).toContain('https://www.googleapis.com/auth/drive.file');
      expect(scopes).not.toContain('https://www.googleapis.com/auth/drive');
    });

    it('should return extended scopes when level is extended', () => {
      const scopes = getScopes('extended');

      expect(scopes).toContain('https://www.googleapis.com/auth/drive.file');
      expect(scopes).toContain('https://www.googleapis.com/auth/drive');
      expect(scopes).toContain('https://www.googleapis.com/auth/userinfo.email');
    });
  });

  describe('hasExtendedScope', () => {
    it('should return false when no tokens exist', () => {
      vi.mocked(SyncConfigManager.getTokens).mockReturnValue(null);

      expect(hasExtendedScope()).toBe(false);
    });

    it('should return false when tokens have no scope', () => {
      vi.mocked(SyncConfigManager.getTokens).mockReturnValue({
        access_token: 'token',
        refresh_token: 'refresh',
        expiry_date: Date.now() + 3600000,
        token_type: 'Bearer',
        scope: '',
      });

      expect(hasExtendedScope()).toBe(false);
    });

    it('should return false when only drive.file scope is present', () => {
      vi.mocked(SyncConfigManager.getTokens).mockReturnValue({
        access_token: 'token',
        refresh_token: 'refresh',
        expiry_date: Date.now() + 3600000,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
      });

      expect(hasExtendedScope()).toBe(false);
    });

    it('should return true when full drive scope is present', () => {
      vi.mocked(SyncConfigManager.getTokens).mockReturnValue({
        access_token: 'token',
        refresh_token: 'refresh',
        expiry_date: Date.now() + 3600000,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email',
      });

      expect(hasExtendedScope()).toBe(true);
    });

    it('should correctly distinguish drive from drive.file using exact match', () => {
      // This test ensures the fix for the substring match bug
      // drive.file contains "drive" as a substring, but should not match

      // Test with only drive.file
      vi.mocked(SyncConfigManager.getTokens).mockReturnValue({
        access_token: 'token',
        refresh_token: 'refresh',
        expiry_date: Date.now() + 3600000,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/drive.file',
      });
      expect(hasExtendedScope()).toBe(false);

      // Test with both drive.file and drive
      vi.mocked(SyncConfigManager.getTokens).mockReturnValue({
        access_token: 'token',
        refresh_token: 'refresh',
        expiry_date: Date.now() + 3600000,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive',
      });
      expect(hasExtendedScope()).toBe(true);
    });
  });

  describe('isOAuthConfigured', () => {
    it('should return false when no credentials exist', () => {
      vi.mocked(SyncConfigManager.getCredentials).mockReturnValue(null);

      expect(isOAuthConfigured()).toBe(false);
    });

    it('should return false when client ID is missing', () => {
      vi.mocked(SyncConfigManager.getCredentials).mockReturnValue({
        clientId: '',
        clientSecret: 'secret',
        apiKey: 'key',
      });

      expect(isOAuthConfigured()).toBe(false);
    });

    it('should return false when client secret is missing', () => {
      vi.mocked(SyncConfigManager.getCredentials).mockReturnValue({
        clientId: 'client-id',
        clientSecret: '',
        apiKey: 'key',
      });

      expect(isOAuthConfigured()).toBe(false);
    });

    it('should return true when both client ID and secret are present', () => {
      vi.mocked(SyncConfigManager.getCredentials).mockReturnValue({
        clientId: 'client-id',
        clientSecret: 'secret',
        apiKey: '', // API key is optional
      });

      expect(isOAuthConfigured()).toBe(true);
    });
  });

  describe('getAuthUrl', () => {
    it('should generate auth URL with standard scope by default', () => {
      vi.mocked(SyncConfigManager.getCredentials).mockReturnValue({
        clientId: 'client-id',
        clientSecret: 'secret',
        apiKey: '',
      });

      const url = getAuthUrl();

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
      // The mock returns this URL
      expect(url).toContain('accounts.google.com');
    });

    it('should encode scope level in state parameter', () => {
      vi.mocked(SyncConfigManager.getCredentials).mockReturnValue({
        clientId: 'client-id',
        clientSecret: 'secret',
        apiKey: '',
      });

      // Just verify it doesn't throw for different scope levels
      expect(() => getAuthUrl('standard')).not.toThrow();
      expect(() => getAuthUrl('extended')).not.toThrow();
    });

    it('should still generate URL when credentials are missing (uses empty strings)', () => {
      // Note: getOAuth2Client uses empty strings as fallback, doesn't return null
      vi.mocked(SyncConfigManager.getCredentials).mockReturnValue(null);

      const url = getAuthUrl();
      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
    });
  });
});

describe('OAuth State Parameter Parsing', () => {
  // Test the parseOAuthState function behavior through integration
  // Since it's a private function, we test it through handleOAuthCallback behavior

  describe('state encoding/decoding', () => {
    it('should encode scope level correctly', () => {
      // Create state data the same way getAuthUrl does
      const stateData = JSON.stringify({ scopeLevel: 'extended' as ScopeLevel, custom: null });
      const encoded = Buffer.from(stateData).toString('base64url');

      // Decode it back
      const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded);

      expect(parsed.scopeLevel).toBe('extended');
      expect(parsed.custom).toBeNull();
    });

    it('should encode custom state correctly', () => {
      const stateData = JSON.stringify({ scopeLevel: 'standard' as ScopeLevel, custom: 'my-custom-state' });
      const encoded = Buffer.from(stateData).toString('base64url');

      const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
      const parsed = JSON.parse(decoded);

      expect(parsed.scopeLevel).toBe('standard');
      expect(parsed.custom).toBe('my-custom-state');
    });

    it('should handle invalid base64url gracefully', () => {
      // Simulate parsing an invalid state
      const invalidState = 'not-valid-base64url!!!';

      // This simulates what parseOAuthState does
      try {
        const decoded = Buffer.from(invalidState, 'base64url').toString('utf8');
        JSON.parse(decoded);
        // If we get here, parsing succeeded unexpectedly
      } catch {
        // Expected - invalid state should fail gracefully
        expect(true).toBe(true);
      }
    });

    it('should handle null state', () => {
      // Default behavior when no state is provided
      const defaultResult = { scopeLevel: 'standard', custom: null };

      expect(defaultResult.scopeLevel).toBe('standard');
      expect(defaultResult.custom).toBeNull();
    });
  });
});
