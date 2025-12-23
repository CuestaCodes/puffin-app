/**
 * Access Token API
 * GET - Get current access token for Google Picker
 */

import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/sync/oauth';

export async function GET() {
  try {
    const client = await getAuthenticatedClient();
    
    if (!client) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const credentials = client.credentials;
    
    if (!credentials.access_token) {
      return NextResponse.json(
        { error: 'No access token available' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      accessToken: credentials.access_token,
    });
  } catch (error) {
    console.error('Failed to get access token:', error);
    return NextResponse.json(
      { error: 'Failed to get access token' },
      { status: 500 }
    );
  }
}

