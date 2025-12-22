// Authentication middleware utilities
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { sessionOptions } from './session';
import type { SessionData } from './session';

/**
 * Get the current session
 */
export async function getSession(): Promise<SessionData> {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  return {
    userId: session.userId || null,
    isLoggedIn: session.isLoggedIn || false,
  };
}

/**
 * Discriminated union for auth result
 * When isAuthenticated is false, response is guaranteed to exist
 */
export type AuthResult =
  | {
      isAuthenticated: true;
      session: SessionData;
    }
  | {
      isAuthenticated: false;
      session: SessionData;
      response: NextResponse;
    };

/**
 * Check if the current request is authenticated
 * Use in API routes: const auth = await requireAuth();
 * if (!auth.isAuthenticated) return auth.response; // Type-safe!
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await getSession();

  if (!session.isLoggedIn) {
    return {
      isAuthenticated: false,
      session,
      response: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  return {
    isAuthenticated: true,
    session,
  };
}



