// POST /api/auth/login - Login with PIN
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { loginSchema } from '@/lib/validations';
import {
  sessionOptions,
  getUser,
  verifyUserPassword,
  checkRateLimit,
  recordAttempt,
  clearAttempts,
  getClientIp,
  AUTH_RATE_LIMITS,
} from '@/lib/auth';
import { initializeDatabase } from '@/lib/db';
import type { SessionData } from '@/lib/auth';

export async function POST(request: NextRequest) {
  // Apply rate limiting (5 attempts per 15 minutes)
  const clientIp = getClientIp(request.headers);
  const rateLimitKey = `login:${clientIp}`;
  const rateLimit = checkRateLimit(rateLimitKey, AUTH_RATE_LIMITS.login);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: rateLimit.message },
      {
        status: 429,
        headers: rateLimit.retryAfterMs
          ? { 'Retry-After': String(Math.ceil(rateLimit.retryAfterMs / 1000)) }
          : undefined,
      }
    );
  }

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

    // Record attempt before verifying
    recordAttempt(rateLimitKey);

    // Verify PIN
    const isValid = await verifyUserPassword(validation.data.password);

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid PIN' },
        { status: 401 }
      );
    }

    // Clear rate limit on successful login
    clearAttempts(rateLimitKey);

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





