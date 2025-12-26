// POST /api/auth/change-password - Change user PIN
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { requireAuth, sessionOptions, defaultSession, verifyUserPassword, updateUserPassword } from '@/lib/auth';
import type { SessionData } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if (!auth.isAuthenticated) return auth.response;

  try {
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    // Validate required fields
    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: 'Current PIN and new PIN are required' },
        { status: 400 }
      );
    }

    // Validate new PIN format (exactly 6 digits)
    if (!/^\d{6}$/.test(newPassword)) {
      return NextResponse.json(
        { error: 'New PIN must be exactly 6 digits' },
        { status: 400 }
      );
    }

    // Verify current PIN
    const isValid = await verifyUserPassword(currentPassword);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Current PIN is incorrect' },
        { status: 401 }
      );
    }

    // Update PIN
    await updateUserPassword(newPassword);

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
