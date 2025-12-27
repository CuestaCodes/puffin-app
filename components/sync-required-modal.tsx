'use client';

import { useState } from 'react';
import { api } from '@/lib/services';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CloudDownload, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';

interface SyncRequiredModalProps {
  isOpen: boolean;
  onSyncComplete: () => void;
}

export function SyncRequiredModal({ isOpen, onSyncComplete: _onSyncComplete }: SyncRequiredModalProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);

    try {
      const result = await api.post<{ success: boolean; error?: string }>('/api/sync/pull', {});

      if (result.data?.success) {
        // Sync complete - reload the page to pick up new data
        window.location.reload();
      } else {
        setError(result.data?.error || result.error || 'Failed to sync');
      }
    } catch (err) {
      console.error('Sync error:', err);
      setError('Failed to connect to sync service');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent 
        className="sm:max-w-[450px] bg-slate-900 border-slate-700"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-slate-100 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-cyan-400" />
            Sync Required
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Your local data needs to be synced with the cloud before you can make changes.
            This ensures you&apos;re working with the latest data and prevents conflicts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <p className="text-sm text-slate-300 mb-3">
              Click below to download the latest data from the cloud. Your session will refresh 
              automatically once the sync is complete.
            </p>
            <Button
              onClick={handleSync}
              disabled={isSyncing}
              className="w-full bg-cyan-600 hover:bg-cyan-500"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <CloudDownload className="w-4 h-4 mr-2" />
                  Download & Sync
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-slate-500 text-center">
            This sync check ensures data consistency across all your devices.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}



