import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitize PIN input to only allow 6 digits.
 * Used by PIN input components for consistent validation.
 */
export function sanitizePinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6);
}

/**
 * Format a date as YYYY-MM-DD without timezone conversion issues.
 * Unlike Date.toISOString().split('T')[0], this function constructs the string
 * directly from the components, avoiding UTC timezone offset problems.
 */
export function formatDateYMD(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Calculate total spend from category breakdown.
 * Excludes savings: savings represents money set aside, not money spent.
 */
export function calculateTotalSpend(breakdown: {
  expenses: number;
  bills: number;
  debt: number;
  sinking: number;
}): number {
  return (
    (breakdown.expenses || 0) +
    (breakdown.bills || 0) +
    (breakdown.debt || 0) +
    (breakdown.sinking || 0)
  );
}

/**
 * Format a number as Australian currency (AUD).
 * Supports compact format for large numbers (K, M).
 */
export function formatCurrencyAUD(
  amount: number,
  options?: { compact?: boolean; decimals?: number }
): string {
  const { compact = false, decimals = 0 } = options || {};

  if (compact) {
    if (Math.abs(amount) >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(amount) >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`;
    }
  }

  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}

/**
 * The app scrolls inside `<main>` in app-shell, not the window: the shell is `h-screen`
 * and `<main>` carries `overflow-auto`. So `window.scrollY` is always 0 here and
 * `window.scrollTo` is a no-op. Resolve the real scroll container, falling back to the
 * window for any context (tests, a future layout) where `<main>` does not scroll.
 */
export function getScrollContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const main = document.querySelector('main');
  return main && main.scrollHeight > main.clientHeight ? main : null;
}

/** Stop pinning if a refetch hangs, rather than holding the scroll position forever. */
const PIN_TIMEOUT_MS = 2000;

/**
 * Frames to keep pinning after the operation resolves. React may not have committed
 * its final render by the time the promise settles, so releasing immediately would
 * leave the last paint unpinned — the flash this whole helper exists to remove.
 */
const PIN_HOLD_FRAMES = 3;

/**
 * Keys that scroll. A deliberate keyboard scroll should win over the pin, exactly as
 * a wheel or touch scroll does.
 */
const SCROLL_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  'Home',
  'End',
  ' ',
]);

interface ScrollPin {
  cancel: () => void;
}

/** Only one pin at a time: two overlapping operations would otherwise fight over the offset. */
let activePin: ScrollPin | null = null;

/**
 * Hold the scroll offset at `target` until cancelled.
 *
 * Re-asserting the offset every frame is what removes the flash. `requestAnimationFrame`
 * callbacks run before that frame's paint, so no frame can be painted at the wrong
 * offset — whereas restoring once at the end necessarily paints the churn first.
 *
 * Note the abort listeners deliberately exclude `scroll`: assigning `scrollTop` fires a
 * `scroll` event, so listening for it would make the pin cancel itself on its own first
 * write.
 */
function pinScroll(container: HTMLElement | null, target: number): ScrollPin {
  activePin?.cancel();

  const controller = new AbortController();
  const startedAt = Date.now();
  let frame = 0;
  let cancelled = false;

  const pin: ScrollPin = {
    cancel: () => {
      if (cancelled) return;
      cancelled = true;
      cancelAnimationFrame(frame);
      controller.abort();
      if (activePin === pin) activePin = null;
    },
  };

  const read = () => (container ? container.scrollTop : window.scrollY);
  const write = () => {
    if (container) {
      container.scrollTop = target;
    } else {
      window.scrollTo(0, target);
    }
  };

  const tick = () => {
    if (cancelled) return;
    if (Date.now() - startedAt >= PIN_TIMEOUT_MS) {
      pin.cancel();
      return;
    }
    // A shrinking list clamps the offset, so this may never reach `target`. Writing
    // anyway is correct: it re-asserts the position the moment the content grows back,
    // and the browser clamps harmlessly until then.
    if (read() !== target) write();
    frame = requestAnimationFrame(tick);
  };

  const abortOnUserScroll = () => pin.cancel();
  const abortOnScrollKey = (event: KeyboardEvent) => {
    if (SCROLL_KEYS.has(event.key)) pin.cancel();
  };

  const options = { passive: true, signal: controller.signal } as const;
  window.addEventListener('wheel', abortOnUserScroll, options);
  window.addEventListener('touchmove', abortOnUserScroll, options);
  window.addEventListener('keydown', abortOnScrollKey, {
    capture: true,
    signal: controller.signal,
  });

  activePin = pin;
  frame = requestAnimationFrame(tick);
  return pin;
}

function afterFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = count;
    const step = () => (remaining-- > 0 ? requestAnimationFrame(step) : resolve());
    step();
  });
}

/**
 * Execute an async function while holding the scroll position steady.
 *
 * The position is pinned for the *duration* of the operation rather than restored
 * afterwards. Restoring afterwards left every intermediate render — the editor closing,
 * the list rebuilding, the browser clamping a now-shorter container — to paint at the
 * wrong offset first, which the user saw as a jump down and back before the position
 * snapped right a second later.
 *
 * Pinning yields to a deliberate user scroll and gives up after `PIN_TIMEOUT_MS`, so a
 * slow or failed request cannot leave the view stuck.
 */
export async function withScrollPreservation<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined') {
    return fn();
  }

  const container = getScrollContainer();
  const pin = pinScroll(container, container ? container.scrollTop : window.scrollY);

  try {
    return await fn();
  } finally {
    // Keep holding through React's final commit, then release.
    afterFrames(PIN_HOLD_FRAMES).then(() => pin.cancel());
  }
}
