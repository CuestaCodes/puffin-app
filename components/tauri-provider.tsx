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

// Compare semantic versions (strips pre-release suffixes for comparison)
function isNewerVersion(latest: string, current: string): boolean {
  // Strip pre-release suffix (e.g., "1.0.0-beta.1" -> "1.0.0")
  const stripPreRelease = (v: string) => v.split('-')[0];

  const latestClean = stripPreRelease(latest);
  const currentClean = stripPreRelease(current);

  const latestParts = latestClean.split('.').map(Number);
  const currentParts = currentClean.split('.').map(Number);

  for (let i = 0; i < Math.max(latestParts.length, currentParts.length); i++) {
    const latestPart = latestParts[i] || 0;
    const currentPart = currentParts[i] || 0;

    if (latestPart > currentPart) return true;
    if (latestPart < currentPart) return false;
  }

  return false;
}

// Check if sync is configured
async function checkSyncConfigured(): Promise<boolean> {
  try {
    const { apiRequest } = await import('@/lib/services/api-client');
    const response = await apiRequest<{ isConfigured: boolean }>('/api/sync/config');
    return response.data?.isConfigured ?? false;
  } catch {
    return false;
  }
}

// Close the window
async function closeWindow(): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const currentWindow = getCurrentWindow();
    await currentWindow.destroy();
  } catch (err) {
    console.error('Failed to close window:', err);
  }
}

export function TauriProvider({ children }: TauriProviderProps) {
  const [isTauri, setIsTauri] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState<{ version: string; url: string } | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [pendingClose, setPendingClose] = useState(false);

  // Initialize Tauri-specific features
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    // Check for both Tauri 1.x (__TAURI__) and Tauri 2.x (__TAURI_INTERNALS__)
    const isTauriEnv = typeof window !== 'undefined' && !!(w.__TAURI__ || w.__TAURI_INTERNALS__);
    setIsTauri(isTauriEnv);

    if (!isTauriEnv) return;

    let cleanupCloseHandler: (() => void) | undefined;

    const initialize = async () => {
      try {
        // Get app version from Tauri
        const { getVersion } = await import('@tauri-apps/api/app');
        const version = await getVersion();
        setAppVersion(version);

        // Set up window close handler
        cleanupCloseHandler = await setupWindowCloseHandler(setShowSyncModal, setPendingClose);

        // Check for updates
        await checkForUpdates(version, setUpdateAvailable);
      } catch (err) {
        console.error('Failed to initialize Tauri features:', err);
      }
    };

    initialize();

    return () => {
      cleanupCloseHandler?.();
    };
  }, []);

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

// Set up window close event handler
async function setupWindowCloseHandler(
  setShowSyncModal: (show: boolean) => void,
  setPendingClose: (pending: boolean) => void
): Promise<(() => void) | undefined> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    const currentWindow = getCurrentWindow();

    // Listen for close requested event
    const unlisten = await currentWindow.onCloseRequested(async (event) => {
      const isSyncConfigured = await checkSyncConfigured();

      if (isSyncConfigured) {
        event.preventDefault();
        setShowSyncModal(true);
        setPendingClose(true);
      }
    });

    return unlisten;
  } catch (err) {
    console.error('Failed to set up window close handler:', err);
    return undefined;
  }
}

// Check for updates from GitHub Releases
async function checkForUpdates(
  currentVersion: string,
  setUpdateAvailable: (update: { version: string; url: string } | null) => void
): Promise<void> {
  try {
    // Check if we've dismissed an update recently
    const dismissedVersion = localStorage.getItem('puffin_dismissed_update');
    const dismissedAt = localStorage.getItem('puffin_dismissed_update_at');

    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10);
      const hoursSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60);
      if (hoursSinceDismissed < 24 && dismissedVersion) {
        return;
      }
    }

    // Check last update check time
    const lastCheck = localStorage.getItem('puffin_last_update_check');
    if (lastCheck) {
      const lastCheckTime = parseInt(lastCheck, 10);
      const hoursSinceCheck = (Date.now() - lastCheckTime) / (1000 * 60 * 60);
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

    // Handle rate limiting
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
      const rateLimitReset = response.headers.get('X-RateLimit-Reset');

      if (rateLimitRemaining === '0' && rateLimitReset) {
        const resetTime = parseInt(rateLimitReset, 10) * 1000;
        console.log(`GitHub API rate limited. Resets at ${new Date(resetTime).toISOString()}`);
        // Store reset time to avoid retrying until then
        localStorage.setItem('puffin_last_update_check', resetTime.toString());
      }
      return;
    }

    if (!response.ok) {
      console.log('No releases found or API error');
      return;
    }

    const release = await response.json();
    const latestVersion = release.tag_name?.replace(/^v/, '') || '';

    // Compare versions
    if (isNewerVersion(latestVersion, currentVersion)) {
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
}
