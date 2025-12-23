/**
 * OAuth URL API
 * GET - Generate OAuth authorization URL
 */

import { NextResponse } from 'next/server';
import { getAuthUrl, isOAuthConfigured } from '@/lib/sync/oauth';

export async function GET() {
  try {
    if (!isOAuthConfigured()) {
      return NextResponse.json(
        { error: 'OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.' },
        { status: 503 }
      );
    }

    const url = getAuthUrl();
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Failed to generate OAuth URL:', error);
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 }
    );
  }
}

