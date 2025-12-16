// POST /api/auth/logout - Log out and destroy session
import { NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { sessionOptions, defaultSession } from '@/lib/auth';
import type { SessionData } from '@/lib/auth';

export async function POST() {
  try {
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    
    // Reset session to default (logged out) state
    session.userId = defaultSession.userId;
    session.isLoggedIn = defaultSession.isLoggedIn;
    await session.save();

    return NextResponse.json({ 
      success: true,
      message: 'Logged out successfully' 
    });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to log out' },
      { status: 500 }
    );
  }
}

