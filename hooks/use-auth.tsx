'use client';

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { api } from '@/lib/services';

interface AuthState {
  isLoggedIn: boolean;
  isSetup: boolean;
  isLoading: boolean;
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (pin: string) => Promise<boolean>;
  logout: () => Promise<void>;
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
  });

  const checkSession = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      const result = await api.get<SessionResponse>('/api/auth/session');

      if (result.data) {
        setState({
          isLoggedIn: result.data.authenticated,
          isSetup: result.data.isSetup,
          isLoading: false,
          error: null,
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
        setState(prev => ({
          ...prev,
          isLoggedIn: true,
          isLoading: false,
          error: null,
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

      setState(prev => ({
        ...prev,
        isLoggedIn: false,
        isLoading: false,
        error: null,
      }));
    } catch (_error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to log out',
      }));
    }
  }, []);

  const setup = useCallback(async (pin: string, confirmPin: string): Promise<boolean> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const result = await api.post<{ success: boolean }>('/api/auth/setup', {
        password: pin,
        confirmPassword: confirmPin,
      });

      if (result.data?.success) {
        setState(prev => ({
          ...prev,
          isLoggedIn: true,
          isSetup: true,
          isLoading: false,
          error: null,
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
        setState({
          isLoggedIn: false,
          isSetup: false,
          isLoading: false,
          error: null,
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
    <AuthContext.Provider value={{ ...state, login, logout, setup, reset, checkSession }}>
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

