'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CloudUpload, Loader2, AlertTriangle, X } from 'lucide-react';

interface SyncBeforeCloseModalProps {
  isOpen: boolean;
  onSyncComplete: () => void;
  onSkip: () => void;
  onCancel: () => void;
}

export function SyncBeforeCloseModal({
  isOpen,
  onSyncComplete,
  onSkip,
  onCancel,
}: SyncBeforeCloseModalProps) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setError(null);

    try {
      const response = await fetch('/api/sync/push', { method: 'POST' });
      const result = await response.json();

      if (result.success) {
        onSyncComplete();
      } else {
        setError(result.error || 'Failed to sync');
      }
    } catch (err) {
      console.error('Sync error:', err);
      setError('Failed to connect to sync service');
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent
        className="sm:max-w-[450px] bg-slate-900 border-slate-700"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          onCancel();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-slate-100 flex items-center gap-2">
            <CloudUpload className="w-5 h-5 text-cyan-400" />
            Sync Before Closing?
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            You have cloud sync configured. Would you like to upload your latest
            changes to Google Drive before closing?
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
            <p className="text-sm text-slate-300">
              Syncing ensures your data is backed up and available on other devices.
              If you skip, your recent changes will only be saved locally.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={isSyncing}
            className="text-slate-400 hover:text-slate-300"
          >
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={onSkip}
            disabled={isSyncing}
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
          >
            <X className="w-4 h-4 mr-2" />
            Close Without Syncing
          </Button>
          <Button
            onClick={handleSync}
            disabled={isSyncing}
            className="bg-cyan-600 hover:bg-cyan-500"
          >
            {isSyncing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Syncing...
              </>
            ) : (
              <>
                <CloudUpload className="w-4 h-4 mr-2" />
                Sync & Close
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
