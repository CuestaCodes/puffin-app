/**
 * Tauri Handler: Authentication
 *
 * Handles auth-related operations in Tauri mode.
 * Mirrors the functionality of /api/auth/* routes.
 *
 * Note: In Tauri mode, session management is simpler since it's a desktop app.
 * We still verify the PIN but don't need cookie-based sessions.
 */

import * as db from '../tauri-db';

interface LocalUser {
  id: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

interface HandlerContext {
  method: string;
  body?: unknown;
  params: Record<string, string>;
  path: string;
}

// Session configuration
const SESSION_KEY = 'puffin_auth_session';
const SESSION_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SessionData {
  authenticated: boolean;
  expiresAt: number;
}

// Rate limiting configuration (in-memory for Tauri)
const RATE_LIMIT_KEY = 'puffin_rate_limit';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface RateLimitData {
  attempts: number;
  firstAttemptAt: number;
  lockedUntil: number | null;
}

function getRateLimitState(): RateLimitData {
  if (typeof window === 'undefined' || !window.localStorage) {
    return { attempts: 0, firstAttemptAt: 0, lockedUntil: null };
  }
  try {
    const stored = localStorage.getItem(RATE_LIMIT_KEY);
    if (!stored) return { attempts: 0, firstAttemptAt: 0, lockedUntil: null };
    return JSON.parse(stored);
  } catch {
    return { attempts: 0, firstAttemptAt: 0, lockedUntil: null };
  }
}

function setRateLimitState(state: RateLimitData): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function clearRateLimitState(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.removeItem(RATE_LIMIT_KEY);
  } catch {
    // Ignore storage errors
  }
}

function checkRateLimit(): { allowed: boolean; message?: string; retryAfterMs?: number } {
  const state = getRateLimitState();
  const now = Date.now();

  // Check if locked out
  if (state.lockedUntil && now < state.lockedUntil) {
    const retryAfterMs = state.lockedUntil - now;
    const minutes = Math.ceil(retryAfterMs / 60000);
    return {
      allowed: false,
      message: `Too many failed attempts. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`,
      retryAfterMs,
    };
  }

  // Reset if lockout expired
  if (state.lockedUntil && now >= state.lockedUntil) {
    clearRateLimitState();
  }

  return { allowed: true };
}

function recordFailedAttempt(): void {
  const state = getRateLimitState();
  const now = Date.now();

  // Reset if window expired (15 minutes since first attempt)
  if (state.firstAttemptAt && now - state.firstAttemptAt > LOCKOUT_DURATION_MS) {
    state.attempts = 1;
    state.firstAttemptAt = now;
    state.lockedUntil = null;
  } else {
    state.attempts++;
    if (!state.firstAttemptAt) {
      state.firstAttemptAt = now;
    }
  }

  // Lock out after max attempts
  if (state.attempts >= MAX_LOGIN_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_DURATION_MS;
  }

  setRateLimitState(state);
}

/**
 * Get authentication state from sessionStorage.
 * Falls back to in-memory state if sessionStorage is unavailable.
 */
function getAuthState(): boolean {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return false;
  }

  try {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return false;

    const session: SessionData = JSON.parse(stored);
    if (Date.now() > session.expiresAt) {
      sessionStorage.removeItem(SESSION_KEY);
      return false;
    }

    return session.authenticated;
  } catch {
    return false;
  }
}

/**
 * Set authentication state in sessionStorage.
 */
