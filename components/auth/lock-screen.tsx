'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock } from 'lucide-react';
import { sanitizePinInput } from '@/lib/utils';

/**
 * Full-screen PIN gate shown when auto-lock fires.
 *
 * Unlike logging out, this leaves the app mounted underneath: filters, scroll
 * position and any in-flight sync or import survive the lock. The overlay is
 * opaque and covers the viewport, so nothing of the app is visible through it.
 *
 * Rendered through a portal onto `document.body` so it sits alongside — not
 * inside — Radix's own portals. See the inert handling below for why that
 * matters.
 */
export function LockScreen() {
  const { login, logout, isLoading, error } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // Neutralise everything else on the page while locked.
  //
  // `inert` blocks pointer events and removes the subtree from the tab order
  // and the accessibility tree, so the covered app can't be reached by
  // keyboard. It also defuses an open Radix dialog: Radix traps focus and
  // pulls it back on `focusin`, which would make the PIN field unusable — but
  // calling `.focus()` on an inert element does nothing.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const others = Array.from(document.body.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== container
    );
    const previous = others.map((el) => el.inert);
    others.forEach((el) => {
      el.inert = true;
    });

    return () => {
      others.forEach((el, index) => {
        el.inert = previous[index];
      });
    };
  }, []);

  // Runs after the inert effect above, so focus can't be stolen back by a
  // dialog that happened to be open when the lock fired.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (pin.length !== 6) {
      setLocalError('Please enter your 6-digit PIN');
      return;
    }

    const success = await login(pin);
    if (!success) {
      // Deliberately no local message here: `login` already put the server's
      // own text in context, and that is where the rate limiter's "try again
      // in N minutes" lives. Overwriting it with a blanket "Invalid PIN" would
      // hide the one thing the user needs to know after five bad attempts.
      setPin('');
      inputRef.current?.focus();
    }
  };

  const displayError = localError || error;

  // Only ever mounted on the client, but a static export still evaluates this
  // module during prerender.
  if (typeof document === 'undefined') return null;

  return createPortal(
    // The z-index clears sonner's toaster, which pins itself at 999999999. A
    // background sync or import finishing while locked must not print its
    // result over the lock screen.
    <div
      ref={containerRef}
      role="dialog"
      aria-modal="true"
      aria-label="Puffin is locked"
      className="fixed inset-0 z-[1000000000] flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-4"
    >
      <Card className="w-full max-w-md border-slate-800 shadow-2xl shadow-cyan-500/10 bg-gradient-to-b from-slate-900 to-slate-950">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Locked
            </CardTitle>
            <CardDescription className="text-slate-400 mt-2">
              Puffin locked itself after a period of inactivity. Enter your PIN to continue.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="lock-pin" className="text-slate-300">
                PIN
              </Label>
              <Input
                ref={inputRef}
                id="lock-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(sanitizePinInput(e.target.value))}
                className="bg-slate-800 border-slate-700 text-slate-100 text-center text-xl tracking-[0.5em]"
                placeholder="••••••"
                disabled={isLoading}
              />
            </div>

            {displayError && (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-900/50 px-4 py-2 rounded-lg">
                {displayError}
              </p>
            )}

            <Button
              type="submit"
              disabled={isLoading || pin.length !== 6}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Unlocking...
                </>
              ) : (
                'Unlock'
              )}
            </Button>

            {/* Escape hatch: the login screen is where "forgot PIN" lives. */}
            <Button
              type="button"
              variant="ghost"
              onClick={logout}
              disabled={isLoading}
              className="w-full text-slate-400 hover:text-white hover:bg-slate-800"
            >
              Log out instead
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>,
    document.body
  );
}
