'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { 
  CloudDownload, 
  CloudUpload, 
  Loader2, 
  AlertTriangle, 
  RefreshCw,
  Cloud,
  HardDrive,
  AlertCircle
} from 'lucide-react';
import type { SyncCheckResponse } from '@/app/api/sync/check/route';

interface SyncConflictDialogProps {
  isOpen: boolean;
  syncStatus: SyncCheckResponse | null;
  onResolved: () => void;
}

export function SyncConflictDialog({ isOpen, syncStatus, onResolved }: SyncConflictDialogProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<'download' | 'upload' | null>(null);

  const handleDownload = async () => {
    setIsSyncing(true);
    setAction('download');
    setError(null);

    try {
      const response = await fetch('/api/sync/pull', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        window.location.reload();
      } else {
        setError(result.error || 'Failed to download from cloud');
      }
    } catch (err) {
      console.error('Download error:', err);
      setError('Failed to connect to sync service');
    } finally {
      setIsSyncing(false);
      setAction(null);
    }
  };

  const handleUpload = async () => {
    setIsSyncing(true);
    setAction('upload');
    setError(null);

    try {
      const response = await fetch('/api/sync/push', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        onResolved();
      } else {
        setError(result.error || 'Failed to upload to cloud');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError('Failed to connect to sync service');
    } finally {
      setIsSyncing(false);
      setAction(null);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Unknown';
    return new Date(isoString).toLocaleString();
  };

  if (!syncStatus) return null;

  const { reason, hasLocalChanges, hasCloudChanges, cloudModifiedAt, lastSyncedAt, message } = syncStatus;

  // Determine dialog title and description based on scenario
  const getDialogContent = () => {
    switch (reason) {
      case 'never_synced':
        return {
          icon: <Cloud className="w-5 h-5 text-blue-400" />,
          title: 'Cloud Backup Found',
          description: 'A backup exists in the cloud. Choose how to proceed.',
        };
      case 'cloud_only':
        return {
          icon: <CloudDownload className="w-5 h-5 text-cyan-400" />,
          title: 'Cloud Update Available',
          description: 'A newer version is available in the cloud.',
        };
      case 'local_only':
        return {
          icon: <HardDrive className="w-5 h-5 text-emerald-400" />,
          title: 'Local Changes Detected',
          description: 'You have local changes that need to be uploaded.',
        };
      case 'conflict':
        return {
          icon: <AlertCircle className="w-5 h-5 text-amber-400" />,
          title: 'Sync Conflict',
          description: 'Both local and cloud have changes. Choose which version to keep.',
        };
      case 'no_cloud_backup':
        return {
          icon: <CloudUpload className="w-5 h-5 text-violet-400" />,
          title: 'No Cloud Backup',
          description: 'Upload your data to start syncing across devices.',
        };
      default:
        return {
          icon: <RefreshCw className="w-5 h-5 text-cyan-400" />,
          title: 'Sync Required',
          description: message || 'Please sync your data.',
        };
    }
  };

  const content = getDialogContent();

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-[500px] bg-slate-900 border-slate-700"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-slate-100 flex items-center gap-2">
            {content.icon}
            {content.title}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {content.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {/* Status info */}
          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700 space-y-2">
            {lastSyncedAt && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Last synced:</span>
                <span className="text-slate-300">{formatDate(lastSyncedAt)}</span>
              </div>
            )}
            {cloudModifiedAt && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Cloud updated:</span>
                <span className="text-slate-300">{formatDate(cloudModifiedAt)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Local changes:</span>
              <span className={hasLocalChanges ? 'text-amber-400' : 'text-slate-400'}>
                {hasLocalChanges ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Cloud changes:</span>
              <span className={hasCloudChanges ? 'text-cyan-400' : 'text-slate-400'}>
                {hasCloudChanges ? 'Yes' : 'No'}
              </span>
            </div>
          </div>

          {/* Action buttons based on scenario */}
          <div className="space-y-3">
            {/* Cloud only - just download */}
            {reason === 'cloud_only' && (
              <Button
                onClick={handleDownload}
                disabled={isSyncing}
                className="w-full bg-cyan-600 hover:bg-cyan-500"
              >
                {isSyncing && action === 'download' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <CloudDownload className="w-4 h-4 mr-2" />
                    Download from Cloud
                  </>
                )}
              </Button>
            )}

            {/* Local only - just upload */}
            {reason === 'local_only' && (
              <Button
                onClick={handleUpload}
                disabled={isSyncing}
                className="w-full bg-emerald-600 hover:bg-emerald-500"
              >
                {isSyncing && action === 'upload' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-4 h-4 mr-2" />
                    Upload to Cloud
                  </>
                )}
              </Button>
            )}

            {/* No cloud backup - upload */}
            {reason === 'no_cloud_backup' && (
              <Button
                onClick={handleUpload}
                disabled={isSyncing}
                className="w-full bg-violet-600 hover:bg-violet-500"
              >
                {isSyncing && action === 'upload' ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <CloudUpload className="w-4 h-4 mr-2" />
                    Upload to Cloud
                  </>
                )}
              </Button>
            )}

            {/* Never synced or Conflict - both options */}
            {(reason === 'never_synced' || reason === 'conflict') && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={handleDownload}
                    disabled={isSyncing}
                    variant="outline"
                    className="border-cyan-600 text-cyan-400 hover:bg-cyan-600/10"
                  >
                    {isSyncing && action === 'download' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CloudDownload className="w-4 h-4 mr-2" />
                        Use Cloud
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleUpload}
                    disabled={isSyncing}
                    variant="outline"
                    className="border-amber-600 text-amber-400 hover:bg-amber-600/10"
                  >
                    {isSyncing && action === 'upload' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <CloudUpload className="w-4 h-4 mr-2" />
                        Use Local
                      </>
                    )}
                  </Button>
                </div>

                {reason === 'conflict' && (
                  <p className="text-xs text-amber-400/80 text-center">
                    ⚠️ One version will overwrite the other. This cannot be undone.
                  </p>
                )}

                {reason === 'never_synced' && (
                  <p className="text-xs text-slate-500 text-center">
                    Choose &quot;Use Cloud&quot; to download existing backup, or &quot;Use Local&quot; to replace it.
                  </p>
                )}
              </>
            )}
          </div>

          <p className="text-xs text-slate-500 text-center">
            A local backup is automatically created before any sync operation.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}



