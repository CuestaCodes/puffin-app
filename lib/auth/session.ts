// Session management using iron-session
import { SessionOptions } from 'iron-session';

export interface SessionData {
  userId: string | null;
  isLoggedIn: boolean;
}

export const defaultSession: SessionData = {
  userId: null,
  isLoggedIn: false,
};

// Get session secret with proper validation
// Called at runtime, not build time
export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  
  if (secret) {
    return secret;
  }
  
  // In production, require a proper secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable is required in production');
  }
  
  // Development fallback (not secure, only for local development)
  return 'dev_only_puffin_session_secret_32ch';
}

// Lazy-initialized session options to avoid build-time errors
let _sessionOptions: SessionOptions | null = null;

export function getSessionOptions(): SessionOptions {
  if (!_sessionOptions) {
    _sessionOptions = {
      password: getSessionSecret(),
      cookieName: process.env.SESSION_COOKIE_NAME || 'puffin_session',
      cookieOptions: {
        // Secure cookies in production
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 1 week
      },
    };
  }
  return _sessionOptions;
}

// Backward compatibility export - delegates to getter
export const sessionOptions: SessionOptions = {
  get password() {
    return getSessionSecret();
  },
  cookieName: process.env.SESSION_COOKIE_NAME || 'puffin_session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  },
};

// Extend iron-session types
declare module 'iron-session' {
  interface IronSessionData {
    userId: string | null;
    isLoggedIn: boolean;
  }
}
