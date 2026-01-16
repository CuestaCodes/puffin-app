'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/services';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Menu, LogOut, Cloud, CloudOff, CloudUpload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { SyncCheckResponse } from '@/types/sync';

interface HeaderProps {
  onToggleSidebar: () => void;
  onLogout: () => void;
  syncStatus: SyncCheckResponse | null;
  onSyncComplete: () => Promise<void>;
}

interface SyncConfig {
  configured: boolean;
  lastSyncedAt: string | null;
  folderName: string | null;
}

// Sync status is checked on window focus, not continuously polled
// This saves battery and network while still detecting changes when user returns to app

export function Header({ onToggleSidebar, onLogout, syncStatus: initialSyncStatus, onSyncComplete }: HeaderProps) {
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null);
  const [localSyncStatus, setLocalSyncStatus] = useState<SyncCheckResponse | null>(initialSyncStatus);
  const [isSyncing, setIsSyncing] = useState(false);
  const isMounted = useRef(true);

  // Fetch both sync config and status
  const fetchSyncData = useCallback(async () => {
    if (!isMounted.current) return;

    try {
      const [configResult, statusResult] = await Promise.all([
        api.get<{ isConfigured: boolean; lastSyncedAt: string | null; folderName: string | null }>('/api/sync/config'),
        api.get<SyncCheckResponse>('/api/sync/check'),
      ]);

      if (!isMounted.current) return;

      if (configResult.data) {
        setSyncConfig({
          configured: configResult.data.isConfigured,
          lastSyncedAt: configResult.data.lastSyncedAt,
          folderName: configResult.data.folderName,
        });
      }

      if (statusResult.data) {
        setLocalSyncStatus(statusResult.data);

        // If polling detects a status that needs the conflict dialog,
        // notify the context so the dialog appears
        const needsDialog = ['conflict', 'cloud_only', 'never_synced'].includes(statusResult.data.reason)
          && !statusResult.data.canEdit;
        if (needsDialog) {
          onSyncComplete();
        }
      }
    } catch (error) {
      console.error('Failed to fetch sync data:', error);
    }
  }, [onSyncComplete]);

  useEffect(() => {
    isMounted.current = true;
    fetchSyncData();

    // Refresh when window regains focus (no continuous polling to save battery/network)
    const handleFocus = () => {
      fetchSyncData();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted.current = false;
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchSyncData]);

  // Update local sync status when prop changes
  useEffect(() => {
    if (initialSyncStatus) {
      setLocalSyncStatus(initialSyncStatus);
    }
  }, [initialSyncStatus]);

  // Handle sync button click
  const handleSyncClick = async () => {
    if (isSyncing) return;

    setIsSyncing(true);

    try {
      // First check for conflicts
      const checkResult = await api.get<SyncCheckResponse>('/api/sync/check');

      if (checkResult.data?.reason === 'conflict' || checkResult.data?.reason === 'cloud_only') {
        // Let the conflict dialog handle this - just refetch to trigger it
        await onSyncComplete();
        toast.error('Sync conflict detected', {
          description: 'Please resolve the conflict before syncing.',
        });
        return;
      }

      // Proceed with push
      const pushResult = await api.post<{ success: boolean; error?: string }>('/api/sync/push', {});

      if (pushResult.data?.success) {
        toast.success('Changes uploaded to cloud');
        // Refresh both config and sync status
        await Promise.all([fetchSyncData(), onSyncComplete()]);
      } else {
        toast.error('Sync failed', {
          description: pushResult.data?.error || pushResult.error || 'Failed to upload changes',
        });
      }
    } catch (error) {
      console.error('Sync error:', error);
      toast.error('Sync failed', {
        description: 'An unexpected error occurred',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const lastSynced = syncConfig?.lastSyncedAt ? new Date(syncConfig.lastSyncedAt) : null;
  const hasLocalChanges = localSyncStatus?.reason === 'local_only';
  const showSyncButton = syncConfig?.configured && hasLocalChanges;

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-slate-900 border-b border-slate-800">
      {/* Left side */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="md:hidden text-slate-400 hover:text-slate-200"
          aria-label="Toggle sidebar"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Sync status - only show if sync is configured */}
        {syncConfig?.configured && (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            {showSyncButton ? (
              // Show clickable sync button when there are local changes
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleSyncClick}
                      disabled={isSyncing}
                      className="h-8 w-8 text-amber-400 hover:text-amber-300 hover:bg-amber-500/20 hover:ring-2 hover:ring-amber-500/30 transition-all"
                      aria-label="Sync local changes"
                    >
                      {isSyncing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CloudUpload className="w-4 h-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{isSyncing ? 'Syncing...' : 'Sync local changes'}</p>
                  </TooltipContent>
                </Tooltip>
                <span className={isSyncing ? 'text-slate-500' : undefined}>
                  {isSyncing ? 'Syncing...' : 'Local changes'}
                </span>
              </>
            ) : lastSynced ? (
              // Show synced status when in sync
              <>
                <Cloud className="w-4 h-4 text-emerald-400" />
                <span>Synced {formatRelativeTime(lastSynced)}</span>
              </>
            ) : (
              // Show not synced yet
              <>
                <CloudOff className="w-4 h-4 text-amber-400" />
                <span>Not synced yet</span>
              </>
            )}
          </div>
        )}

        {/* Logout button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Lock
        </Button>
      </div>
    </header>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
