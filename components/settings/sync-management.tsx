'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  ArrowLeft, Cloud, CloudUpload, CloudDownload, Check, X, 
  Loader2, AlertTriangle, LogOut, RefreshCw, ExternalLink,
  FolderSync, CheckCircle2, Info, FolderOpen, ChevronDown
} from 'lucide-react';
import type { SyncConfig } from '@/types/sync';
import { useGooglePicker } from '@/hooks/use-google-picker';

interface SyncManagementProps {
  onBack: () => void;
}

interface ExtendedSyncConfig extends SyncConfig {
  isAuthenticated: boolean;
  oauthConfigured: boolean;
}

interface PickerCredentials {
  clientId: string;
  apiKey: string;
  configured: boolean;
}

export function SyncManagement({ onBack }: SyncManagementProps) {
  // Configuration state
  const [config, setConfig] = useState<ExtendedSyncConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [credentials, setCredentials] = useState<PickerCredentials | null>(null);
  
  // Folder setup state
  const [folderUrl, setFolderUrl] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);
  const [showManualInput, setShowManualInput] = useState(false);
  
  // Sync operation state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  
  // Dialogs
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [showPullWarningDialog, setShowPullWarningDialog] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      const [configRes, credRes] = await Promise.all([
        fetch('/api/sync/config'),
        fetch('/api/sync/credentials'),
      ]);
      
      if (configRes.ok) {
        const data = await configRes.json();
        setConfig(data);
      }
      
      if (credRes.ok) {
        const cred = await credRes.json();
        setCredentials(cred);
      }
    } catch (err) {
      console.error('Failed to fetch sync config:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle folder selected via picker
  const handlePickerSelect = useCallback(async (folder: { id: string; name: string }) => {
    setIsValidating(true);
    setValidationError(null);
    setValidationSuccess(null);

    try {
      // Save the folder directly (picker already grants access)
      const response = await fetch('/api/sync/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folder.id, folderName: folder.name }),
      });

      if (response.ok) {
        setValidationSuccess(`Connected to folder: ${folder.name}`);
        fetchConfig();
      } else {
        setValidationError('Failed to save folder configuration');
      }
    } catch (err) {
      console.error('Picker save error:', err);
      setValidationError('Failed to save folder configuration');
    } finally {
      setIsValidating(false);
    }
  }, [fetchConfig]);

  // Google Picker hook
  const { openPicker, isLoading: isPickerLoading } = useGooglePicker({
    clientId: credentials?.clientId || '',
    apiKey: credentials?.apiKey || '',
    onSelect: handlePickerSelect,
    onError: (error) => setValidationError(error),
  });

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  // Handle OAuth authentication
  const handleAuthenticate = async () => {
    try {
      const response = await fetch('/api/sync/oauth/url');
      if (response.ok) {
        const data = await response.json();
        window.location.href = data.url;
      } else {
        const error = await response.json();
        setValidationError(error.error || 'Failed to start authentication');
      }
    } catch (err) {
      console.error('Auth error:', err);
      setValidationError('Failed to start authentication');
    }
  };

  // Validate folder
  const handleValidateFolder = async () => {
    console.log('[Validate] Button clicked, URL:', folderUrl);
    
    if (!folderUrl.trim()) {
      setValidationError('Please enter a Google Drive folder URL');
      return;
    }

    setIsValidating(true);
    setValidationError(null);
    setValidationSuccess(null);

    try {
      console.log('[Validate] Sending POST to /api/sync/validate...');
      const response = await fetch('/api/sync/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderUrl: folderUrl.trim() }),
      });

      console.log('[Validate] Response status:', response.status);
      const result = await response.json();
      console.log('[Validate] Result:', result);

      if (result.success) {
        setValidationSuccess(`Connected to folder: ${result.folderName}`);
        setFolderUrl('');
        fetchConfig();
      } else {
        setValidationError(result.error || 'Failed to validate folder');
      }
    } catch (err) {
      console.error('[Validate] Error:', err);
      setValidationError('Failed to validate folder');
    } finally {
      setIsValidating(false);
    }
  };

  // Push (upload) database
  const handlePush = async () => {
    setIsSyncing(true);
    setSyncError(null);
    setSyncSuccess(null);

    try {
      const response = await fetch('/api/sync/push', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        setSyncSuccess('Database uploaded successfully');
        fetchConfig();
      } else {
        setSyncError(result.error || 'Failed to upload database');
      }
    } catch (err) {
      console.error('Push error:', err);
      setSyncError('Failed to upload database');
    } finally {
      setIsSyncing(false);
    }
  };

  // Pull (download) database
  const handlePull = async () => {
    setShowPullWarningDialog(false);
    setIsSyncing(true);
    setSyncError(null);
    setSyncSuccess(null);

    try {
      const response = await fetch('/api/sync/pull', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        setSyncSuccess('Database downloaded successfully. Please refresh the page to see updated data.');
        fetchConfig();
      } else {
        setSyncError(result.error || 'Failed to download database');
      }
    } catch (err) {
      console.error('Pull error:', err);
      setSyncError('Failed to download database');
    } finally {
      setIsSyncing(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    setIsDisconnecting(true);

    try {
      const response = await fetch('/api/sync/disconnect', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        setShowDisconnectDialog(false);
        setConfig({
          folderId: null,
          folderName: null,
          isConfigured: false,
          lastSyncedAt: null,
          userEmail: null,
          isAuthenticated: false,
          oauthConfigured: config?.oauthConfigured ?? false,
        });
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

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
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

  // OAuth not configured state
  if (!config?.oauthConfigured) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">Cloud Sync</h1>
            <p className="text-slate-400 mt-1">Backup your data to Google Drive</p>
          </div>
        </div>

        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-amber-400" />
            <h3 className="text-lg font-semibold text-slate-100 mb-2">OAuth Not Configured</h3>
            <p className="text-slate-400 max-w-md mx-auto">
              Google Drive sync requires OAuth credentials. Please set the following environment variables:
            </p>
            <div className="mt-4 p-4 bg-slate-800/50 rounded-lg text-left max-w-md mx-auto">
              <code className="text-sm text-cyan-400">
                GOOGLE_CLIENT_ID=your_client_id<br />
                GOOGLE_CLIENT_SECRET=your_client_secret<br />
                GOOGLE_API_KEY=your_api_key<br />
                GOOGLE_REDIRECT_URI=http://localhost:3000/api/sync/oauth/callback
              </code>
            </div>
            <p className="text-slate-500 text-sm mt-4">
              Get credentials from the{' '}
              <a 
                href="https://console.cloud.google.com/apis/credentials" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-cyan-400 hover:underline"
              >
                Google Cloud Console
                <ExternalLink className="w-3 h-3 inline ml-1" />
              </a>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-slate-400 hover:text-white">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-white">Cloud Sync</h1>
          <p className="text-slate-400 mt-1">Backup your data to Google Drive</p>
        </div>
      </div>

      {/* Success/Error Messages */}
      {(validationSuccess || syncSuccess) && (
        <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/50 p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <p className="text-sm text-emerald-300">{validationSuccess || syncSuccess}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setValidationSuccess(null); setSyncSuccess(null); }}
            className="ml-auto text-emerald-400 hover:text-emerald-300"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {(validationError || syncError) && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/50 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-300">{validationError || syncError}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setValidationError(null); setSyncError(null); }}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </Button>
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
              className="bg-emerald-600 hover:bg-emerald-500"
            >
              <Cloud className="w-4 h-4 mr-2" />
              Sign in with Google
            </Button>
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
            {/* Primary: Google Picker */}
            {credentials?.apiKey ? (
              <Button
                onClick={openPicker}
                disabled={isPickerLoading || isValidating}
                className="w-full bg-emerald-600 hover:bg-emerald-500"
                size="lg"
              >
                {isPickerLoading || isValidating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FolderOpen className="w-4 h-4 mr-2" />
                )}
                Choose Folder from Google Drive
              </Button>
            ) : (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-sm text-amber-300">
                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                  Google Picker requires an API Key. Add <code className="bg-slate-800 px-1 rounded">GOOGLE_API_KEY</code> to your environment.
                </p>
              </div>
            )}

            {/* Security note */}
            <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-slate-400">
                  <strong className="text-emerald-400">Secure:</strong> The app only has access to the folder you select—not your entire Google Drive.
                  You can share this folder with other users for multi-device sync.
                </p>
              </div>
            </div>

            {/* Manual input fallback */}
            <div className="border-t border-slate-700/50 pt-4">
              <button
                type="button"
                onClick={() => setShowManualInput(!showManualInput)}
                className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showManualInput ? 'rotate-180' : ''}`} />
                Or enter folder URL manually
              </button>
              
              {showManualInput && (
                <div className="mt-3 space-y-2">
                  <Label htmlFor="folder-url" className="text-slate-300">Folder URL or ID</Label>
                  <div className="flex gap-2">
                    <Input
                      id="folder-url"
                      value={folderUrl}
                      onChange={(e) => setFolderUrl(e.target.value)}
                      placeholder="https://drive.google.com/drive/folders/..."
                      className="flex-1 bg-slate-800/50 border-slate-700 text-slate-100"
                    />
                    <Button
                      onClick={handleValidateFolder}
                      disabled={isValidating || !folderUrl.trim()}
                      variant="outline"
                      className="border-slate-700 text-slate-300 hover:bg-slate-800"
                    >
                      {isValidating ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Note: Manual URL entry requires full Drive access scope.
                  </p>
                </div>
              )}
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
                    <Cloud className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-slate-100">Sync Connected</CardTitle>
                    <CardDescription className="text-slate-400">
                      {config.userEmail && <span className="text-emerald-400">{config.userEmail}</span>}
                      {config.userEmail && config.folderName && ' • '}
                      {config.folderName && <span>{config.folderName}</span>}
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

      {/* Change folder section (when configured) */}
      {config?.isConfigured && (
        <Card className="border-slate-800 bg-slate-900/50">
          <CardHeader>
            <CardTitle className="text-lg text-slate-100">Change Sync Folder</CardTitle>
            <CardDescription className="text-slate-400">
              Switch to a different Google Drive folder
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {credentials?.apiKey ? (
              <Button
                onClick={openPicker}
                disabled={isPickerLoading || isValidating}
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                {isPickerLoading || isValidating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <FolderOpen className="w-4 h-4 mr-2" />
                )}
                Choose Different Folder
              </Button>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={folderUrl}
                  onChange={(e) => setFolderUrl(e.target.value)}
                  placeholder="Enter new folder URL..."
                  className="flex-1 bg-slate-800/50 border-slate-700 text-slate-100"
                />
                <Button
                  onClick={handleValidateFolder}
                  disabled={isValidating || !folderUrl.trim()}
                  variant="outline"
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  {isValidating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
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
    </div>
  );
}

