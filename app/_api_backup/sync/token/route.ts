/**
 * Access Token API
 * GET - Get current access token for Google Picker
 *
 * Security measures:
 * - Origin/Referer header verification (same-origin protection)
 * - Rate limiting to prevent abuse
 * - Audit logging for security monitoring
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/sync/oauth';
import { checkRateLimit, recordAttempt, getClientIp } from '@/lib/auth/rate-limit';

// Rate limit config: 30 requests per minute, 5-minute lockout
const TOKEN_RATE_LIMIT = {
  maxAttempts: 30,
  windowMs: 60 * 1000,      // 1 minute window
  lockoutMs: 5 * 60 * 1000, // 5 minute lockout
};

/**
 * Verify the request is from the same origin.
 * This helps prevent token theft via XSS from other origins.
 */
function verifySameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const host = request.headers.get('host');

  // In development, allow localhost variations
  const isDev = process.env.NODE_ENV === 'development';
  const allowedHosts = isDev
    ? ['localhost', '127.0.0.1', host]
    : [host];

  // Check Origin header (preferred)
  if (origin) {
    try {
      const originUrl = new URL(origin);
      return allowedHosts.some(h => h && originUrl.host.startsWith(h.split(':')[0]));
    } catch {
      return false;
    }
  }

  // Fall back to Referer header
  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return allowedHosts.some(h => h && refererUrl.host.startsWith(h.split(':')[0]));
    } catch {
      return false;
    }
  }

  // If no Origin or Referer header is present:
  // - In development, allow it (for testing with tools like curl)
  // - In production, reject it for stricter security
  return isDev;
}

/**
 * Log token access for security auditing.
 */
function logTokenAccess(clientIp: string, success: boolean, reason?: string): void {
  const timestamp = new Date().toISOString();
  const message = success
    ? `Token access granted`
    : `Token access denied: ${reason}`;

  // Log to console (could be extended to a proper audit log system)
  console.log(`[AUDIT] ${timestamp} | IP: ${clientIp} | ${message}`);
}

export async function GET(request: NextRequest) {
  const clientIp = getClientIp(request.headers);
  const rateLimitKey = `token:${clientIp}`;

  try {
    // Check rate limit
    const rateLimit = checkRateLimit(rateLimitKey, TOKEN_RATE_LIMIT);
    if (!rateLimit.allowed) {
      logTokenAccess(clientIp, false, 'rate limited');
      return NextResponse.json(
        { error: rateLimit.message },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rateLimit.retryAfterMs || 0) / 1000)),
          },
        }
      );
    }

    // Verify same-origin request
    if (!verifySameOrigin(request)) {
      logTokenAccess(clientIp, false, 'cross-origin request blocked');
      return NextResponse.json(
        { error: 'Cross-origin requests not allowed' },
        { status: 403 }
      );
    }

    // Record the attempt (for rate limiting)
    recordAttempt(rateLimitKey);

    const client = await getAuthenticatedClient();

    if (!client) {
      logTokenAccess(clientIp, false, 'not authenticated');
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const credentials = client.credentials;

    if (!credentials.access_token) {
      logTokenAccess(clientIp, false, 'no access token');
      return NextResponse.json(
        { error: 'No access token available' },
        { status: 401 }
      );
    }

    logTokenAccess(clientIp, true);
    return NextResponse.json({
      accessToken: credentials.access_token,
    });
  } catch (error) {
    logTokenAccess(clientIp, false, 'internal error');
    console.error('Failed to get access token:', error);
    return NextResponse.json(
      { error: 'Failed to get access token' },
      { status: 500 }
    );
  }
}



