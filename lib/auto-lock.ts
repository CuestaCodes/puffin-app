/**
 * Auto-lock preference and idle evaluation.
 *
 * The preference is a per-device security choice, so it lives in localStorage
 * rather than the database: it is never synced to Drive and needs no schema
 * migration.
 *
 * Idle is evaluated by comparing stored wall-clock timestamps, never by
 * trusting timer ticks. A `setTimeout` for N minutes does not fire reliably
 * across a machine sleep, so the app would come back from suspend unlocked if
 * it counted ticks instead of clock time.
 */

/** Timeout choices offered in Settings, in minutes. */
export const AUTO_LOCK_TIMEOUT_OPTIONS = [1, 5, 15, 30, 60] as const;

/** Selected timeout when auto-lock is first switched on. */
export const DEFAULT_AUTO_LOCK_MINUTES = 5;

/** How often the idle check runs while auto-lock is enabled. */
export const AUTO_LOCK_CHECK_INTERVAL_MS = 15_000;

/**
 * Minimum gap between activity timestamp writes. Activity events fire far too
 * often to persist each one; this throttles them to a cheap periodic write.
 */
export const ACTIVITY_WRITE_THROTTLE_MS = 5_000;

/**
 * A gap this much longer than the check interval means the process was not
 * running: the machine slept, hibernated, or was frozen by the OS. Resuming
 * from that locks immediately, without waiting for the idle timeout.
 *
 * Two minutes rather than something tighter because Chromium throttles timers
 * in a hidden window to roughly once a minute, and a throttled tick must not
 * be mistaken for a suspend — the user's choice was that merely minimising the
 * app should not lock it early. The cost is that a nap shorter than two
 * minutes is not detected as a suspend; the ordinary idle timeout still
 * covers it.
 */
export const SUSPEND_DETECTION_GAP_MS = 120_000;

/**
 * Fired on `window` whenever the preference is written, so the idle watcher
 * picks up a Settings change immediately. Polling would mean keeping a timer
 * running even while auto-lock is switched off, which the feature explicitly
 * must not do.
 */
export const AUTO_LOCK_PREFERENCE_EVENT = 'puffin:auto-lock-preference';

const PREFERENCE_KEY = 'puffin_auto_lock';
const LAST_ACTIVITY_KEY = 'puffin_last_activity';
const LOCKED_KEY = 'puffin_locked';

export interface AutoLockPreference {
  enabled: boolean;
  timeoutMinutes: number;
}

/** Off by default: enabling auto-lock is opt-in, so existing behaviour is unchanged. */
export const DEFAULT_AUTO_LOCK_PREFERENCE: AutoLockPreference = {
  enabled: false,
  timeoutMinutes: DEFAULT_AUTO_LOCK_MINUTES,
};

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

/**
 * Coerce an unknown stored value into a usable preference.
 *
 * Exported for testing: this is where a hand-edited or half-written
 * localStorage value has to fail safe rather than throw.
 */
export function normalizeAutoLockPreference(value: unknown): AutoLockPreference {
  if (!value || typeof value !== 'object') return { ...DEFAULT_AUTO_LOCK_PREFERENCE };

  const raw = value as Partial<Record<keyof AutoLockPreference, unknown>>;
  const timeout = raw.timeoutMinutes;

  return {
    enabled: raw.enabled === true,
    timeoutMinutes:
      typeof timeout === 'number' &&
      (AUTO_LOCK_TIMEOUT_OPTIONS as readonly number[]).includes(timeout)
        ? timeout
        : DEFAULT_AUTO_LOCK_MINUTES,
  };
}

export function readAutoLockPreference(): AutoLockPreference {
  if (!hasLocalStorage()) return { ...DEFAULT_AUTO_LOCK_PREFERENCE };

  try {
    const stored = localStorage.getItem(PREFERENCE_KEY);
    if (!stored) return { ...DEFAULT_AUTO_LOCK_PREFERENCE };
    return normalizeAutoLockPreference(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_AUTO_LOCK_PREFERENCE };
  }
}

export function writeAutoLockPreference(preference: AutoLockPreference): void {
  if (!hasLocalStorage()) return;

  try {
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify(normalizeAutoLockPreference(preference)));
  } catch {
    // Ignore storage errors
  }

  window.dispatchEvent(new CustomEvent(AUTO_LOCK_PREFERENCE_EVENT));
}

export function readLastActivity(): number | null {
  if (!hasLocalStorage()) return null;

  try {
    const stored = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!stored) return null;
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLastActivity(timestamp: number): void {
  if (!hasLocalStorage()) return;

  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
  } catch {
    // Ignore storage errors
  }
}

export function clearLastActivity(): void {
  if (!hasLocalStorage()) return;

  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // Ignore storage errors
  }
}

/** Whether the app was left locked, so a reload comes back locked rather than open. */
export function readLockedFlag(): boolean {
  if (!hasLocalStorage()) return false;

  try {
    return localStorage.getItem(LOCKED_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeLockedFlag(locked: boolean): void {
  if (!hasLocalStorage()) return;

  try {
    if (locked) {
      localStorage.setItem(LOCKED_KEY, '1');
    } else {
      localStorage.removeItem(LOCKED_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Whether enough idle time has elapsed to lock.
 *
 * Pure wall-clock comparison so it survives sleep/wake, and so it is testable
 * without a DOM or fake timers.
 *
 * A missing `lastActivityAt` means we have no evidence of recent activity, so
 * it locks — that is the safe direction, and it is what makes a reload after
 * the timeout come back locked. A timestamp in the future (clock moved
 * backwards) is treated as recent activity rather than as a huge idle period.
 */
export function shouldLock(
  lastActivityAt: number | null,
  timeoutMinutes: number,
  now: number
): boolean {
  if (lastActivityAt === null || !Number.isFinite(lastActivityAt)) return true;
  if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) return false;

  return now - lastActivityAt >= timeoutMinutes * 60_000;
}

/**
 * Whether the time between two consecutive idle checks is too long to be
 * explained by the app simply running, and so indicates the machine was
 * suspended in between.
 *
 * A clock jump backwards (manual change, NTP correction) yields a negative
 * elapsed value and is not a suspend.
 */
export function isSuspendGap(elapsedMs: number): boolean {
  if (!Number.isFinite(elapsedMs)) return false;
  return elapsedMs >= SUSPEND_DETECTION_GAP_MS;
}
