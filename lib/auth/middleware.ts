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
 * Check if the current request is authenticated
 * Use in API routes: const { isAuthenticated, response } = await requireAuth();
 */
export async function requireAuth(): Promise<{
  isAuthenticated: boolean;
  session: SessionData;
  response?: NextResponse;
}> {
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



