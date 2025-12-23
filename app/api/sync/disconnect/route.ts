/**
 * Sync Disconnect API
 * POST - Disconnect sync and clear all configuration
 */

import { NextResponse } from 'next/server';
import { SyncConfigManager } from '@/lib/sync/config';
import { revokeTokens } from '@/lib/sync/oauth';

export async function POST() {
  try {
    // Try to revoke tokens (non-blocking, we'll clear config regardless)
    await revokeTokens().catch(console.error);

    // Clear all sync configuration and tokens
    SyncConfigManager.clearConfig();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to disconnect sync' },
      { status: 500 }
    );
  }
}

