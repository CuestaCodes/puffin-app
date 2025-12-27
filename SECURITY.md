# Security Documentation

This document describes Puffin's security practices for credential management, data encryption, and secure deployment.

## Overview

Puffin is designed with privacy-first principles:
- All data stored locally (no cloud services required)
- Optional Google Drive sync with encrypted backups
- No telemetry or analytics
- Single-user model per installation

## Authentication

### PIN-Based Local Auth
- 6-digit numeric PIN for local access
- Hashed with bcrypt (12 rounds by default, configurable via `BCRYPT_ROUNDS`)
- Rate limiting: 5 attempts per 15 minutes, then 15-minute lockout

### Session Management
- HTTP-only, secure cookies in production
- Session secret required via `SESSION_SECRET` environment variable
- Sessions stored in-memory (reset on server restart)

## Encryption

### OAuth Token Storage
Tokens and credentials are encrypted at rest using AES-256-CBC.

**Files encrypted:**
- `.sync-tokens.enc` - OAuth refresh tokens
- `.sync-credentials.enc` - Google Cloud OAuth credentials

**Key derivation:**
1. If `SYNC_ENCRYPTION_KEY` environment variable is set, it's hashed with SHA-256
2. Otherwise, a machine-derived key is generated from:
   - `os.hostname()` + `os.userInfo().username` + `'puffin'`
   - Hashed with SHA-256 to produce 32-byte key

**Security implications:**
- Machine-derived keys are unique per installation
- Moving encrypted files to another machine will fail decryption
- Set `SYNC_ENCRYPTION_KEY` explicitly for portable configurations

### Database Encryption
The SQLite database is **not encrypted** by default. For sensitive environments:
- Use full-disk encryption (BitLocker, FileVault, LUKS)
- The database contains transaction data but no credentials

## Google Drive Sync

### OAuth Scopes
- `drive.file` - Default scope, access only to files created by Puffin
- `drive` - Extended scope for multi-account sync (accessing shared files)

### Credential Storage
Google Cloud OAuth credentials can be provided via:
1. Environment variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
2. UI wizard in Settings > Sync (stored encrypted locally)

Credentials entered via UI are encrypted with AES-256-CBC before storage.

### Sync Security
- Local backup created before every sync operation
- Database integrity verified with SHA-256 hash
- Conflict resolution: last-write-wins
- Backups uploaded are the raw SQLite database (consider encryption for sensitive data)

## API Security

### CSRF Protection
The `/api/sync/token` endpoint includes:
- Origin/Referer header verification (blocks cross-origin in production)
- Rate limiting (30 requests/minute, 5-minute lockout)
- Audit logging with IP address

### Rate Limiting
| Endpoint | Max Attempts | Window | Lockout |
|----------|-------------|--------|---------|
| Login | 5 | 15 min | 15 min |
| Change PIN | 5 | 15 min | 15 min |
| Reset | 3 | 1 hour | 1 hour |
| Token API | 30 | 1 min | 5 min |

### Content Security Policy
Tauri app CSP restricts connections to:
- `'self'` - Local resources
- `https://api.github.com` - Update checks
- `https://accounts.google.com` - OAuth
- `https://*.googleapis.com` - Google Drive API

## File System Security

### Development Mode
```
./data/
├── puffin.db           # SQLite database
├── sync-config.json    # Sync configuration (gitignored)
├── .sync-tokens.enc    # Encrypted OAuth tokens (gitignored)
├── .sync-credentials.enc # Encrypted credentials (gitignored)
└── backups/            # Local backups (gitignored)
```

### Packaged App (Windows)
```
%APPDATA%/Puffin/
├── puffin.db
├── sync-config.json
├── .sync-tokens.enc
├── .sync-credentials.enc
└── backups/
```

### Recommended Permissions
Sensitive files should have restrictive permissions:
- Linux/macOS: `chmod 600` (owner read/write only)
- Windows: Restrict to current user via ACLs

## Secure Deployment Checklist

1. **Set `SESSION_SECRET`** - Required for production
   ```bash
   export SESSION_SECRET=$(openssl rand -base64 32)
   ```

2. **Configure Google OAuth** (if using sync)
   - Create OAuth 2.0 credentials in Google Cloud Console
   - Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
   - Or enter via UI wizard (stored encrypted)

3. **Use full-disk encryption** for the data directory

4. **Review file permissions** on sensitive files

5. **Keep software updated** - Check for updates in Settings

## Token Rotation and Revocation

### Rotating OAuth Tokens
1. Go to Settings > Sync
2. Click "Disconnect" to revoke current tokens
3. Re-authenticate with Google

### If Tokens Are Compromised
1. Revoke access at https://myaccount.google.com/permissions
2. Delete local encrypted token files:
   ```bash
   rm data/.sync-tokens.enc data/.sync-credentials.enc
   ```
3. Re-authenticate with new credentials

### Changing Encryption Key
If changing `SYNC_ENCRYPTION_KEY`:
1. Disconnect sync (revokes tokens)
2. Delete encrypted files
3. Set new `SYNC_ENCRYPTION_KEY`
4. Re-authenticate

## Multi-User Considerations

Puffin is designed for single-user installations. For shared computers:
- Each user should have their own OS user account
- Machine-derived keys will be different per OS user
- Data directories are per-user in packaged mode

## Reporting Security Issues

If you discover a security vulnerability, please report it privately:
- Open a GitHub issue with `[SECURITY]` prefix
- Or email the maintainer directly

Do not disclose security issues publicly until a fix is available.
