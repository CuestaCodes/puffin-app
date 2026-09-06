'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './use-auth';
import {
  ACTIVITY_WRITE_THROTTLE_MS,
  AUTO_LOCK_CHECK_INTERVAL_MS,
  AUTO_LOCK_PREFERENCE_EVENT,
  clearLastActivity,
  readAutoLockPreference,
  readLastActivity,
  shouldLock,
  writeLastActivity,
  type AutoLockPreference,
} from '@/lib/auto-lock';

/**
 * Events that count as user activity. `passive` because none of these handlers
 * call preventDefault, and `capture` so activity inside a modal's own scroll
 * container still registers.
 */
const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
const ACTIVITY_LISTENER_OPTIONS: AddEventListenerOptions = { passive: true, capture: true };

/**
 * Watch for inactivity and lock the app when the configured timeout elapses.
 *
 * Two deliberate choices:
 * - Activity writes are throttled. `mousemove` fires continuously, and
 *   persisting every one of them would be pointless work.
 * - The lock decision compares wall-clock timestamps on an interval rather
 *   than scheduling a `setTimeout` for the timeout itself, because a timer
 *   does not fire reliably across a machine sleep. Waking a suspended laptop
 *   past the timeout must come back locked.
 *
 * While auto-lock is switched off, no activity listeners and no interval are
 * attached — only the preference-change listener, so switching it on takes
 * effect immediately.
 *
 * @param active whether the countdown should run: logged in and not already locked.
 */
export function useAutoLock(active: boolean): void {
  const { lock } = useAuth();
  const [preference, setPreference] = useState<AutoLockPreference | null>(null);

  // Read the stored preference on mount rather than in useState, so the server
  // render and the first client render agree.
  useEffect(() => {
    const sync = () => setPreference(readAutoLockPreference());
    sync();

    window.addEventListener(AUTO_LOCK_PREFERENCE_EVENT, sync);
    return () => window.removeEventListener(AUTO_LOCK_PREFERENCE_EVENT, sync);
  }, []);

  const isOff = preference !== null && !preference.enabled;
  const enabled = active && preference?.enabled === true;
  const timeoutMinutes = preference?.timeoutMinutes;

  const evaluate = useCallback(() => {
    if (timeoutMinutes === undefined) return;
    if (shouldLock(readLastActivity(), timeoutMinutes, Date.now())) {
      lock();
    }
  }, [lock, timeoutMinutes]);

  // Drop the stored timestamp while auto-lock is off, since nothing is
  // updating it. Leaving a stale one behind would lock the app the instant the
  // setting was switched back on. Only runs once the preference is known, so
  // it can't wipe a timestamp we still need on the first render after a reload.
  useEffect(() => {
    if (isOff) clearLastActivity();
  }, [isOff]);

  useEffect(() => {
    if (!enabled) return;

    // No stored timestamp means auto-lock has just been switched on: start the
    // countdown from now. A timestamp that already exists is honoured as-is,
    // which is what makes a reload after the timeout come back locked.
    if (readLastActivity() === null) writeLastActivity(Date.now());

    let lastWrite = 0;
    const recordActivity = () => {
      const now = Date.now();
      if (now - lastWrite < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastWrite = now;
      writeLastActivity(now);
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, recordActivity, ACTIVITY_LISTENER_OPTIONS);
    }

    // Re-check when the window is shown or focused as well as on the interval,
    // so a sleep/wake or a long minimise locks immediately rather than waiting
    // out the remainder of a tick.
    window.addEventListener('focus', evaluate);
    document.addEventListener('visibilitychange', evaluate);

    const interval = window.setInterval(evaluate, AUTO_LOCK_CHECK_INTERVAL_MS);

    // Catch a reload that happened after the timeout had already elapsed.
    evaluate();

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, recordActivity, ACTIVITY_LISTENER_OPTIONS);
      }
      window.removeEventListener('focus', evaluate);
      document.removeEventListener('visibilitychange', evaluate);
      window.clearInterval(interval);
    };
  }, [enabled, evaluate]);
}
