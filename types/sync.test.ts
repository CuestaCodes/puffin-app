/**
 * Tests for Sync Type Utilities
 *
 * Tests URL parsing and folder ID extraction
 */

import { describe, it, expect } from 'vitest';
import { extractFolderIdFromUrl } from './sync';

describe('extractFolderIdFromUrl', () => {
  describe('direct folder ID input', () => {
    it('should return folder ID when given just the ID', () => {
      const folderId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
      expect(extractFolderIdFromUrl(folderId)).toBe(folderId);
    });

    it('should return folder ID with dashes', () => {
      // Must be 20-50 chars to match the regex
      const folderId = 'abc-123-xyz_456-more1234';
      expect(extractFolderIdFromUrl(folderId)).toBe(folderId);
    });

    it('should return folder ID with underscores', () => {
      // Must be 20-50 chars to match the regex
      const folderId = 'abc_123_xyz_456_ABC_789_extra';
      expect(extractFolderIdFromUrl(folderId)).toBe(folderId);
    });

    it('should handle minimum length ID (20 chars)', () => {
      const folderId = '12345678901234567890';
      expect(extractFolderIdFromUrl(folderId)).toBe(folderId);
    });

    it('should handle maximum length ID (50 chars)', () => {
      const folderId = '12345678901234567890123456789012345678901234567890';
      expect(extractFolderIdFromUrl(folderId)).toBe(folderId);
    });
  });

  describe('standard Google Drive folder URLs', () => {
    it('should extract ID from basic folder URL', () => {
      const url = 'https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs';
      expect(extractFolderIdFromUrl(url)).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
    });

    it('should extract ID from URL with user index', () => {
      const url = 'https://drive.google.com/drive/u/0/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs';
      expect(extractFolderIdFromUrl(url)).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
    });

    it('should extract ID from URL with different user index', () => {
      const url = 'https://drive.google.com/drive/u/1/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs';
      expect(extractFolderIdFromUrl(url)).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
    });

    it('should extract ID from URL with sharing query param', () => {
      const url = 'https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs?usp=sharing';
      expect(extractFolderIdFromUrl(url)).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
    });

    it('should extract ID from URL with multiple query params', () => {
      const url = 'https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs?usp=sharing&ouid=12345';
      expect(extractFolderIdFromUrl(url)).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
    });
  });

  describe('ID parameter URLs', () => {
    it('should extract ID from URL with id parameter', () => {
      const url = 'https://drive.google.com/open?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs';
      expect(extractFolderIdFromUrl(url)).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
    });

    it('should extract ID from URL with multiple params including id', () => {
      const url = 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs/view?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs&other=value';
      expect(extractFolderIdFromUrl(url)).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
    });
  });

  describe('edge cases', () => {
    it('should return null for empty string', () => {
      expect(extractFolderIdFromUrl('')).toBeNull();
    });

    it('should return null for null-like input', () => {
      expect(extractFolderIdFromUrl(null as unknown as string)).toBeNull();
    });

    it('should return null for undefined-like input', () => {
      expect(extractFolderIdFromUrl(undefined as unknown as string)).toBeNull();
    });

    it('should return null for too short ID', () => {
      expect(extractFolderIdFromUrl('shortid')).toBeNull();
    });

    it('should return null for invalid URL', () => {
      expect(extractFolderIdFromUrl('https://example.com/some/path')).toBeNull();
    });

    it('should return null for non-Drive Google URL', () => {
      expect(extractFolderIdFromUrl('https://google.com/search?q=test')).toBeNull();
    });

    it('should handle whitespace around input', () => {
      const folderId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs';
      expect(extractFolderIdFromUrl(`  ${folderId}  `)).toBe(folderId);
    });

    it('should handle whitespace around URL', () => {
      const url = '  https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs  ';
      expect(extractFolderIdFromUrl(url)).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
    });
  });

  describe('real-world examples', () => {
    it('should handle shared folder URL', () => {
      const url = 'https://drive.google.com/drive/folders/1ABC123def456GHI789jkl?usp=drive_link';
      expect(extractFolderIdFromUrl(url)).toBe('1ABC123def456GHI789jkl');
    });

    it('should handle My Drive folder URL', () => {
      const url = 'https://drive.google.com/drive/u/0/folders/1ABC-123_def-456';
      expect(extractFolderIdFromUrl(url)).toBe('1ABC-123_def-456');
    });
  });
});
