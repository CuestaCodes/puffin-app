// Simple in-memory rate limiter for authentication endpoints
// Note: This resets on server restart. For production with multiple instances,
// consider using Redis or similar distributed storage.

interface RateLimitEntry {
  attempts: number;
  firstAttempt: number;
  lockedUntil: number | null;
}

interface RateLimitConfig {
  maxAttempts: number;      // Max attempts before lockout
  windowMs: number;         // Time window for counting attempts (ms)
  lockoutMs: number;        // Lockout duration after exceeding attempts (ms)
}

// Store attempts by identifier (IP address or other key)
const attempts = new Map<string, RateLimitEntry>();

// Clean up old entries periodically (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup(config: RateLimitConfig): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  const expiry = now - config.windowMs - config.lockoutMs;

  for (const [key, entry] of attempts.entries()) {
    // Remove entries that are past their window and lockout
    if (entry.firstAttempt < expiry && (!entry.lockedUntil || entry.lockedUntil < now)) {
      attempts.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterMs: number | null;
  message: string;
}

/**
 * Check if an action is allowed under rate limiting rules
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  cleanup(config);

  let entry = attempts.get(identifier);

  // Check if currently locked out
  if (entry?.lockedUntil && entry.lockedUntil > now) {
    const retryAfterMs = entry.lockedUntil - now;
    const retryAfterMinutes = Math.ceil(retryAfterMs / 60000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterMs,
      message: `Too many attempts. Please try again in ${retryAfterMinutes} minute${retryAfterMinutes > 1 ? 's' : ''}.`,
    };
  }

  // Reset if window has passed
  if (entry && now - entry.firstAttempt > config.windowMs) {
    entry = undefined;
    attempts.delete(identifier);
  }

  // First attempt or window reset
  if (!entry) {
    return {
      allowed: true,
      remainingAttempts: config.maxAttempts - 1,
      retryAfterMs: null,
      message: '',
    };
  }

  // Within window, check attempts
  if (entry.attempts >= config.maxAttempts) {
    // Exceeded max attempts, apply lockout
    entry.lockedUntil = now + config.lockoutMs;
    const retryAfterMinutes = Math.ceil(config.lockoutMs / 60000);
    return {
      allowed: false,
      remainingAttempts: 0,
      retryAfterMs: config.lockoutMs,
      message: `Too many attempts. Please try again in ${retryAfterMinutes} minute${retryAfterMinutes > 1 ? 's' : ''}.`,
    };
  }

  return {
    allowed: true,
    remainingAttempts: config.maxAttempts - entry.attempts - 1,
    retryAfterMs: null,
    message: '',
  };
}

/**
 * Record an attempt (call after checkRateLimit if action proceeds)
 */
export function recordAttempt(identifier: string): void {
  const now = Date.now();
  const entry = attempts.get(identifier);

  if (entry) {
    entry.attempts++;
  } else {
    attempts.set(identifier, {
      attempts: 1,
      firstAttempt: now,
      lockedUntil: null,
    });
  }
}

/**
 * Clear attempts for an identifier (call on successful action)
 */
export function clearAttempts(identifier: string): void {
  attempts.delete(identifier);
}

/**
 * Get client IP from Next.js request headers
 */
export function getClientIp(headers: Headers): string {
  // Check common proxy headers
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP in the chain (original client)
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback for local development
  return 'localhost';
}

// Pre-configured rate limit settings
export const AUTH_RATE_LIMITS = {
  // Login: 5 attempts per 15 minutes, then 15-minute lockout
  login: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000,
  },
  // PIN change: 5 attempts per 15 minutes, then 15-minute lockout
  changePin: {
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000,
  },
  // Reset: 3 attempts per hour, then 1-hour lockout (more restrictive)
  reset: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000,
    lockoutMs: 60 * 60 * 1000,
  },
} as const;

// For testing purposes
export function _clearAllAttempts(): void {
  attempts.clear();
}
