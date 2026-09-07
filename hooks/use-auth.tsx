'use client';

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { api } from '@/lib/services';
import { clearLastActivity, readLockedFlag, resetIdleCountdown, writeLockedFlag } from '@/lib/auto-lock';

interface AuthState {
  isLoggedIn: boolean;
  isSetup: boolean;
  isLoading: boolean;
  error: string | null;
  /**
   * Auto-lock has hidden the app behind the PIN screen. Distinct from
   * `isLoggedIn`: the session stays valid while locked, so in-flight work
   * (a sync, an import) keeps running underneath the overlay.
   */
  isLocked: boolean;
}

interface AuthContextType extends AuthState {
  login: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
  lock: () => void;
  setup: (pin: string, confirmPin: string) => Promise<boolean>;
  reset: (pin?: string) => Promise<boolean>;
  checkSession: () => Promise<void>;
}

interface SessionResponse {
  authenticated: boolean;
  isSetup: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoggedIn: false,
    isSetup: false,
    isLoading: true,
    error: null,
    isLocked: false,
  });

  const checkSession = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      const result = await api.get<SessionResponse>('/api/auth/session');

      if (result.data) {
        // Restore the lock across a reload, but only when there is still a
        // session to lock. Without a session the login screen is shown anyway,
        // so a leftover flag would only be stale state.
        const authenticated = result.data.authenticated;
        const locked = authenticated && readLockedFlag();
        if (!locked) writeLockedFlag(false);

        setState({
          isLoggedIn: authenticated,
          isSetup: result.data.isSetup,
          isLoading: false,
          error: null,
          isLocked: locked,
        });
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Failed to check session',
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: `Connection error: ${errorMessage}`,
      }));
    }
  }, []);

  const login = useCallback(async (pin: string): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const result = await api.post<{ success: boolean }>('/api/auth/login', { password: pin });

      if (result.data?.success) {
        // Unlocking counts as activity: start the idle countdown afresh so the
        // stale pre-lock timestamp doesn't re-lock immediately.
        writeLockedFlag(false);
        resetIdleCountdown();
        setState(prev => ({
          ...prev,
          isLoggedIn: true,
          isLoading: false,
          error: null,
          isLocked: false,
        }));
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Login failed',
        }));
        return false;
      }
    } catch (_error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to connect to server',
      }));
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      await api.post('/api/auth/logout');

      writeLockedFlag(false);
      clearLastActivity();
      setState(prev => ({
        ...prev,
        isLoggedIn: false,
        isLoading: false,
        error: null,
        isLocked: false,
      }));
    } catch (_error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to log out',
      }));
    }
  }, []);

  /**
   * Lock the app behind the PIN overlay after an idle timeout.
   *
   * Deliberately does NOT end the session. Tauri handlers don't check auth at
   * all, so clearing it would buy nothing on the shipping path, while in web
   * mode it would 401 every background request and tear down an in-flight
   * import. The overlay is the gate; the persisted flag keeps it in place
   * across a reload.
   */
  const lock = useCallback(() => {
    writeLockedFlag(true);
    setState(prev => (prev.isLocked ? prev : { ...prev, isLocked: true, error: null }));
  }, []);

  const setup = useCallback(async (pin: string, confirmPin: string): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const result = await api.post<{ success: boolean }>('/api/auth/setup', {
        password: pin,
        confirmPassword: confirmPin,
      });

      if (result.data?.success) {
        writeLockedFlag(false);
        resetIdleCountdown();
        setState(prev => ({
          ...prev,
          isLoggedIn: true,
          isSetup: true,
          isLoading: false,
          error: null,
          isLocked: false,
        }));
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Setup failed',
        }));
        return false;
      }
    } catch (_error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to connect to server',
      }));
      return false;
    }
  }, []);

  const reset = useCallback(async (pin?: string): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      const result = await api.post<{ success: boolean }>('/api/auth/reset', pin ? { pin } : undefined);

      if (result.data?.success) {
        writeLockedFlag(false);
        clearLastActivity();
        setState({
          isLoggedIn: false,
          isSetup: false,
          isLoading: false,
          error: null,
          isLocked: false,
        });
        return true;
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Failed to reset app',
        }));
        return false;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to reset app';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return false;
    }
  }, []);

  // Check session on mount - this is a valid pattern for initial data fetching
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Initial auth check on mount is intentional
    checkSession();
  }, [checkSession]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, lock, setup, reset, checkSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

