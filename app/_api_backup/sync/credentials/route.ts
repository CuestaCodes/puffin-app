/**
 * Sync Credentials API
 * GET - Get client ID and API key for Google Picker (public, non-sensitive)
 * POST - Save new credentials (first-run setup)
 */

import { NextResponse } from 'next/server';
import { SyncConfigManager } from '@/lib/sync/config';

export async function GET() {
  const creds = SyncConfigManager.getCredentials();

  return NextResponse.json({
    clientId: creds?.clientId || '',
    apiKey: creds?.apiKey || '',
    configured: !!(creds?.clientId && creds?.clientSecret),
    hasApiKey: !!creds?.apiKey,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { clientId, clientSecret, apiKey } = body;

    // Validate required fields
    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Client ID and Client Secret are required' },
        { status: 400 }
      );
    }

    // Basic format validation
    if (!clientId.includes('.apps.googleusercontent.com')) {
      return NextResponse.json(
        { error: 'Invalid Client ID format. It should end with .apps.googleusercontent.com' },
        { status: 400 }
      );
    }

    // Save credentials (encrypted)
    SyncConfigManager.saveCredentials({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      apiKey: (apiKey || '').trim(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to save credentials:', error);
    return NextResponse.json(
      { error: 'Failed to save credentials' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    SyncConfigManager.clearCredentials();
    SyncConfigManager.clearConfig();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to clear credentials:', error);
    return NextResponse.json(
      { error: 'Failed to clear credentials' },
      { status: 500 }
    );
  }
}

