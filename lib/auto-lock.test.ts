// @vitest-environment jsdom
//
// jsdom rather than the project-wide `node` environment because these helpers
// exist to encode assumptions about localStorage and the wall clock, and a
// stubbed storage object would test the stub rather than the behaviour.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ACTIVITY_WRITE_THROTTLE_MS,
  AUTO_LOCK_CHECK_INTERVAL_MS,
  AUTO_LOCK_PREFERENCE_EVENT,
  AUTO_LOCK_TIMEOUT_OPTIONS,
  DEFAULT_AUTO_LOCK_MINUTES,
  DEFAULT_AUTO_LOCK_PREFERENCE,
  SUSPEND_DETECTION_GAP_MS,
  clearLastActivity,
  isSuspendGap,
  normalizeAutoLockPreference,
  readAutoLockPreference,
  readLastActivity,
  readLockedFlag,
  resetIdleCountdown,
  shouldLock,
  writeAutoLockPreference,
  writeLastActivity,
  writeLockedFlag,
} from './auto-lock';

const PREFERENCE_KEY = 'puffin_auto_lock';
const LAST_ACTIVITY_KEY = 'puffin_last_activity';
const LOCKED_KEY = 'puffin_locked';

const MINUTE = 60_000;

/** Roughly how far apart Chromium lets a timer fire in a hidden window. */
const HIDDEN_WINDOW_TIMER_THROTTLE_MS = 60_000;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('shouldLock', () => {
  const now = 1_700_000_000_000;

  it('does not lock before the timeout has elapsed', () => {
    expect(shouldLock(now - 4 * MINUTE, 5, now)).toBe(false);
  });

  it('locks once the timeout has elapsed', () => {
    expect(shouldLock(now - 6 * MINUTE, 5, now)).toBe(true);
  });

  it('locks exactly at the boundary', () => {
    expect(shouldLock(now - 5 * MINUTE, 5, now)).toBe(true);
    expect(shouldLock(now - 5 * MINUTE + 1, 5, now)).toBe(false);
  });

  it('locks when there is no recorded activity', () => {
    // Failing safe matters here: it is what makes a window reloaded after the
    // timeout come back locked rather than open.
    expect(shouldLock(null, 5, now)).toBe(true);
  });

  it('locks after a wall-clock jump larger than the timeout', () => {
    // A machine asleep for two hours: no timer ticks fired, but the clock moved.
    expect(shouldLock(now, 30, now + 120 * MINUTE)).toBe(true);
  });

  it('treats a future timestamp as recent activity rather than a huge idle gap', () => {
    expect(shouldLock(now + 10 * MINUTE, 5, now)).toBe(false);
  });

  it('never locks on a non-positive or non-finite timeout', () => {
    expect(shouldLock(now - 100 * MINUTE, 0, now)).toBe(false);
    expect(shouldLock(now - 100 * MINUTE, -5, now)).toBe(false);
    expect(shouldLock(now - 100 * MINUTE, Number.NaN, now)).toBe(false);
  });

  it('locks for every offered timeout once that many minutes have passed', () => {
    for (const minutes of AUTO_LOCK_TIMEOUT_OPTIONS) {
      expect(shouldLock(now - minutes * MINUTE, minutes, now)).toBe(true);
      expect(shouldLock(now - (minutes * MINUTE - 1), minutes, now)).toBe(false);
    }
  });
});

describe('isSuspendGap', () => {
  it('ignores the normal gap between consecutive checks', () => {
    expect(isSuspendGap(AUTO_LOCK_CHECK_INTERVAL_MS)).toBe(false);
  });

  it('ignores a hidden window whose timers have been throttled to once a minute', () => {
    // Chromium throttles background timers to roughly 1/min. Treating that as
    // a suspend would lock on every long minimise, which the feature must not
    // do — blur deliberately gets no special handling.
    expect(isSuspendGap(HIDDEN_WINDOW_TIMER_THROTTLE_MS)).toBe(false);
  });

  it('detects a machine that slept', () => {
    expect(isSuspendGap(30 * MINUTE)).toBe(true);
    expect(isSuspendGap(SUSPEND_DETECTION_GAP_MS)).toBe(true);
  });

  it('does not treat a clock moving backwards as a suspend', () => {
    expect(isSuspendGap(-5 * MINUTE)).toBe(false);
  });

  it('does not treat a non-finite elapsed time as a suspend', () => {
    expect(isSuspendGap(Number.NaN)).toBe(false);
  });

  it('keeps real margin over the throttled-timer rate', () => {
    // The floor that stops a long minimise being read as a suspend. Lowering
    // the threshold towards 60s reintroduces exactly that false positive.
    expect(SUSPEND_DETECTION_GAP_MS).toBeGreaterThanOrEqual(HIDDEN_WINDOW_TIMER_THROTTLE_MS * 1.5);
    expect(SUSPEND_DETECTION_GAP_MS).toBeLessThan(Math.max(...AUTO_LOCK_TIMEOUT_OPTIONS) * MINUTE);
  });
});

