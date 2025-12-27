// GET /api/auth/session - Check current session status
import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, hasUser } from '@/lib/auth';
import { initializeDatabase, isDatabaseInitialized } from '@/lib/db';
import type { SessionData } from '@/lib/auth';

export async function GET() {
  try {
    // Check if database is initialized
    const dbInitialized = isDatabaseInitialized();
    
    if (!dbInitialized) {
      initializeDatabase();
    }

    // Check setup status
    const isSetup = hasUser();
    
    // Get current session
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    return NextResponse.json({
      isLoggedIn: session.isLoggedIn || false,
      isSetup,
      userId: session.isLoggedIn ? session.userId : null,
    });
  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json(
      { error: 'Failed to check session' },
      { status: 500 }
    );
  }
}