function setAuthState(authenticated: boolean): void {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return;
  }

  try {
    if (authenticated) {
      const session: SessionData = {
        authenticated: true,
        expiresAt: Date.now() + SESSION_EXPIRY_MS,
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Session handler - /api/auth/session
 */
export async function handleSession(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'GET') {
    throw new Error(`Method ${method} not allowed`);
  }

  // Check if user is set up
  const user = await db.queryOne<LocalUser>('SELECT * FROM local_user LIMIT 1');
  const isSetup = user !== null;

  return {
    authenticated: getAuthState(),
    isSetup,
  };
}

/**
 * Login handler - /api/auth/login
 */
export async function handleLogin(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  // Check rate limit before processing
  const rateLimit = checkRateLimit();
  if (!rateLimit.allowed) {
    throw new Error(rateLimit.message || 'Too many failed attempts');
  }

  // Accept both 'password' (from validation schema) and 'pin' (legacy) field names
  const { password, pin } = body as { password?: string; pin?: string };
  const pinValue = password || pin;

  if (!pinValue || typeof pinValue !== 'string') {
    throw new Error('PIN is required');
  }

  // Get user
  const user = await db.queryOne<LocalUser>('SELECT * FROM local_user LIMIT 1');

  if (!user) {
    throw new Error('No user configured');
  }

  // Verify PIN using bcrypt
  // Note: bcrypt is not available in browser, so we use a simple comparison
  // In production, we should use a WebCrypto-based solution
  const isValid = await verifyPin(pinValue, user.password_hash);

  if (!isValid) {
    recordFailedAttempt();
    throw new Error('Invalid PIN');
  }

  // Clear rate limit on successful login
  clearRateLimitState();
  setAuthState(true);
  return { success: true };
}

/**
 * Logout handler - /api/auth/logout
 */
export async function handleLogout(ctx: HandlerContext): Promise<unknown> {
  const { method } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  setAuthState(false);
  return { success: true };
}

/**
 * Setup handler - /api/auth/setup
 */
export async function handleSetup(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  // Accept both 'password' (from validation schema) and 'pin' (legacy) field names
  const { password, pin } = body as { password?: string; pin?: string };
  const pinValue = password || pin;

  if (!pinValue || typeof pinValue !== 'string' || pinValue.length !== 6 || !/^\d+$/.test(pinValue)) {
    throw new Error('PIN must be exactly 6 digits');
  }

  // Check if user already exists
  const existingUser = await db.queryOne<LocalUser>('SELECT * FROM local_user LIMIT 1');
  if (existingUser) {
    throw new Error('User already configured');
  }

  // Hash the PIN
  const passwordHash = await hashPin(pinValue);
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();

  await db.execute(
    'INSERT INTO local_user (id, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [userId, passwordHash, now, now]
  );

  setAuthState(true);
  return { success: true };
}

/**
 * Change PIN handler - /api/auth/change-password
 */
export async function handleChangePin(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  if (!getAuthState()) {
    throw new Error('Not authenticated');
  }

  const { currentPin, newPin } = body as { currentPin: string; newPin: string };

  if (!currentPin || !newPin) {
    throw new Error('Current PIN and new PIN are required');
  }

  if (newPin.length !== 6 || !/^\d+$/.test(newPin)) {
    throw new Error('New PIN must be exactly 6 digits');
  }

  // Verify current PIN
  const user = await db.queryOne<LocalUser>('SELECT * FROM local_user LIMIT 1');
  if (!user) {
    throw new Error('No user configured');
  }

  const isValid = await verifyPin(currentPin, user.password_hash);
  if (!isValid) {
    throw new Error('Invalid current PIN');
  }

  // Update PIN
  // Use simple update since there's only ever one user - avoids issues with NULL id in legacy data
  const newHash = await hashPin(newPin);
  const now = new Date().toISOString();

  // If user has a valid id, use it; otherwise update the single row
  if (user.id) {
    await db.execute(
      'UPDATE local_user SET password_hash = ?, updated_at = ? WHERE id = ?',
      [newHash, now, user.id]
    );
  } else {
    // Legacy row without id - update the single user row
    await db.execute(
      'UPDATE local_user SET password_hash = ?, updated_at = ?',
      [newHash, now]
    );
  }

  return { success: true };
}

/**
 * Hash a PIN using Web Crypto API.
 * Uses PBKDF2 for key derivation.
 */
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);

  // Generate a random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Import the PIN as a key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    data,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive bits using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  // Combine salt and hash
  const hashArray = new Uint8Array(derivedBits);
  const combined = new Uint8Array(salt.length + hashArray.length);
  combined.set(salt);
  combined.set(hashArray, salt.length);

  // Return as base64
  return btoa(String.fromCharCode(...combined));
}

/**
 * Verify a PIN against a hash.
 */
