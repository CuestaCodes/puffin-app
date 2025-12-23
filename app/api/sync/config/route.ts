/**
 * Sync Configuration API
 * GET - Get current sync configuration
 * POST - Update sync configuration (folder ID)
 */

import { NextResponse } from 'next/server';
import { SyncConfigManager } from '@/lib/sync/config';
import { isOAuthConfigured } from '@/lib/sync/oauth';

export async function GET() {
  try {
    const config = SyncConfigManager.getConfig();
    const hasTokens = SyncConfigManager.hasTokens();
    const oauthConfigured = isOAuthConfigured();

    return NextResponse.json({
      ...config,
      isAuthenticated: hasTokens,
      oauthConfigured,
    });
  } catch (error) {
    console.error('Failed to get sync config:', error);
    return NextResponse.json(
      { error: 'Failed to get sync configuration' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { folderId, folderName } = body;

    if (folderId !== undefined) {
      SyncConfigManager.saveConfig({ 
        folderId: folderId || null,
        folderName: folderName || null,
      });
    }

    const config = SyncConfigManager.getConfig();
    return NextResponse.json(config);
  } catch (error) {
    console.error('Failed to update sync config:', error);
    return NextResponse.json(
      { error: 'Failed to update sync configuration' },
      { status: 500 }
    );
  }
}

