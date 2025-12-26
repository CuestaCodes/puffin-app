// POST /api/auth/change-password - Change user password
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
        { error: 'Current password and new password are required' },
        { status: 400 }
      );
    }

    // Validate new password length
    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Verify current password
    const isValid = await verifyUserPassword(currentPassword);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    // Update password
    await updateUserPassword(newPassword);

    // Clear the current session - user will need to log in again
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    session.userId = defaultSession.userId;
    session.isLoggedIn = defaultSession.isLoggedIn;
    await session.save();

    return NextResponse.json({
      success: true,
      message: 'Password changed successfully. Please log in with your new password.',
    });
  } catch (error) {
    console.error('Change password error:', error);
    return NextResponse.json(
      { error: 'Failed to change password' },
      { status: 500 }
    );
  }
}
