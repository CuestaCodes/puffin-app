'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '@/lib/services';
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
      const result = await api.get<SyncCheckResponse>('/api/sync/check');
      if (result.data) {
        setSyncStatus(result.data);
      } else {
        console.error('Sync check failed:', result.error);
        setSyncStatus(null);
      }
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
  // Show for: never_synced, cloud_only, conflict, and local_only when canEdit is false (previous session changes)
  // Don't show for: not_configured, no_cloud_backup (optional upload), in_sync, check_failed
  const needsResolution = syncStatus
    ? ['never_synced', 'cloud_only', 'conflict', 'local_only'].includes(syncStatus.reason) && !syncStatus.canEdit
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



