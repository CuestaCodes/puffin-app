'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { SyncCheckResponse } from '@/types/sync';

interface SyncContextValue {
  isLoading: boolean;
  syncStatus: SyncCheckResponse | null;
  canEdit: boolean;
  needsResolution: boolean;
  refetch: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncCheckResponse | null>(null);

  const checkSyncStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/sync/check');
      if (!response.ok) {
        console.error('Sync check failed');
        setSyncStatus(null);
        return;
      }

      const result: SyncCheckResponse = await response.json();
      setSyncStatus(result);
    } catch (error) {
      console.error('Sync check error:', error);
      setSyncStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSyncStatus();
  }, [checkSyncStatus]);

  // Determine if user can edit
  const canEdit = syncStatus?.canEdit ?? true;

  // Determine if we need to show the resolution dialog
  // Show for: never_synced, cloud_only, local_only (optional), conflict
  // Don't show for: not_configured, no_cloud_backup (optional upload), in_sync, check_failed
  const needsResolution = syncStatus 
    ? ['never_synced', 'cloud_only', 'conflict'].includes(syncStatus.reason) && !syncStatus.canEdit
    : false;

  return (
    <SyncContext.Provider
      value={{
        isLoading,
        syncStatus,
        canEdit,
        needsResolution,
        refetch: checkSyncStatus,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSyncContext() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSyncContext must be used within a SyncProvider');
  }
  return context;
}

// Optional hook that returns null if not in a SyncProvider (for use outside main app)
export function useSyncContextOptional() {
  return useContext(SyncContext);
}



