// @vitest-environment jsdom
//
// jsdom rather than the project-wide `node` environment: these helpers exist to encode
// an assumption about the app's DOM shape, and that assumption being wrong is exactly
// what made scroll preservation silently inert at all eight of its call sites.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getScrollContainer, formatDateYMD, sanitizePinInput } from './utils';

/**
 * jsdom does not do layout, so every element reports scrollHeight/clientHeight as 0.
 * Define them explicitly to model an element that overflows (or doesn't).
 */
function makeMain({ scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  const main = document.createElement('main');
  Object.defineProperty(main, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(main, 'clientHeight', { value: clientHeight, configurable: true });
  document.body.appendChild(main);
  return main;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getScrollContainer', () => {
  it('resolves <main> when it overflows', () => {
    // The real app shell: an h-screen wrapper with <main class="overflow-auto">, so
    // <main> is the scroller and the window never moves.
    const main = makeMain({ scrollHeight: 2000, clientHeight: 800 });
    expect(getScrollContainer()).toBe(main);
  });

  it('returns null when <main> fits, since there is nothing to scroll', () => {
    makeMain({ scrollHeight: 800, clientHeight: 800 });
    expect(getScrollContainer()).toBeNull();
  });

  it('returns null when <main> is shorter than its viewport', () => {
    makeMain({ scrollHeight: 400, clientHeight: 800 });
    expect(getScrollContainer()).toBeNull();
  });

  it('returns null when there is no <main> at all', () => {
    document.body.appendChild(document.createElement('div'));
    expect(getScrollContainer()).toBeNull();
  });

  it('picks the first <main> when the document somehow has more than one', () => {
    const first = makeMain({ scrollHeight: 2000, clientHeight: 800 });
    makeMain({ scrollHeight: 3000, clientHeight: 800 });
    expect(getScrollContainer()).toBe(first);
  });

  it('never resolves the window, which does not scroll in this app', () => {
    // Guards the original bug: the helper read window.scrollY and called
    // window.scrollTo, which are a no-op here, so it did nothing for its entire life.
    const main = makeMain({ scrollHeight: 2000, clientHeight: 800 });
    const container = getScrollContainer();
    expect(container).not.toBe(window);
    expect(container).toBe(main);
  });
});

describe('sanitizePinInput', () => {
  it('strips non-digits', () => {
    expect(sanitizePinInput('12a3b4')).toBe('1234');
  });

  it('caps at six digits', () => {
    expect(sanitizePinInput('1234567890')).toBe('123456');
  });

  it('returns an empty string when nothing survives', () => {
    expect(sanitizePinInput('abc')).toBe('');
  });
});

describe('formatDateYMD', () => {
  it('pads month and day', () => {
    expect(formatDateYMD(2026, 1, 5)).toBe('2026-01-05');
  });

  it('leaves two-digit components alone', () => {
    expect(formatDateYMD(2026, 12, 31)).toBe('2026-12-31');
  });
});
