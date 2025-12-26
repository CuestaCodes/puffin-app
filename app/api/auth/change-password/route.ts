// POST /api/auth/change-password - Change user PIN
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import {
  requireAuth,
  sessionOptions,
  defaultSession,
  verifyUserPassword,
  updateUserPassword,
  checkRateLimit,
  recordAttempt,
  clearAttempts,
  getClientIp,
  AUTH_RATE_LIMITS,
} from '@/lib/auth';
import type { SessionData } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  // Apply rate limiting (5 attempts per 15 minutes)
  const clientIp = getClientIp(request.headers);
  const rateLimitKey = `change-pin:${clientIp}`;
  const rateLimit = checkRateLimit(rateLimitKey, AUTH_RATE_LIMITS.changePin);

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
    const body = await request.json();
    // Support both old field names (currentPassword/newPassword) and new (currentPin/newPin)
    const currentPin = body.currentPin || body.currentPassword;
    const newPin = body.newPin || body.newPassword;

    // Validate required fields
    if (!currentPin || !newPin) {
      return NextResponse.json(
        { error: 'Current PIN and new PIN are required' },
        { status: 400 }
      );
    }

    // Validate new PIN format (exactly 6 digits)
    if (!/^\d{6}$/.test(newPin)) {
      return NextResponse.json(
        { error: 'New PIN must be exactly 6 digits' },
        { status: 400 }
      );
    }

    // Record attempt before verifying (to count failed attempts)
    recordAttempt(rateLimitKey);

    // Verify current PIN
    const isValid = await verifyUserPassword(currentPin);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Current PIN is incorrect' },
        { status: 401 }
      );
    }

    // Clear rate limit on successful verification
    clearAttempts(rateLimitKey);

    // Update PIN
    await updateUserPassword(newPin);

    // Clear the current session - user will need to log in again
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.userId = defaultSession.userId;
    session.isLoggedIn = defaultSession.isLoggedIn;
    await session.save();

    return NextResponse.json({
      success: true,
      message: 'PIN changed successfully. Please log in with your new PIN.',
    });
  } catch (error) {
    console.error('Change PIN error:', error);
    return NextResponse.json(
      { error: 'Failed to change PIN' },
      { status: 500 }
    );
  }
}
