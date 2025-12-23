/**
 * Google OAuth2 Authentication
 * Handles OAuth2 flow for Google Drive API access
 */

import { google } from 'googleapis';
import { SyncConfigManager } from './config';

// OAuth2 configuration
// These should be set in environment variables
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/sync/oauth/callback';

// Scopes required for Google Drive file access
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file', // Access to files created/opened by the app
  'https://www.googleapis.com/auth/userinfo.email', // Get user's email
];

/**
 * Create an OAuth2 client
 */
export function getOAuth2Client() {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

/**
 * Get the OAuth2 client with stored credentials
 * Returns null if no valid tokens are available
 */
export async function getAuthenticatedClient() {
  const tokens = SyncConfigManager.getTokens();
  if (!tokens) {
    return null;
  }

  const client = getOAuth2Client();
  client.setCredentials(tokens);

  // Check if token needs refresh
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    try {
      const { credentials } = await client.refreshAccessToken();
      SyncConfigManager.saveTokens({
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || tokens.refresh_token,
        expiry_date: credentials.expiry_date!,
        token_type: credentials.token_type || 'Bearer',
        scope: SCOPES.join(' '),
      });
      client.setCredentials(credentials);
    } catch (error) {
      console.error('Failed to refresh token:', error);
      return null;
    }
  }

  return client;
}

/**
 * Generate the OAuth2 authorization URL
 */
export function getAuthUrl(state?: string): string {
  const client = getOAuth2Client();
  
  return client.generateAuthUrl({
    access_type: 'offline', // Get refresh token
    scope: SCOPES,
    prompt: 'consent', // Always show consent screen to get refresh token
    state: state || undefined,
  });
}

/**
 * Handle the OAuth2 callback and exchange code for tokens
 */
export async function handleOAuthCallback(code: string): Promise<{ success: boolean; error?: string; email?: string }> {
  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);
    
    if (!tokens.access_token || !tokens.refresh_token) {
      return { success: false, error: 'Failed to get tokens from Google' };
    }

    // Save tokens
    SyncConfigManager.saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date || Date.now() + 3600 * 1000,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope || SCOPES.join(' '),
    });

    // Set credentials and get user info
    client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email || undefined;

    // Save email to config
    if (email) {
      SyncConfigManager.saveConfig({ userEmail: email });
    }

    return { success: true, email };
  } catch (error) {
    console.error('OAuth callback error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to complete authentication' 
    };
  }
}

/**
 * Check if OAuth is configured (client ID and secret are set)
 */
export function isOAuthConfigured(): boolean {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

/**
 * Revoke the current OAuth tokens
 */
export async function revokeTokens(): Promise<boolean> {
  try {
    const tokens = SyncConfigManager.getTokens();
    if (!tokens) return true;

    const client = getOAuth2Client();
    await client.revokeToken(tokens.access_token);
    return true;
  } catch (error) {
    console.error('Failed to revoke tokens:', error);
    return false;
  }
}

