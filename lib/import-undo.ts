/**
 * Import Undo Utility
 *
 * Manages localStorage state for the "Undo Last Import" feature.
 * Tracks the most recent import batch with a 5-minute undo window.
 */

const STORAGE_KEY = 'puffin_last_import';
const UNDO_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export interface LastImportInfo {
  batchId: string;
  timestamp: number;
  count: number;
  sourceName: string | null;
}

/**
 * Save the last import info to localStorage.
 * Call this after a successful import.
 */
export function saveLastImport(info: LastImportInfo): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(info));
  } catch {
    // localStorage may be full or unavailable
    console.warn('Failed to save last import info to localStorage');
  }
}

/**
 * Get the last import info from localStorage.
 * Returns null if no import is stored or if the undo window has expired.
 */
export function getLastImport(): LastImportInfo | null {
  if (typeof window === 'undefined') return null;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const info = JSON.parse(stored) as LastImportInfo;

    // Check if still within undo window
    const elapsed = Date.now() - info.timestamp;
    if (elapsed > UNDO_WINDOW_MS) {
      // Expired, clear it
      clearLastImport();
      return null;
    }

    return info;
  } catch {
    return null;
  }
}

/**
 * Clear the last import info from localStorage.
 * Call this after undo is performed or when starting a new import.
 */
export function clearLastImport(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore errors
  }
}

/**
 * Get the remaining time (in milliseconds) for the undo window.
 * Returns 0 if expired or no import is stored.
 */
export function getUndoTimeRemaining(): number {
  const info = getLastImport();
  if (!info) return 0;

  const elapsed = Date.now() - info.timestamp;
  const remaining = UNDO_WINDOW_MS - elapsed;
  return Math.max(0, remaining);
}

/**
 * Check if undo is currently available.
 */
export function isUndoAvailable(): boolean {
  return getLastImport() !== null;
}

/**
 * Format the remaining time as a human-readable string (e.g., "4:32").
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return '0:00';

  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