describe('normalizeAutoLockPreference', () => {
  it('falls back to the default for values that are not objects', () => {
    for (const value of [null, undefined, 'on', 42, true]) {
      expect(normalizeAutoLockPreference(value)).toEqual(DEFAULT_AUTO_LOCK_PREFERENCE);
    }
  });

  it('only treats a literal true as enabled', () => {
    expect(normalizeAutoLockPreference({ enabled: 'yes' }).enabled).toBe(false);
    expect(normalizeAutoLockPreference({ enabled: 1 }).enabled).toBe(false);
    expect(normalizeAutoLockPreference({ enabled: true }).enabled).toBe(true);
  });

  it('rejects a timeout that is not one of the offered options', () => {
    expect(normalizeAutoLockPreference({ enabled: true, timeoutMinutes: 7 }).timeoutMinutes).toBe(
      DEFAULT_AUTO_LOCK_MINUTES
    );
    expect(normalizeAutoLockPreference({ enabled: true, timeoutMinutes: -1 }).timeoutMinutes).toBe(
      DEFAULT_AUTO_LOCK_MINUTES
    );
    expect(
      normalizeAutoLockPreference({ enabled: true, timeoutMinutes: '15' }).timeoutMinutes
    ).toBe(DEFAULT_AUTO_LOCK_MINUTES);
  });

  it('keeps a valid timeout', () => {
    expect(normalizeAutoLockPreference({ enabled: true, timeoutMinutes: 30 })).toEqual({
      enabled: true,
      timeoutMinutes: 30,
    });
  });
});

describe('preference storage', () => {
  it('round-trips a written preference', () => {
    writeAutoLockPreference({ enabled: true, timeoutMinutes: 30 });
    expect(readAutoLockPreference()).toEqual({ enabled: true, timeoutMinutes: 30 });
  });

  it('returns the default when nothing is stored', () => {
    expect(readAutoLockPreference()).toEqual(DEFAULT_AUTO_LOCK_PREFERENCE);
  });

  it('is off by default', () => {
    expect(DEFAULT_AUTO_LOCK_PREFERENCE.enabled).toBe(false);
    expect(DEFAULT_AUTO_LOCK_PREFERENCE.timeoutMinutes).toBe(DEFAULT_AUTO_LOCK_MINUTES);
  });

  it('returns the default for unparseable stored JSON', () => {
    localStorage.setItem(PREFERENCE_KEY, '{not json');
    expect(readAutoLockPreference()).toEqual(DEFAULT_AUTO_LOCK_PREFERENCE);
  });

  it('repairs a stored preference with an unsupported timeout', () => {
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ enabled: true, timeoutMinutes: 999 }));
    expect(readAutoLockPreference()).toEqual({
      enabled: true,
      timeoutMinutes: DEFAULT_AUTO_LOCK_MINUTES,
    });
  });

  it('normalizes on write, so a bad value is never persisted', () => {
    writeAutoLockPreference({ enabled: true, timeoutMinutes: 7 });
    expect(JSON.parse(localStorage.getItem(PREFERENCE_KEY) as string)).toEqual({
      enabled: true,
      timeoutMinutes: DEFAULT_AUTO_LOCK_MINUTES,
    });
  });

  it('announces the change so the idle watcher picks it up without polling', () => {
    const listener = vi.fn();
    window.addEventListener(AUTO_LOCK_PREFERENCE_EVENT, listener);

    writeAutoLockPreference({ enabled: true, timeoutMinutes: 15 });

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTO_LOCK_PREFERENCE_EVENT, listener);
  });

  it('still announces the change when the write itself fails', () => {
    // A quota or private-mode failure must not leave the watcher running on a
    // preference the user has already changed in the UI.
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const listener = vi.fn();
    window.addEventListener(AUTO_LOCK_PREFERENCE_EVENT, listener);

    expect(() => writeAutoLockPreference({ enabled: true, timeoutMinutes: 15 })).not.toThrow();

    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener(AUTO_LOCK_PREFERENCE_EVENT, listener);
  });

  it('returns the default rather than throwing when reads fail', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    expect(readAutoLockPreference()).toEqual(DEFAULT_AUTO_LOCK_PREFERENCE);
  });
});

