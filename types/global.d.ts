/**
 * Global type declarations
 */

declare global {
  interface Window {
    /**
     * Indicates we're running in a Tauri 1.x desktop environment.
     * Present when the app is packaged with Tauri 1.x, undefined in browser/dev mode.
     */
    __TAURI__?: {
      /** Tauri version */
      version: string;
    };
    /**
     * Indicates we're running in a Tauri 2.x desktop environment.
     * Present when the app is packaged with Tauri 2.x, undefined in browser/dev mode.
     */
    __TAURI_INTERNALS__?: unknown;
  }
}

export {};
