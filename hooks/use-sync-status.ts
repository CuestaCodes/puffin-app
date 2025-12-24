'use client';

import { useState, useEffect, useCallback } from 'react';

interface SyncCheckResult {
  syncRequired: boolean;
  reason: string;
  message?: string;
  canEdit: boolean;
  warning?: string;
  lastSyncedAt?: string;
}

export function useSyncStatus() {
  const [isLoading, setIsLoading] = useState(true);
  const [syncRequired, setSyncRequired] = useState(false);
  const [canEdit, setCanEdit] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const checkSyncStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/sync/check');
      if (!response.ok) {
        console.error('Sync check failed');
        setCanEdit(true); // Allow editing on error
        return;
      }

      const result: SyncCheckResult = await response.json();
      setSyncRequired(result.syncRequired);
      setCanEdit(result.canEdit);
      setMessage(result.message || null);
      setWarning(result.warning || null);
      setLastSyncedAt(result.lastSyncedAt || null);
    } catch (error) {
      console.error('Sync check error:', error);
      setCanEdit(true); // Allow editing on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSyncStatus();
  }, [checkSyncStatus]);

  return {
    isLoading,
    syncRequired,
    canEdit,
    message,
    warning,
    lastSyncedAt,
    refetch: checkSyncStatus,
  };
}



