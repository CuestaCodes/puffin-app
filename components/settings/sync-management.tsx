'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, isTauriContext } from '@/lib/services';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Cloud, CloudUpload, CloudDownload, Check,
  Loader2, AlertTriangle, LogOut,
  FolderSync, CheckCircle2, Info, Settings2, FileIcon, Users, Shield, Copy
} from 'lucide-react';
import { toast } from 'sonner';
import type { SyncConfig } from '@/types/sync';
import { SyncTargetPicker } from './sync-target-picker';
import { CredentialsSetup } from './credentials-setup';

interface SyncManagementProps {
  onBack: () => void;
}

interface ExtendedSyncConfig extends SyncConfig {
  isAuthenticated: boolean;
  oauthConfigured: boolean;
  hasExtendedScope: boolean;
}

export function SyncManagement({ onBack }: SyncManagementProps) {
  // Configuration state
  const [config, setConfig] = useState<ExtendedSyncConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Sync operation state
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Dialogs
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [showPullWarningDialog, setShowPullWarningDialog] = useState(false);
  const [showMultiAccountWarning, setShowMultiAccountWarning] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [showCredentialsSetup, setShowCredentialsSetup] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const configResult = await api.get<ExtendedSyncConfig>('/api/sync/config');

      if (configResult.data) {
        setConfig(configResult.data);
      }
    } catch (err) {
      console.error('Failed to fetch sync config:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Called by SyncTargetPicker once a folder or file is connected
  const handleTargetConnected = useCallback((message: string, warning?: string) => {
    // A warning must outlast a glance, so it holds the toast open longer
    toast.success(message, warning ? { description: warning, duration: 15000 } : undefined);
    fetchConfig();
  }, [fetchConfig]);

  const handleTargetError = useCallback((message: string) => {
    toast.error(message);
  }, []);

  // Track if OAuth is in progress
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  // The sign-in URL start_oauth_flow gave the default browser. Shown while the
  // flow is waiting, because the hand-off fails silently when that browser has
  // no signed-in Google session - and the app cannot display Google's page itself.
  const [signInUrl, setSignInUrl] = useState<string | null>(null);
  const [copiedSignInUrl, setCopiedSignInUrl] = useState(false);

  useEffect(() => {
    if (!isTauriContext()) return;
    let unlisten: (() => void) | undefined;

    import('@tauri-apps/api/event')
      .then(({ listen }) => listen<string>('oauth-sign-in-url', (event) => {
        setSignInUrl(event.payload);
        setCopiedSignInUrl(false);
      }))
      .then((fn) => { unlisten = fn; })
      .catch(() => { /* event plugin unavailable; the browser hand-off still works */ });

    return () => unlisten?.();
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Handle OAuth authentication (standard scope for single-account)
  const handleAuthenticate = async () => {
    await startOAuthFlow('standard');
  };

  // Auto-trigger Sign in with Google when arriving here via the Reconnect modal.
  // The modal sets sessionStorage 'puffin_action_reauth' before navigating;
  // we fire OAuth once config is loaded (so credentials are available) and
  // never refire even if config refetches.
  // Restore the prior scope level so users syncing a backup file (extended
  // scope) aren't silently downgraded to standard scope and locked out of
  // their file. `puffin_oauth_extended_scope` persists across token expiry.
  const reauthFiredRef = useRef(false);
  useEffect(() => {
    if (isLoading || reauthFiredRef.current) return;
    let shouldFire = false;
    try {
      shouldFire = sessionStorage.getItem('puffin_action_reauth') === '1';
      if (shouldFire) sessionStorage.removeItem('puffin_action_reauth');
    } catch {
      return;
    }
    if (shouldFire) {
      reauthFiredRef.current = true;
      const scopeLevel = config?.hasExtendedScope ? 'extended' : 'standard';
      startOAuthFlow(scopeLevel);
    }
    // Intentionally omit `startOAuthFlow` from deps: it's redefined every
    // render (not memoised), so listing it would re-fire this effect on each
    // render. The reauthFiredRef guard ensures OAuth only fires once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, config?.hasExtendedScope]);

  // Start OAuth flow - handles both Tauri and dev modes
  const startOAuthFlow = async (scopeLevel: 'standard' | 'extended') => {
    // A link from an earlier attempt points at a callback server that is gone
    setSignInUrl(null);

    // In Tauri mode, use the native OAuth flow with local callback server
    // Check for both __TAURI__ (Tauri 1.x) and __TAURI_INTERNALS__ (Tauri 2.x)
    const isTauri = typeof window !== 'undefined' &&
      (window.__TAURI__ || window.__TAURI_INTERNALS__);

    if (isTauri) {
      try {
        setIsAuthenticating(true);

        // Get credentials from localStorage
        const stored = localStorage.getItem('puffin_sync_credentials');
        if (!stored) {
          toast.error('OAuth credentials not found. Please configure your Google Cloud credentials first.');
          return;
        }

        const creds = JSON.parse(stored);
        const scopes = scopeLevel === 'extended'
          ? 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email'
          : 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

        const stateData = JSON.stringify({ scopeLevel });
        const state = btoa(stateData);

        // Call the Tauri command to start OAuth flow
        const { invoke } = await import('@tauri-apps/api/core');
        const result = await invoke<{ code?: string; state?: string; error?: string; redirect_uri?: string }>('start_oauth_flow', {
          authUrlBase: 'https://accounts.google.com/o/oauth2/v2/auth',
          clientId: creds.clientId,
          scope: scopes,
          state,
        });

        if (result.error) {
          toast.error(`Authentication failed: ${result.error}`);
          return;
        }

        if (!result.code) {
          toast.error('No authorization code received');
          return;
        }

        // Exchange the code for tokens
        const tokenResult = await api.post<{ success: boolean; error?: string }>('/api/sync/oauth/token', {
          code: result.code,
          state: result.state,
          redirectUri: result.redirect_uri,
        });

        if (tokenResult.data?.success) {
          toast.success('Successfully connected to Google');
          fetchConfig();
        } else {
          toast.error(tokenResult.error || 'Failed to complete authentication');
        }
      } catch (err) {
        console.error('OAuth error:', err);
        toast.error(`Authentication failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      } finally {
        setIsAuthenticating(false);
      }
    } else {
      // In dev mode, use the API route which redirects
      try {
        const result = await api.get<{ url: string }>(`/api/sync/oauth/url?scopeLevel=${scopeLevel}`);
        if (result.data?.url) {
          window.location.href = result.data.url;
        } else {
          toast.error(result.error || 'Failed to start authentication');
        }
      } catch (err) {
        console.error('Auth error:', err);
        toast.error('Failed to start authentication');
      }
    }
  };

  // Handle extended scope authentication (for multi-account sync)
  const handleExtendedAuth = async () => {
    setShowMultiAccountWarning(false);
    await startOAuthFlow('extended');
  };

  // Validate folder
  // Push (upload) database
  const handlePush = async () => {
    setIsSyncing(true);

    try {
      const result = await api.post<{ success: boolean; error?: string }>('/api/sync/push', {});

      if (result.data?.success) {
        toast.success('Database uploaded successfully');
        fetchConfig();
      } else {
        toast.error(result.data?.error || result.error || 'Failed to upload database');
      }
    } catch (err) {
      console.error('Push error:', err);
      toast.error('Failed to upload database');
    } finally {
      setIsSyncing(false);
    }
  };

  // Pull (download) database
  const handlePull = async () => {
    setShowPullWarningDialog(false);
    setIsSyncing(true);

    try {
      const result = await api.post<{ success: boolean; error?: string }>('/api/sync/pull', {});

      if (result.data?.success) {
        toast.success('Database downloaded successfully. Please refresh the page to see updated data.');
        fetchConfig();
      } else {
        toast.error(result.data?.error || result.error || 'Failed to download database');
      }
    } catch (err) {
      console.error('Pull error:', err);
      toast.error('Failed to download database');
    } finally {
      setIsSyncing(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    setIsDisconnecting(true);

    try {
      const result = await api.post<{ success: boolean }>('/api/sync/disconnect', {});

      if (result.data?.success) {
        setShowDisconnectDialog(false);
        setConfig({
          folderId: null,
          folderName: null,
          isConfigured: false,
          lastSyncedAt: null,
          userEmail: null,
          syncedDbHash: null,
          backupFileId: null,
          isFileBasedSync: false,
          isAuthenticated: false,
          oauthConfigured: config?.oauthConfigured ?? false,
          hasExtendedScope: false,
        });
        toast.success('Disconnected from Google Drive');
      } else {
        toast.error(result.error || 'Failed to disconnect');
      }
    } catch (err) {
      console.error('Disconnect error:', err);
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Format relative time
  const formatLastSynced = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };

  // Offered wherever a sign-in is waiting on the browser - the first sign-in
  // and the full-access upgrade alike
  const signInLinkHelp = isAuthenticating && signInUrl && (
    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 space-y-2">
      <p className="text-xs text-slate-400">
        Waiting for Google in your browser. If nothing opened, or you are signed into a
        different account there, copy this link and open it in the right browser.
      </p>
      <Button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(signInUrl);
            setCopiedSignInUrl(true);
            // Revert, so the button does not read as used up
            setTimeout(() => setCopiedSignInUrl(false), 2000);
          } catch {
            toast.error('Could not copy the link to the clipboard');
          }
        }}
        variant="outline"
        size="sm"
        className="border-slate-700 text-slate-300 hover:bg-slate-800"
      >
        {copiedSignInUrl ? (
          <Check className="w-4 h-4 mr-2 text-emerald-400" />
        ) : (
          <Copy className="w-4 h-4 mr-2" />
        )}
        {copiedSignInUrl ? 'Link copied' : 'Copy sign-in link'}
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Go back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">Cloud Sync</h1>
            <p className="text-slate-400 mt-1">Loading...</p>
          </div>
        </div>
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // OAuth not configured state - show setup wizard
  if (!config?.oauthConfigured) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-400 hover:text-white" aria-label="Go back">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">Cloud Sync</h1>
            <p className="text-slate-400 mt-1">Backup your data to Google Drive</p>
          </div>
        </div>

        <CredentialsSetup 
          onComplete={() => {
            // Refetch config after credentials are saved
            fetchConfig();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-400 hover:text-white" aria-label="Go back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-white">Cloud Sync</h1>
          <p className="text-slate-400 mt-1">Backup your data to Google Drive</p>
        </div>
      </div>

      {/* Turbo/Dev Mode Notice - only show in development */}
      {process.env.NODE_ENV === 'development' && (
        <div className="rounded-lg bg-slate-800/50 border border-slate-700 p-3 flex items-start gap-2">
          <Info className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-400">
            <strong className="text-slate-300">Note:</strong> Due to Turbo bundling, Google authentication pages may occasionally hang.
            If this happens, refresh the page and try again.
          </p>
        </div>
      )}

      {/* Not authenticated state */}
      {!config?.isAuthenticated && (
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/50">
                <Cloud className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-100">Connect to Google Drive</CardTitle>
                <CardDescription className="text-slate-400">
                  Sign in with your Google account to enable cloud backup
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              onClick={handleAuthenticate}
              disabled={isAuthenticating}
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              {isAuthenticating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4 mr-2" />
              )}
              {isAuthenticating ? 'Authenticating...' : 'Sign in with Google'}
            </Button>

            {signInLinkHelp && <div className="mt-3">{signInLinkHelp}</div>}
          </CardContent>
        </Card>
      )}

      {/* Authenticated but not configured state */}
      {config?.isAuthenticated && !config?.isConfigured && (
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/50">
                <FolderSync className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-100">Select Sync Folder</CardTitle>
                <CardDescription className="text-slate-400">
                  {config.userEmail && (
                    <span className="block text-emerald-400 mb-1">
                      <Check className="w-3 h-3 inline mr-1" />
                      Signed in as {config.userEmail}
                    </span>
                  )}
                  Choose a Google Drive folder for your backups
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <SyncTargetPicker
              hasExtendedScope={!!config.hasExtendedScope}
              onGrantFullAccess={() => setShowMultiAccountWarning(true)}
              onConnected={handleTargetConnected}
              onError={handleTargetError}
              signInHelp={signInLinkHelp}
              disabled={isAuthenticating}
            />

            {/* What Puffin can actually see, which depends on the scope granted */}
            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-400">
                  <strong className="text-emerald-400">Secure:</strong>{' '}
                  {config.hasExtendedScope
                    ? 'You have granted full Drive access, so Puffin can see your whole Drive. Only the sync folder is written to.'
                    : 'Puffin can only see the folder it creates — not the rest of your Google Drive.'}
                </p>
              </div>
            </div>

            {/* Sign out option */}
            <div className="border-t border-slate-700/50 pt-4">
              <Button
                onClick={() => setShowDisconnectDialog(true)}
                variant="ghost"
                size="sm"
                className="text-slate-500 hover:text-red-400"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign out of Google
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fully configured state */}
      {config?.isConfigured && (
        <>
          {/* Sync status card */}
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/50">
                    {config.isFileBasedSync ? (
                      <Users className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <Cloud className="w-6 h-6 text-emerald-400" />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-lg text-slate-100">
                      {config.isFileBasedSync ? 'Multi-Account Sync' : 'Sync Connected'}
                    </CardTitle>
                    <CardDescription className="text-slate-400">
                      {config.userEmail && <span className="text-emerald-400">{config.userEmail}</span>}
                      {config.userEmail && config.folderName && ' • '}
                      {config.folderName && (
                        <span>
                          {config.isFileBasedSync ? (
                            <><FileIcon className="w-3 h-3 inline mr-1" />{config.folderName}</>
                          ) : (
                            config.folderName
                          )}
                        </span>
                      )}
                    </CardDescription>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Last synced</p>
                  <p className="text-sm text-slate-300">{formatLastSynced(config.lastSyncedAt)}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Sync actions */}
              <div className="flex gap-3">
                <Button
                  onClick={handlePush}
                  disabled={isSyncing}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500"
                >
                  {isSyncing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CloudUpload className="w-4 h-4 mr-2" />
                  )}
                  Upload to Cloud
                </Button>
                <Button
                  onClick={() => setShowPullWarningDialog(true)}
                  disabled={isSyncing}
                  variant="outline"
                  className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  {isSyncing ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CloudDownload className="w-4 h-4 mr-2" />
                  )}
                  Download from Cloud
                </Button>
              </div>

              <p className="text-xs text-slate-500 text-center">
                A local backup is created automatically before each sync operation.
              </p>
            </CardContent>
          </Card>

          {/* Disconnect section */}
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader>
              <CardTitle className="text-lg text-slate-100">Disconnect Sync</CardTitle>
              <CardDescription className="text-slate-400">
                Remove the connection to Google Drive. Your local data will not be affected.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => setShowDisconnectDialog(true)}
                variant="outline"
                className="border-red-900/50 text-red-400 hover:bg-red-950/30 hover:text-red-300"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Disconnect
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Change sync source section (when configured) */}
      {config?.isConfigured && (
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">
              {config.isFileBasedSync ? 'Change Sync File' : 'Change Sync Folder'}
            </CardTitle>
            <CardDescription className="text-slate-400">
              {config.isFileBasedSync
                ? 'Switch to a different backup file or folder'
                : 'Switch to a different Google Drive folder'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <SyncTargetPicker
              hasExtendedScope={!!config.hasExtendedScope}
              onGrantFullAccess={() => setShowMultiAccountWarning(true)}
              onConnected={handleTargetConnected}
              onError={handleTargetError}
              signInHelp={signInLinkHelp}
              disabled={isAuthenticating}
            />
          </CardContent>
        </Card>
      )}

      {/* Reconfigure credentials section (when configured) */}
      {config?.oauthConfigured && (
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Google Cloud Credentials</CardTitle>
            <CardDescription className="text-slate-400">
              Update your OAuth credentials if needed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => setShowCredentialsSetup(true)}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <Settings2 className="w-4 h-4 mr-2" />
              Reconfigure Credentials
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Credentials Setup Dialog */}
      {showCredentialsSetup && (
        <CredentialsSetup
          isDialog
          onComplete={() => {
            setShowCredentialsSetup(false);
            fetchConfig();
          }}
          onCancel={() => setShowCredentialsSetup(false)}
        />
      )}

      {/* Pull Warning Dialog */}
      <Dialog open={showPullWarningDialog} onOpenChange={setShowPullWarningDialog}>
        <DialogContent className="sm:max-w-[450px] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Replace Local Data?
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Downloading from the cloud will <strong className="text-slate-200">replace all your local data</strong> with 
              the backup stored in Google Drive.
              <br /><br />
              A backup of your current local data will be created before downloading.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPullWarningDialog(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handlePull}
              className="bg-amber-600 hover:bg-amber-500"
            >
              <CloudDownload className="w-4 h-4 mr-2" />
              Download & Replace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect Confirmation Dialog */}
      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent className="sm:max-w-[400px] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <LogOut className="w-5 h-5 text-red-400" />
              Disconnect Sync?
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              This will remove the connection to Google Drive. Your local data and cloud backup
              will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDisconnectDialog(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              variant="destructive"
              className="bg-red-600 hover:bg-red-500"
            >
              {isDisconnecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Multi-Account Sync Warning Dialog */}
      <Dialog open={showMultiAccountWarning} onOpenChange={setShowMultiAccountWarning}>
        <DialogContent className="sm:max-w-[500px] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-400" />
              Extended Permissions Required
            </DialogTitle>
            <DialogDescription asChild>
              <div className="text-slate-400 space-y-3">
                <p>
                  Multi-account sync requires <strong className="text-slate-200">full Google Drive access</strong> to
                  read and write files shared from other accounts.
                </p>

                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                  <p className="text-sm text-amber-300 font-medium mb-2">Security Implications:</p>
                  <ul className="text-xs text-amber-200/80 space-y-1 list-disc list-inside">
                    <li>The app will have read/write access to your entire Google Drive</li>
                    <li>If your local tokens are compromised, an attacker could access all your Drive files</li>
                    <li>Tokens are stored locally and encrypted, but this is still a broader permission</li>
                  </ul>
                </div>

                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
                  <p className="text-sm text-slate-300 font-medium mb-2">Alternative: Single-Account Sync</p>
                  <p className="text-xs text-slate-400">
                    If you use the same Google account on all computers, &quot;Create a folder in your
                    Drive&quot; needs no extra permission — Puffin can only see the folder it made.
                  </p>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowMultiAccountWarning(false)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleExtendedAuth}
              className="bg-amber-600 hover:bg-amber-500"
            >
              <Shield className="w-4 h-4 mr-2" />
              Grant Extended Access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

