/**
 * OAuth Callback API
 * GET - Handle OAuth callback from Google
 */

import { NextResponse } from 'next/server';
import { handleOAuthCallback } from '@/lib/sync/oauth';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      // Redirect to settings with error
      return NextResponse.redirect(
        new URL(`/?page=settings&sync_error=${encodeURIComponent(error)}`, url.origin)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL('/?page=settings&sync_error=no_code', url.origin)
      );
    }

    const result = await handleOAuthCallback(code);

    if (result.success) {
      // Redirect to settings with success
      return NextResponse.redirect(
        new URL('/?page=settings&sync_auth=success', url.origin)
      );
    } else {
      return NextResponse.redirect(
        new URL(`/?page=settings&sync_error=${encodeURIComponent(result.error || 'unknown')}`, url.origin)
      );
    }
  } catch (error) {
    console.error('OAuth callback error:', error);
    const url = new URL(request.url);
    return NextResponse.redirect(
      new URL('/?page=settings&sync_error=callback_failed', url.origin)
    );
  }
}

