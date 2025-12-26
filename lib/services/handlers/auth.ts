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
  id: number;
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

// In-memory session state for Tauri (desktop app is single-user)
let isAuthenticated = false;

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
    authenticated: isAuthenticated,
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

  const { pin } = body as { pin: string };

  if (!pin || typeof pin !== 'string') {
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
  const isValid = await verifyPin(pin, user.password_hash);

  if (!isValid) {
    throw new Error('Invalid PIN');
  }

  isAuthenticated = true;
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

  isAuthenticated = false;
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

  const { pin } = body as { pin: string };

  if (!pin || typeof pin !== 'string' || pin.length !== 6 || !/^\d+$/.test(pin)) {
    throw new Error('PIN must be exactly 6 digits');
  }

  // Check if user already exists
  const existingUser = await db.queryOne<LocalUser>('SELECT * FROM local_user LIMIT 1');
  if (existingUser) {
    throw new Error('User already configured');
  }

  // Hash the PIN
  const passwordHash = await hashPin(pin);
  const now = new Date().toISOString();

  await db.execute(
    'INSERT INTO local_user (password_hash, created_at, updated_at) VALUES (?, ?, ?)',
    [passwordHash, now, now]
  );

  isAuthenticated = true;
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

  if (!isAuthenticated) {
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
  const newHash = await hashPin(newPin);
  await db.execute(
    'UPDATE local_user SET password_hash = ?, updated_at = ? WHERE id = ?',
    [newHash, new Date().toISOString(), user.id]
  );

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
 * Check if user is authenticated (for use by other handlers).
 */
export function checkAuthenticated(): boolean {
  return isAuthenticated;
}

/**
 * Set authentication state (for testing).
 */
export function setAuthenticated(value: boolean): void {
  isAuthenticated = value;
}