async function verifyPin(pin: string, storedHash: string): Promise<boolean> {
  try {
    // Decode the stored hash
    const combined = Uint8Array.from(atob(storedHash), c => c.charCodeAt(0));
    const salt = combined.slice(0, 16);
    const storedDerivedBits = combined.slice(16);

    // Derive bits from the provided PIN
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      data,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const newDerivedBits = new Uint8Array(derivedBits);

    // Compare
    if (storedDerivedBits.length !== newDerivedBits.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < storedDerivedBits.length; i++) {
      result |= storedDerivedBits[i] ^ newDerivedBits[i];
    }

    return result === 0;
  } catch {
    // If stored hash is in bcrypt format (from server-side), use fallback
    // This handles migration from server-side bcrypt to client-side PBKDF2
    console.warn('PIN verification fallback: stored hash may be in bcrypt format');
    return false;
  }
}

/**
 * Reset handler - /api/auth/reset
 * Clears all data and resets the app to initial state.
 *
 * PIN verification is optional:
 * - If PIN is provided, it must be valid (for in-app reset from settings)
 * - If PIN is not provided, reset proceeds (for forgot-PIN flow from login page)
 *
 * The UI provides additional confirmation (typing "RESET") to prevent accidents.
 */
export async function handleReset(ctx: HandlerContext): Promise<unknown> {
  const { method, body } = ctx;

  if (method !== 'POST') {
    throw new Error(`Method ${method} not allowed`);
  }

  const { pin } = (body as { pin?: string }) || {};

  // If PIN is provided, verify it (for in-app reset when user is logged in)
  if (pin && typeof pin === 'string') {
    const user = await db.queryOne<LocalUser>('SELECT * FROM local_user LIMIT 1');
    if (user) {
      const isValid = await verifyPin(pin, user.password_hash);
      if (!isValid) {
        throw new Error('Invalid PIN');
      }
    }
  }

  // Clear all data - this is a destructive operation
  // Note: tauri-db doesn't support multi-statement exec, run each separately
  // Order matters due to foreign key constraints:
  // 1. Delete tables that reference others first
  // 2. Then delete the referenced tables
  await db.execute('DELETE FROM "transaction"');  // references sub_category, source
  await db.execute('DELETE FROM budget');          // references sub_category
  await db.execute('DELETE FROM auto_category_rule'); // references sub_category
  await db.execute('DELETE FROM sub_category');    // now safe to delete
  await db.execute('DELETE FROM source');          // now safe to delete
  await db.execute('DELETE FROM local_user');
  await db.execute('DELETE FROM sync_log');
  await db.execute('DELETE FROM net_worth_entry');

  // Delete all local backups (full reset means starting completely fresh)
  try {
    const { remove, exists, readDir } = await import('@tauri-apps/plugin-fs');
    const { appDataDir, join } = await import('@tauri-apps/api/path');

    const dataDir = await appDataDir();
    const backupsDir = await join(dataDir, 'backups');

    if (await exists(backupsDir)) {
      const entries = await readDir(backupsDir);
      for (const entry of entries) {
        if (entry.name?.endsWith('.db')) {
          try {
            await remove(await join(backupsDir, entry.name));
          } catch (err) {
            console.warn(`Failed to delete backup ${entry.name}:`, err);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Failed to clear backups directory:', err);
    // Continue with reset even if backup deletion fails
  }

  // Clear sync-related localStorage
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('puffin_sync_config');
    localStorage.removeItem('puffin_sync_credentials');
    localStorage.removeItem('puffin_oauth_tokens');
    localStorage.removeItem('puffin_oauth_configured');
    localStorage.removeItem('puffin_oauth_authenticated');
    localStorage.removeItem('puffin_oauth_extended_scope');
    localStorage.removeItem('puffin_session');
  }

  // Clear session and rate limit
  setAuthState(false);
  clearRateLimitState();

  return { success: true };
}

/**
 * Check if user is authenticated (for use by other handlers).
 */
export function checkAuthenticated(): boolean {
  return getAuthState();
}

/**
 * Set authentication state (for testing).
 */
export function setAuthenticated(value: boolean): void {
  setAuthState(value);
}
