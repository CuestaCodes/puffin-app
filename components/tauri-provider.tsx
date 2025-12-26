'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { SyncBeforeCloseModal } from './sync-before-close-modal';

interface TauriContextValue {
  isTauri: boolean;
  appVersion: string | null;
  updateAvailable: { version: string; url: string } | null;
  dismissUpdate: () => void;
}

const TauriContext = createContext<TauriContextValue>({
  isTauri: false,
  appVersion: null,
  updateAvailable: null,
  dismissUpdate: () => {},
});

export function useTauri() {
  return useContext(TauriContext);
}

interface TauriProviderProps {
  children: ReactNode;
}

export function TauriProvider({ children }: TauriProviderProps) {
  const [isTauri, setIsTauri] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; url: string } | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);
  const [syncConfigured, setSyncConfigured] = useState(false);

  // Check if we're in Tauri context
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isTauriEnv = typeof window !== 'undefined' && !!(window as any).__TAURI__;
    setIsTauri(isTauriEnv);

    if (isTauriEnv) {
      initializeTauri();
    }
  }, []);

  // Initialize Tauri-specific features
  const initializeTauri = async () => {
    try {
      // Get app version from Tauri
      const { getVersion } = await import('@tauri-apps/api/app');
      const version = await getVersion();
      setAppVersion(version);

      // Set up window close handler
      await setupWindowCloseHandler();

      // Check for updates
      await checkForUpdates(version);
    } catch (err) {
      console.error('Failed to initialize Tauri features:', err);
    }
  };

  // Set up window close event handler
  const setupWindowCloseHandler = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const currentWindow = getCurrentWindow();

      // Listen for close requested event
      await currentWindow.onCloseRequested(async (event) => {
        // Check if sync is configured
        const isSyncConfigured = await checkSyncConfigured();

        if (isSyncConfigured) {
          // Prevent default close and show modal
          event.preventDefault();
          setSyncConfigured(true);
          setShowSyncModal(true);
          setPendingClose(true);
        }
        // If sync not configured, allow normal close
      });
    } catch (err) {
      console.error('Failed to set up window close handler:', err);
    }
  };

  // Check if sync is configured
  const checkSyncConfigured = async (): Promise<boolean> => {
    try {
      // In Tauri mode, we use the service layer
      const { apiRequest } = await import('@/lib/services/api-client');
      const response = await apiRequest<{ isConfigured: boolean }>('/api/sync/config');
      return response.data?.isConfigured ?? false;
    } catch {
      return false;
    }
  };

  // Check for updates from GitHub Releases
  const checkForUpdates = async (currentVersion: string) => {
    try {
      // Check if we've dismissed an update recently
      const dismissedVersion = localStorage.getItem('puffin_dismissed_update');
      const dismissedAt = localStorage.getItem('puffin_dismissed_update_at');

      if (dismissedAt) {
        const dismissedTime = parseInt(dismissedAt, 10);
        const hoursSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60);
        // Don't show the same dismissed version for 24 hours
        if (hoursSinceDismissed < 24 && dismissedVersion) {
          return;
        }
      }

      // Check last update check time
      const lastCheck = localStorage.getItem('puffin_last_update_check');
      if (lastCheck) {
        const lastCheckTime = parseInt(lastCheck, 10);
        const hoursSinceCheck = (Date.now() - lastCheckTime) / (1000 * 60 * 60);
        // Only check once every 6 hours
        if (hoursSinceCheck < 6) {
          return;
        }
      }

      // Fetch latest release from GitHub
      const response = await fetch(
        'https://api.github.com/repos/CuestaCodes/puffin-app/releases/latest',
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json',
          },
        }
      );

      if (!response.ok) {
        console.log('No releases found or API error');
        return;
      }

      const release = await response.json();
      const latestVersion = release.tag_name?.replace(/^v/, '') || '';

      // Compare versions
      if (isNewerVersion(latestVersion, currentVersion)) {
        // Skip if this version was dismissed
        if (dismissedVersion === latestVersion) {
          return;
        }

        setUpdateAvailable({
          version: latestVersion,
          url: release.html_url,
        });
      }

      // Record check time
      localStorage.setItem('puffin_last_update_check', Date.now().toString());
    } catch (err) {
      console.error('Failed to check for updates:', err);
    }
  };

  // Compare semantic versions
  const isNewerVersion = (latest: string, current: string): boolean => {
    const latestParts = latest.split('.').map(Number);
    const currentParts = current.split('.').map(Number);

    for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
      const latestPart = latestParts[i] || 0;
      const currentPart = currentParts[i] || 0;

      if (latestPart > currentPart) return true;
      if (latestPart < currentPart) return false;
    }

    return false;
  };

  // Handle sync complete
  const handleSyncComplete = useCallback(async () => {
    setShowSyncModal(false);
    if (pendingClose) {
      await closeWindow();
    }
  }, [pendingClose]);

  // Handle skip sync
  const handleSkipSync = useCallback(async () => {
    setShowSyncModal(false);
    if (pendingClose) {
      await closeWindow();
    }
  }, [pendingClose]);

  // Handle cancel close
  const handleCancelClose = useCallback(() => {
    setShowSyncModal(false);
    setPendingClose(false);
  }, []);

  // Close the window
  const closeWindow = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const currentWindow = getCurrentWindow();
      await currentWindow.destroy();
    } catch (err) {
      console.error('Failed to close window:', err);
    }
  };

  // Dismiss update notification
  const dismissUpdate = useCallback(() => {
    if (updateAvailable) {
      localStorage.setItem('puffin_dismissed_update', updateAvailable.version);
      localStorage.setItem('puffin_dismissed_update_at', Date.now().toString());
      setUpdateAvailable(null);
    }
  }, [updateAvailable]);

  return (
    <TauriContext.Provider
      value={{
        isTauri,
        appVersion,
        updateAvailable,
        dismissUpdate,
      }}
    >
      {children}
      {isTauri && (
        <SyncBeforeCloseModal
          isOpen={showSyncModal}
          onSyncComplete={handleSyncComplete}
          onSkip={handleSkipSync}
          onCancel={handleCancelClose}
        />
      )}
    </TauriContext.Provider>
  );
}
