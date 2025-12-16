// POST /api/auth/login - Login with password
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { loginSchema } from '@/lib/validations';
import { sessionOptions, getUser, verifyUserPassword } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import type { SessionData } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Initialize database
    initializeDatabase();

    // Parse and validate request body
    const body = await request.json();
    const validation = loginSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Verify password
    const isValid = await verifyUserPassword(validation.data.password);
    
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }

    // Get user for session
    const user = getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      );
    }

    // Create session
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.userId = user.id;
    session.isLoggedIn = true;
    await session.save();

    return NextResponse.json({ 
      success: true,
      message: 'Logged in successfully' 
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Failed to log in' },
      { status: 500 }
    );
  }
}

