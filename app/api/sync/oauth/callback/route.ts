/**
 * OAuth Callback API
 * GET - Handle OAuth callback from Google
 */

import { NextResponse } from 'next/server';
import { handleOAuthCallback } from '@/lib/sync/oauth';

/**
 * Get the proper redirect origin (handle 0.0.0.0 binding)
 */
function getRedirectOrigin(url: URL): string {
  // If bound to 0.0.0.0, use localhost instead
  if (url.hostname === '0.0.0.0') {
    return `${url.protocol}//localhost:${url.port}`;
  }
  return url.origin;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const origin = getRedirectOrigin(url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      // Redirect to settings with error
      return NextResponse.redirect(
        new URL(`/?page=settings&sync_error=${encodeURIComponent(error)}`, origin)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/?page=settings&sync_error=no_code', origin)
      );
    }

    // Pass state parameter to preserve scope level for fallback
    const state = url.searchParams.get('state');
    const result = await handleOAuthCallback(code, state);

    if (result.success) {
      // Redirect to settings with success
      return NextResponse.redirect(
        new URL('/?page=settings&sync_auth=success', origin)
      );
    } else {
      return NextResponse.redirect(
        new URL(`/?page=settings&sync_error=${encodeURIComponent(result.error || 'unknown')}`, origin)
      );
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    const url = new URL(request.url);
    const origin = getRedirectOrigin(url);
    return NextResponse.redirect(
      new URL('/?page=settings&sync_error=callback_failed', origin)
    );
  }
}

