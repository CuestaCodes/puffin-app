// Auth module exports
export { hashPassword, verifyPassword } from './password';
export { sessionOptions, defaultSession, type SessionData } from './session';
export { getUser, hasUser, createUser, verifyUserPassword, updateUserPassword } from './user';
export { getSession, requireAuth } from './middleware';

