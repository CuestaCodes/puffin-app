/**
 * OAuth URL API
 * GET - Generate OAuth authorization URL
 * Query params:
 *   - scopeLevel: 'standard' (default) or 'extended' (for multi-account sync)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl, isOAuthConfigured, type ScopeLevel } from '@/lib/sync/oauth';

export async function GET(request: NextRequest) {
  try {
    if (!isOAuthConfigured()) {
      return NextResponse.json(
        { error: 'OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.' },
        { status: 503 }
      );
    }

    const { searchParams } = new URL(request.url);
    const scopeLevel = (searchParams.get('scopeLevel') as ScopeLevel) || 'standard';

    const url = getAuthUrl(scopeLevel);
    return NextResponse.json({ url, scopeLevel });
  } catch (error) {
    console.error('Failed to generate OAuth URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    );
  }
}



