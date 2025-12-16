// POST /api/auth/setup - Create initial user password
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { setupPasswordSchema } from '@/lib/validations';
import { sessionOptions, hasUser, createUser } from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import type { SessionData } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Initialize database if needed
    initializeDatabase();
    
    // Check if user already exists
    if (hasUser()) {
      return NextResponse.json(
        { error: 'User already set up' },
        { status: 400 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = setupPasswordSchema.safeParse(body);
    
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    // Create user
    const user = await createUser(validation.data.password);

    // Create session
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.userId = user.id;
    session.isLoggedIn = true;
    await session.save();

    return NextResponse.json({ 
      success: true,
      message: 'Password set up successfully' 
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json(
      { error: 'Failed to set up password' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    initializeDatabase();
    const userExists = hasUser();
    
    return NextResponse.json({ 
      isSetup: userExists 
    });
  } catch (error) {
    console.error('Setup check error:', error);
    return NextResponse.json(
      { error: 'Failed to check setup status' },
      { status: 500 }
    );
  }
}

