/**
 * Sync layer error types — shared between the Next.js OAuth path
 * (lib/sync/oauth.ts) and the Tauri sync handler (lib/services/handlers/sync.ts).
 *
 * Kept in a runtime-neutral module so both code paths can import the same class
 * and `instanceof` checks work consistently across boundaries.
 */

/**
 * Thrown when refreshing the access token fails because Google rejected the
 * refresh token (invalid_grant) — typically because the token has been revoked
 * or expired beyond the 7-day window for OAuth apps in Testing publishing mode.
 *
 * Callers should catch this and trigger a re-auth flow rather than wiping the
 * user's sync configuration.
 */
export class OAuthRefreshFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthRefreshFailedError';
  }
}
