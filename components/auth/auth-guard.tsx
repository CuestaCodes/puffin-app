'use client';

import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useAutoLock } from '@/hooks/use-auto-lock';
import { LoginForm } from './login-form';
import { SetupForm } from './setup-form';
import { LockScreen } from './lock-screen';
import { Loader2 } from 'lucide-react';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isLoggedIn, isSetup, isLoading, isLocked } = useAuth();

  // Count down only while there is something to lock.
  useAutoLock(isLoggedIn && !isLocked);

  // Show loading state.
  //
  // Never while locked: unlocking sets `isLoading`, and swapping to this
  // loader would unmount the app underneath the overlay — losing exactly the
  // page state, filters and scroll position that locking to an overlay
  // instead of logging out exists to preserve. The lock screen shows its own
  // progress instead.
  if (isLoading && !isLocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Show setup form if no user exists
  if (!isSetup) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-4">
        <SetupForm />
      </div>
    );
  }

  // Show login form if not logged in. Locking deliberately keeps the session,
  // so a locked app is still logged in and falls through to the overlay below.
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-4">
        <LoginForm />
      </div>
    );
  }

  // Render children if authenticated. When locked they stay mounted and
  // rendered — covered, not hidden — because `display: none` resets the scroll
  // position of the app's scroll container, which would defeat the point of
  // locking to an overlay instead of logging out.
  return (
    <>
      {children}
      {isLocked && <LockScreen />}
    </>
  );
}
