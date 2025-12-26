/**
 * Tests for rate limiting functionality
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  recordAttempt,
  clearAttempts,
  getClientIp,
  AUTH_RATE_LIMITS,
  _clearAllAttempts,
} from './rate-limit';

describe('Rate Limiting', () => {
  beforeEach(() => {
    // Clear all attempts before each test
    _clearAllAttempts();
  });

  describe('checkRateLimit', () => {
    it('should allow first attempt', () => {
      const result = checkRateLimit('test-ip', AUTH_RATE_LIMITS.login);

      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(AUTH_RATE_LIMITS.login.maxAttempts - 1);
      expect(result.retryAfterMs).toBeNull();
    });

    it('should track multiple attempts', () => {
      const config = { maxAttempts: 3, windowMs: 60000, lockoutMs: 60000 };

      // First check
      let result = checkRateLimit('test-ip', config);
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(2);

      // Record first attempt
      recordAttempt('test-ip');

      // Second check
      result = checkRateLimit('test-ip', config);
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(1);

      // Record second attempt
      recordAttempt('test-ip');

      // Third check
      result = checkRateLimit('test-ip', config);
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(0);

      // Record third attempt
      recordAttempt('test-ip');

      // Fourth check - should be blocked
      result = checkRateLimit('test-ip', config);
      expect(result.allowed).toBe(false);
      expect(result.remainingAttempts).toBe(0);
      expect(result.retryAfterMs).toBe(config.lockoutMs);
      expect(result.message).toContain('Too many attempts');
    });

    it('should block after exceeding max attempts', () => {
      const config = { maxAttempts: 2, windowMs: 60000, lockoutMs: 30000 };

      // Make 2 attempts
      checkRateLimit('block-test', config);
      recordAttempt('block-test');
      checkRateLimit('block-test', config);
      recordAttempt('block-test');

      // Third check should trigger lockout
      const result = checkRateLimit('block-test', config);
      expect(result.allowed).toBe(false);
      expect(result.message).toContain('1 minute'); // 30000ms = ~1 minute
    });

    it('should use separate tracking per identifier', () => {
      const config = { maxAttempts: 2, windowMs: 60000, lockoutMs: 60000 };

      // Make attempts for user1
      checkRateLimit('user1', config);
      recordAttempt('user1');
      checkRateLimit('user1', config);
      recordAttempt('user1');

      // user1 should be blocked
      let result = checkRateLimit('user1', config);
      expect(result.allowed).toBe(false);

      // user2 should still be allowed
      result = checkRateLimit('user2', config);
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(1);
    });
  });

  describe('recordAttempt', () => {
    it('should create entry on first attempt', () => {
      recordAttempt('new-ip');

      const result = checkRateLimit('new-ip', AUTH_RATE_LIMITS.login);
      expect(result.remainingAttempts).toBe(AUTH_RATE_LIMITS.login.maxAttempts - 2);
    });

    it('should increment attempts on subsequent calls', () => {
      const config = { maxAttempts: 5, windowMs: 60000, lockoutMs: 60000 };

      recordAttempt('inc-test');
      recordAttempt('inc-test');
      recordAttempt('inc-test');

      const result = checkRateLimit('inc-test', config);
      expect(result.remainingAttempts).toBe(1); // 5 - 3 - 1 = 1
    });
  });

  describe('clearAttempts', () => {
    it('should reset attempt count for identifier', () => {
      const config = { maxAttempts: 3, windowMs: 60000, lockoutMs: 60000 };

      // Make some attempts
      recordAttempt('clear-test');
      recordAttempt('clear-test');

      // Clear attempts
      clearAttempts('clear-test');

      // Should be back to full attempts
      const result = checkRateLimit('clear-test', config);
      expect(result.allowed).toBe(true);
      expect(result.remainingAttempts).toBe(2);
    });

    it('should clear lockout status', () => {
      const config = { maxAttempts: 1, windowMs: 60000, lockoutMs: 60000 };

      // Trigger lockout
      checkRateLimit('lockout-clear', config);
      recordAttempt('lockout-clear');
      let result = checkRateLimit('lockout-clear', config);
      expect(result.allowed).toBe(false);

      // Clear attempts
      clearAttempts('lockout-clear');

      // Should be allowed again
      result = checkRateLimit('lockout-clear', config);
      expect(result.allowed).toBe(true);
    });
  });

  describe('getClientIp', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '192.168.1.1, 10.0.0.1');

      const ip = getClientIp(headers);
      expect(ip).toBe('192.168.1.1');
    });

    it('should extract IP from x-real-ip header', () => {
      const headers = new Headers();
      headers.set('x-real-ip', '192.168.1.100');

      const ip = getClientIp(headers);
      expect(ip).toBe('192.168.1.100');
    });

    it('should prefer x-forwarded-for over x-real-ip', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '10.0.0.1');
      headers.set('x-real-ip', '192.168.1.1');

      const ip = getClientIp(headers);
      expect(ip).toBe('10.0.0.1');
    });

    it('should fallback to localhost when no headers present', () => {
      const headers = new Headers();

      const ip = getClientIp(headers);
      expect(ip).toBe('localhost');
    });

    it('should handle whitespace in forwarded-for header', () => {
      const headers = new Headers();
      headers.set('x-forwarded-for', '  192.168.1.1  , 10.0.0.1');

      const ip = getClientIp(headers);
      expect(ip).toBe('192.168.1.1');
    });
  });

  describe('AUTH_RATE_LIMITS', () => {
    it('should have correct login limits', () => {
      expect(AUTH_RATE_LIMITS.login.maxAttempts).toBe(5);
      expect(AUTH_RATE_LIMITS.login.windowMs).toBe(15 * 60 * 1000);
      expect(AUTH_RATE_LIMITS.login.lockoutMs).toBe(15 * 60 * 1000);
    });

    it('should have correct changePin limits', () => {
      expect(AUTH_RATE_LIMITS.changePin.maxAttempts).toBe(5);
      expect(AUTH_RATE_LIMITS.changePin.windowMs).toBe(15 * 60 * 1000);
      expect(AUTH_RATE_LIMITS.changePin.lockoutMs).toBe(15 * 60 * 1000);
    });

    it('should have more restrictive reset limits', () => {
      expect(AUTH_RATE_LIMITS.reset.maxAttempts).toBe(3);
      expect(AUTH_RATE_LIMITS.reset.windowMs).toBe(60 * 60 * 1000);
      expect(AUTH_RATE_LIMITS.reset.lockoutMs).toBe(60 * 60 * 1000);
    });
  });
});
