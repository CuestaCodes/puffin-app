/**
 * Sync Credentials API
 * GET - Get client ID and API key for Google Picker (public, non-sensitive)
 */

import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const apiKey = process.env.GOOGLE_API_KEY || '';

  return NextResponse.json({
    clientId,
    apiKey,
    configured: !!(clientId && apiKey),
  });
}

