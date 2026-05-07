'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { OAUTH_REFRESH_FAILED_EVENT } from '@/lib/services/api-client';

/**
 * Globally-mounted modal that surfaces when any sync-related API call fails
 * with `errorCode: 'REFRESH_FAILED'` (Google rejected the refresh token —
 * typically because it expired beyond the 7-day window for OAuth apps in
 * Testing publishing mode, or because it was revoked).
 *
 * Triggered by a custom event dispatched from the api client. The user clicks
 * "Open Sync Settings" to be taken to the existing reconnect flow — sync
 * config (folder ID) and stored credentials are preserved; only OAuth tokens
 * need refreshing.
 */

// sessionStorage key — once the user dismisses the modal in a given session,
// don't reopen it on every subsequent poll/sync call (the Header polls
// /api/sync/check, which would re-fire REFRESH_FAILED and produce an
// infinite loop). Cleared on a fresh OAuth success or when the user
// explicitly opens the OAuth URL again from Settings.
const DISMISSED_KEY = 'puffin_reconnect_dismissed';

function isDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function markDismissed(): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // sessionStorage unavailable — fall through; modal may re-trigger but won't crash
  }
}

export function ReconnectDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // If the OAuth callback just succeeded, clear any prior dismissal so
    // future failures re-trigger the modal cleanly. app-shell.tsx routes on
    // `?sync_auth=success` for the same callback, so the marker is reliable.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('sync_auth') === 'success') {
        sessionStorage.removeItem(DISMISSED_KEY);
      }
    } catch {
      // ignore
    }

    const onRefreshFailed = () => {
      if (isDismissed()) return;
      setOpen(true);
    };
    window.addEventListener(OAUTH_REFRESH_FAILED_EVENT, onRefreshFailed);
    return () => window.removeEventListener(OAUTH_REFRESH_FAILED_EVENT, onRefreshFailed);
  }, []);

  const handleDismiss = () => {
    markDismissed();
    setOpen(false);
  };

  const handleOpenSettings = () => {
    markDismissed();
    setOpen(false);
    // Hint to the Settings page (sync-management.tsx) to auto-fire the
    // OAuth re-authentication flow once the page loads. sessionStorage
    // because app-shell.tsx strips query params before child components
    // mount, so we can't pass this via the URL.
    try {
      sessionStorage.setItem('puffin_action_reauth', '1');
    } catch {
      // ignore — user lands on Settings without auto-trigger
    }
    // The app is a single-page client (see app-shell.tsx) — there's no
    // /settings route. Use the existing `?page=settings` query convention
    // recognised by getInitialPage() to land on the Settings tab.
    window.location.search = '?page=settings';
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) handleDismiss();
        else setOpen(true);
      }}
    >
      <DialogContent className="bg-slate-900 border-slate-700">
        <DialogHeader>
          <DialogTitle className="text-slate-100">Reconnect Google Drive</DialogTitle>
          <DialogDescription className="text-slate-400">
            Your Google sign-in has expired and needs to be refreshed. Your sync folder
            and saved credentials are preserved — only the connection itself needs
            reconnecting.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleDismiss}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            Dismiss
          </Button>
          <Button
            onClick={handleOpenSettings}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500"
          >
            Open Sync Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
