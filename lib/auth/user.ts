// User model operations
import { getDatabase } from '../db';
import { generateId } from '../uuid';
import { hashPassword, verifyPassword } from './password';
import type { LocalUser } from '@/types/database';

/**
 * Get the local user (there's only one user in this app)
 */
export function getUser(): LocalUser | null {
  const db = getDatabase();
  const result = db.prepare('SELECT * FROM local_user LIMIT 1').get() as LocalUser | undefined;
  return result || null;
}

/**
 * Check if a user has been set up
 */
export function hasUser(): boolean {
  const db = getDatabase();
  const result = db.prepare('SELECT COUNT(*) as count FROM local_user').get() as { count: number };
  return result.count > 0;
}

/**
 * Create the initial user with a password
 * @param password Plain text password
 * @returns The created user
 */
export async function createUser(password: string): Promise<LocalUser> {
  // Check if user already exists
  if (hasUser()) {
    throw new Error('User already exists');
  }

  const db = getDatabase();
  const id = generateId();
  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO local_user (id, password_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `).run(id, passwordHash, now, now);

  return {
    id,
    password_hash: passwordHash,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Verify user password
 * @param password Plain text password to verify
 * @returns True if password is correct
 */
export async function verifyUserPassword(password: string): Promise<boolean> {
  const user = getUser();
  if (!user) {
    return false;
  }
  return verifyPassword(password, user.password_hash);
}

/**
 * Update user password
 * @param newPassword New plain text password
 */
export async function updateUserPassword(newPassword: string): Promise<void> {
  const user = getUser();
  if (!user) {
    throw new Error('No user exists');
  }

  const db = getDatabase();
  const passwordHash = await hashPassword(newPassword);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE local_user SET password_hash = ?, updated_at = ? WHERE id = ?
  `).run(passwordHash, now, user.id);
}