describe('last activity storage', () => {
  it('round-trips a timestamp', () => {
    writeLastActivity(1_700_000_000_000);
    expect(readLastActivity()).toBe(1_700_000_000_000);
  });

  it('returns null when nothing is stored', () => {
    expect(readLastActivity()).toBeNull();
  });

  it('returns null for a non-numeric stored value', () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, 'yesterday');
    expect(readLastActivity()).toBeNull();
  });

  it('clears the stored timestamp', () => {
    writeLastActivity(Date.now());
    clearLastActivity();
    expect(readLastActivity()).toBeNull();
  });

  it('locks when the stored value is corrupt, via shouldLock', () => {
    localStorage.setItem(LAST_ACTIVITY_KEY, 'yesterday');
    expect(shouldLock(readLastActivity(), 5, Date.now())).toBe(true);
  });
});

describe('resetIdleCountdown', () => {
  it('starts the countdown from now when auto-lock is on', () => {
    writeAutoLockPreference({ enabled: true, timeoutMinutes: 5 });
    const before = Date.now();

    resetIdleCountdown();

    const stored = readLastActivity();
    expect(stored).not.toBeNull();
    expect(stored as number).toBeGreaterThanOrEqual(before);
  });

  it('leaves no timestamp behind when auto-lock is off', () => {
    // The invariant the idle watcher relies on. A timestamp written while the
    // feature is off would sit there ageing, and enabling auto-lock later
    // would then lock the app instantly instead of starting a fresh countdown.
    writeAutoLockPreference({ enabled: false, timeoutMinutes: 5 });
    writeLastActivity(Date.now() - 60 * MINUTE);

    resetIdleCountdown();

    expect(readLastActivity()).toBeNull();
  });

  it('leaves a freshly enabled watcher nothing stale to measure against', () => {
    // Logging in with auto-lock off, working for an hour, then switching it
    // on must not lock immediately.
    writeAutoLockPreference({ enabled: false, timeoutMinutes: 5 });
    resetIdleCountdown();

    writeAutoLockPreference({ enabled: true, timeoutMinutes: 5 });
    const oneHourLater = Date.now() + 60 * MINUTE;

    // Null is what the watcher takes as "just switched on", so it seeds the
    // timestamp itself rather than locking.
    expect(readLastActivity()).toBeNull();
    expect(shouldLock(oneHourLater, 5, oneHourLater)).toBe(false);
  });
});

describe('locked flag', () => {
  it('defaults to unlocked', () => {
    expect(readLockedFlag()).toBe(false);
  });

  it('round-trips the locked state', () => {
    writeLockedFlag(true);
    expect(readLockedFlag()).toBe(true);

    writeLockedFlag(false);
    expect(readLockedFlag()).toBe(false);
  });

  it('removes the key when unlocking rather than storing a falsy string', () => {
    writeLockedFlag(true);
    writeLockedFlag(false);
    expect(localStorage.getItem(LOCKED_KEY)).toBeNull();
  });

  it('treats an unexpected stored value as unlocked', () => {
    localStorage.setItem(LOCKED_KEY, 'true');
    expect(readLockedFlag()).toBe(false);
  });
});

describe('timing constants', () => {
  it('checks often enough that the shortest timeout is not overshot noticeably', () => {
    const shortest = Math.min(...AUTO_LOCK_TIMEOUT_OPTIONS) * MINUTE;
    expect(AUTO_LOCK_CHECK_INTERVAL_MS).toBeLessThan(shortest / 2);
  });

  it('throttles activity writes without letting them lag the idle check', () => {
    expect(ACTIVITY_WRITE_THROTTLE_MS).toBeGreaterThan(0);
    expect(ACTIVITY_WRITE_THROTTLE_MS).toBeLessThan(AUTO_LOCK_CHECK_INTERVAL_MS);
  });
});
