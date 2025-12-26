/**
 * Google OAuth2 Authentication
 * Handles OAuth2 flow for Google Drive API access
 */

import { google } from 'googleapis';
import { SyncConfigManager } from './config';

// Redirect URI - can be overridden via environment
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/sync/oauth/callback';

// Scope levels for different sync modes
export type ScopeLevel = 'standard' | 'extended';

// Standard scopes: For single-account sync (picker-selected folders only)
const STANDARD_SCOPES = [
  'https://www.googleapis.com/auth/drive.file', // Access to files opened/created by the app
  'https://www.googleapis.com/auth/userinfo.email', // Get user's email
];

// Extended scopes: For multi-account sync (shared files from other accounts)
// WARNING: This grants full read/write access to the user's entire Google Drive
const EXTENDED_SCOPES = [
  'https://www.googleapis.com/auth/drive.file', // Access to files opened/created by the app
  'https://www.googleapis.com/auth/drive', // Full access for shared files
  'https://www.googleapis.com/auth/userinfo.email', // Get user's email
];

/**
 * Get scopes for the specified level
 */
export function getScopes(level: ScopeLevel = 'standard'): string[] {
  return level === 'extended' ? EXTENDED_SCOPES : STANDARD_SCOPES;
}

/**
 * Check if current tokens have extended scope
 * Note: Must check for exact 'drive' scope, not just substring match
 * because 'drive.file' contains 'drive' as substring
 */
export function hasExtendedScope(): boolean {
  const tokens = SyncConfigManager.getTokens();
  if (!tokens?.scope) return false;

  // Split scope string and check for exact 'drive' scope
  // Scopes are space-separated in the token response
  const scopes = tokens.scope.split(' ');
  return scopes.includes('https://www.googleapis.com/auth/drive');
}

/**
 * Get the current credentials (from stored config or environment)
 */
function getCredentials() {
  return SyncConfigManager.getCredentials();
}

/**
 * Create an OAuth2 client
 */
export function getOAuth2Client() {
  const creds = getCredentials();
  const clientId = creds?.clientId || '';
  const clientSecret = creds?.clientSecret || '';
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
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
        scope: tokens.scope, // Preserve original scope
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
 * @param scopeLevel - 'standard' for single-account, 'extended' for multi-account sync
 * @param state - Optional state parameter for OAuth flow
 */
export function getAuthUrl(scopeLevel: ScopeLevel = 'standard', state?: string): string {
  const client = getOAuth2Client();
  const scopes = getScopes(scopeLevel);

  return client.generateAuthUrl({
    access_type: 'offline', // Get refresh token
    scope: scopes,
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

    // Save tokens immediately
    SyncConfigManager.saveTokens({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date || Date.now() + 3600 * 1000,
      token_type: tokens.token_type || 'Bearer',
      scope: tokens.scope || getScopes('standard').join(' '),
    });

    // Fetch user info in background (don't block the redirect)
    client.setCredentials(tokens);
    fetchAndSaveUserEmail(client).catch(err => {
      console.error('Failed to fetch user email:', err);
    });

    return { success: true };
  } catch (error) {
    console.error('OAuth callback error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to complete authentication' 
    };
  }
}

/**
 * Fetch user email in background (non-blocking)
 */
async function fetchAndSaveUserEmail(client: ReturnType<typeof getOAuth2Client>): Promise<void> {
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: client });
    const userInfo = await oauth2.userinfo.get();
    const email = userInfo.data.email;
    if (email) {
      SyncConfigManager.saveConfig({ userEmail: email });
    }
  } catch (error) {
    console.error('Error fetching user email:', error);
  }
}

/**
 * Check if OAuth is configured (client ID and secret are set)
 */
export function isOAuthConfigured(): boolean {
  const creds = getCredentials();
  return !!(creds?.clientId && creds?.clientSecret);
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

