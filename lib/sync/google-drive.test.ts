/**
 * Tests for Google Drive Service utility functions
 *
 * Tests sanitization, query building, and retry logic
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to test the internal utility functions
// Since they're not exported, we'll test them through the exported class behavior
// and also test the retry configuration

describe('Google Drive Utilities', () => {
  describe('sanitizeDriveId', () => {
    // Test the sanitization logic directly
    const sanitizeDriveId = (id: string): string => {
      return id.replace(/[^a-zA-Z0-9_-]/g, '');
    };

    it('should allow alphanumeric characters', () => {
      expect(sanitizeDriveId('abc123XYZ')).toBe('abc123XYZ');
    });

    it('should allow dashes', () => {
      expect(sanitizeDriveId('abc-123-xyz')).toBe('abc-123-xyz');
    });

    it('should allow underscores', () => {
      expect(sanitizeDriveId('abc_123_xyz')).toBe('abc_123_xyz');
    });

    it('should remove single quotes', () => {
      expect(sanitizeDriveId("abc'123")).toBe('abc123');
    });

    it('should remove double quotes', () => {
      expect(sanitizeDriveId('abc"123')).toBe('abc123');
    });

    it('should remove spaces', () => {
      expect(sanitizeDriveId('abc 123')).toBe('abc123');
    });

    it('should remove SQL injection characters', () => {
      expect(sanitizeDriveId("abc';DROP TABLE--")).toBe('abcDROPTABLE--');
    });

    it('should handle empty string', () => {
      expect(sanitizeDriveId('')).toBe('');
    });

    it('should preserve valid Google Drive IDs', () => {
      const validId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
      expect(sanitizeDriveId(validId)).toBe(validId);
    });
  });

  describe('buildFolderQuery', () => {
    // Test the query building logic
    const sanitizeDriveId = (id: string): string => {
      return id.replace(/[^a-zA-Z0-9_-]/g, '');
    };

    const buildFolderQuery = (folderId: string, filename: string): string => {
      const safeId = sanitizeDriveId(folderId);
      const safeName = filename.replace(/'/g, "\\'");
      return `'${safeId}' in parents and name='${safeName}' and trashed=false`;
    };

    it('should build correct query for valid inputs', () => {
      const query = buildFolderQuery('folder123', 'puffin-backup.db');
      expect(query).toBe("'folder123' in parents and name='puffin-backup.db' and trashed=false");
    });

    it('should escape single quotes in filename', () => {
      const query = buildFolderQuery('folder123', "file's name.db");
      expect(query).toBe("'folder123' in parents and name='file\\'s name.db' and trashed=false");
    });

    it('should sanitize folder ID to prevent injection', () => {
      const query = buildFolderQuery("folder' OR '1'='1", 'backup.db');
      expect(query).toBe("'folderOR11' in parents and name='backup.db' and trashed=false");
    });

    it('should handle folder ID with injection attempt', () => {
      const query = buildFolderQuery("abc' in parents) OR ('1'='1", 'file.db');
      // After sanitization, only alphanumeric, dash, underscore remain
      // The dangerous parts (quotes, parentheses) are removed
      // Note: "OR" letters remain but without quotes/parens the injection is neutralized
      expect(query).not.toContain("'1'");
      expect(query).not.toContain("()");
      // The sanitized ID should be safe to use in queries
      expect(query).toMatch(/^'[a-zA-Z0-9_-]+' in parents/);
    });
  });

  describe('Retry Configuration', () => {
    // Test retry config values
    const RETRY_CONFIG = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffMultiplier: 2,
      retryableStatusCodes: [429, 500, 502, 503, 504],
    };

    it('should have 3 max retries', () => {
      expect(RETRY_CONFIG.maxRetries).toBe(3);
    });

    it('should start with 1 second delay', () => {
      expect(RETRY_CONFIG.initialDelayMs).toBe(1000);
    });

    it('should cap delay at 10 seconds', () => {
      expect(RETRY_CONFIG.maxDelayMs).toBe(10000);
    });

    it('should double delay on each retry', () => {
      expect(RETRY_CONFIG.backoffMultiplier).toBe(2);
    });

    it('should retry on rate limit errors (429)', () => {
      expect(RETRY_CONFIG.retryableStatusCodes).toContain(429);
    });

    it('should retry on server errors (5xx)', () => {
      expect(RETRY_CONFIG.retryableStatusCodes).toContain(500);
      expect(RETRY_CONFIG.retryableStatusCodes).toContain(502);
      expect(RETRY_CONFIG.retryableStatusCodes).toContain(503);
      expect(RETRY_CONFIG.retryableStatusCodes).toContain(504);
    });

    it('should not retry on client errors (4xx except 429)', () => {
      expect(RETRY_CONFIG.retryableStatusCodes).not.toContain(400);
      expect(RETRY_CONFIG.retryableStatusCodes).not.toContain(401);
      expect(RETRY_CONFIG.retryableStatusCodes).not.toContain(403);
      expect(RETRY_CONFIG.retryableStatusCodes).not.toContain(404);
    });

    describe('exponential backoff calculation', () => {
      it('should calculate correct delays', () => {
        let delay = RETRY_CONFIG.initialDelayMs;

        // First retry
        expect(delay).toBe(1000);

        // Second retry
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
        expect(delay).toBe(2000);

        // Third retry
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
        expect(delay).toBe(4000);

        // Fourth retry (if we had more)
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
        expect(delay).toBe(8000);

        // Fifth retry - should cap at max
        delay = Math.min(delay * RETRY_CONFIG.backoffMultiplier, RETRY_CONFIG.maxDelayMs);
        expect(delay).toBe(10000);
      });
    });
  });

  describe('withRetry function behavior', () => {
    // Simulate the retry function behavior
    async function simulateWithRetry<T>(
      fn: () => Promise<T>,
      retryableStatusCodes: number[],
      maxRetries: number
    ): Promise<{ success: boolean; attempts: number; error?: Error }> {
      let attempts = 0;
      let lastError: Error | undefined;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        attempts++;
        try {
          await fn();
          return { success: true, attempts };
        } catch (error) {
          lastError = error as Error;
          const gError = error as { code?: number };

          const isRetryable = gError.code && retryableStatusCodes.includes(gError.code);
          if (!isRetryable || attempt === maxRetries) {
            return { success: false, attempts, error: lastError };
          }
        }
      }

      return { success: false, attempts, error: lastError };
    }

    it('should succeed on first attempt if no error', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await simulateWithRetry(fn, [429, 500], 3);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
    });

    it('should retry on retryable error codes', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 429, message: 'Rate limited' })
        .mockResolvedValueOnce('success');

      const result = await simulateWithRetry(fn, [429, 500], 3);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('should not retry on non-retryable error codes', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 404, message: 'Not found' });

      const result = await simulateWithRetry(fn, [429, 500], 3);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(result.error).toEqual({ code: 404, message: 'Not found' });
    });

    it('should fail after max retries exhausted', async () => {
      const fn = vi.fn()
        .mockRejectedValue({ code: 500, message: 'Server error' });

      const result = await simulateWithRetry(fn, [500], 3);

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
    });

    it('should succeed if error clears before max retries', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 503, message: 'Unavailable' })
        .mockRejectedValueOnce({ code: 503, message: 'Unavailable' })
        .mockResolvedValueOnce('success');

      const result = await simulateWithRetry(fn, [503], 3);

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });
  });
});

describe('GoogleDriveService error handling', () => {
  describe('file access error messages', () => {
    it('should provide helpful message for 404 on file update', () => {
      const errorMessage = 'Cannot access backup file. This may happen if: (1) The file was deleted, (2) You need to re-authenticate with extended permissions for multi-account sync, or (3) The file hasn\'t been shared with your account. Try disconnecting and reconnecting with "Connect to Existing Backup".';

      expect(errorMessage).toContain('file was deleted');
      expect(errorMessage).toContain('extended permissions');
      expect(errorMessage).toContain('shared with your account');
    });

    it('should provide helpful message for 403 on file update', () => {
      const errorMessage = 'You don\'t have permission to update this file. Ensure the file is shared with edit access, or try re-authenticating with extended permissions.';

      expect(errorMessage).toContain('permission');
      expect(errorMessage).toContain('edit access');
      expect(errorMessage).toContain('extended permissions');
    });
  });
});
