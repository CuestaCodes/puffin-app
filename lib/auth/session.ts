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

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'complex_password_at_least_32_characters_long',
  cookieName: process.env.SESSION_COOKIE_NAME || 'puffin_session',
  cookieOptions: {
    // Secure cookies in production
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 1 week
  },
};

// Extend iron-session types
declare module 'iron-session' {
  interface IronSessionData {
    userId: string | null;
    isLoggedIn: boolean;
  }
}

