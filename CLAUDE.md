# Puffin - Project Guide

## Overview

**Puffin** (Personal Unified Finance Framework & Investment Navigator) is a locally-hosted personal budgeting application for tracking expenses, categorising transactions, and monitoring spending against budgets.

**Core Value Proposition:**
- Full data ownership with local SQLite database
- No subscription fees or cloud lock-in
- Multi-device access via optional Google Drive sync
- Flexible categorisation with auto-categorisation rules
- Standalone desktop application (no Node.js required for end users)

**Target User:** Privacy-conscious individuals who want detailed expense tracking with budget comparison, comfortable with self-hosted applications.

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 14+ with App Router |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui (Radix primitives) |
| Charts | Recharts |
| Database | SQLite |
| DB Library (Dev) | better-sqlite3 |
| DB Library (Packaged) | tauri-plugin-sql |
| Desktop Packaging | Tauri 2.x |
| Testing | Vitest |
| Package Manager | npm |

## Project Structure

```
app/           # Next.js App Router pages and API routes
components/    # React UI components
lib/           # Utility functions, database layer, validations
  auth/        # Authentication (PIN hashing, session, rate limiting)
  data/        # Data management utilities (backups, exports, formatting)
  db/          # Database operations and abstraction layer
  sync/        # Google Drive sync (OAuth, encryption, Drive API)
types/         # TypeScript type definitions
data/          # SQLite database file (development)
```

## Key Conventions

### Amount Signs
- **Negative** = Expense (money going out)
- **Positive** = Income (money coming in)

### Category System
Two-tier hierarchy:
1. **Upper Categories** (fixed, renameable): Income, Expense, Saving, Bill, Debt, Sinking Funds, Transfer
2. **Sub-categories** (user-defined): Created under upper categories

**Note:** Transfer category is excluded from all reporting calculations.

### Soft Delete
Transactions use `is_deleted` flag for soft delete, allowing recovery.

### Database Abstraction
`lib/db/` contains abstraction layer to switch between:
- `better-sqlite3` for development (synchronous, fast iteration)
- `tauri-plugin-sql` for packaged app (native Tauri integration)

Runtime detection via `window.__TAURI__`.

### Database Connection Management
- `getDatabase()` - Get the current database connection
- `closeDatabase()` - Close connection only (keeps initialization state)
- `resetDatabaseConnection()` - Close connection AND reset initialization flag (use after database file replacement/deletion)

### SQLite WAL Mode
The database uses WAL (Write-Ahead Logging) mode for better concurrency. Before any operation that reads/copies the database file directly (backups, exports, sync uploads), always checkpoint first:
```typescript
db.pragma('wal_checkpoint(TRUNCATE)');
```
This flushes pending writes from the `-wal` file into the main `.db` file. Also clean up stale WAL files after replacing the database:
```typescript
cleanupWalFiles(dbPath); // Removes .db-wal and .db-shm files
```

## Data Models

| Model | Purpose |
|-------|---------|
| LocalUser | Single-row table for local PIN authentication (6-digit PIN, bcrypt hashed) |
| Transaction | Financial transactions with soft delete support |
| UpperCategory | Top-level category groups |
| SubCategory | User-defined categories under upper categories |
| Budget | Monthly budget amounts per sub-category |
| AutoCategoryRule | Rules for automatic transaction categorisation |
| SyncLog | Google Drive sync history |

**Note:** Authentication uses a 6-digit numeric PIN (not passwords). Validation schemas use PIN terminology (`setupPinSchema`, `loginPinSchema`) with backward-compatible aliases (`setupPasswordSchema`, `loginSchema`).

### Transaction Table Key Columns
| Column | Purpose |
|--------|---------|
| `sub_category_id` | FK to sub_category (not `category_id`) |
| `parent_transaction_id` | FK to parent for split children (not `split_from`) |
| `is_split_parent` | Boolean flag for split parent transactions |
| `is_deleted` | Soft delete flag (0 = active, 1 = deleted) |
| `source_id` | FK to source (bank/account origin) |

### Sync Configuration Storage

Sync state uses encrypted JSON files (not SQLite) for portability:

| File | Purpose |
|------|---------|
| `sync-config.json` | Folder ID, last sync time, DB hash, file-based sync flag |
| `.sync-tokens.enc` | OAuth tokens (AES-256-CBC encrypted) |
| `.sync-credentials.enc` | Google Cloud credentials (AES-256-CBC encrypted) |

**Sync Modes:**
- **Folder-based**: User creates folder, app manages `puffin-backup.db` inside
- **File-based**: User selects existing backup file (for multi-account sync)

**Scope Levels:**
- `drive.file`: Standard scope for single-account sync
- `drive`: Extended scope required for multi-account sync (access shared files)

## Key Commands

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run test       # Run Vitest tests
npm run lint       # ESLint check

# Tauri (when configured)
npm run tauri dev    # Run in Tauri shell with dev tools
npm run tauri build  # Build portable Windows .exe
```

## API Routes

```
/api/auth/*           # Login, logout, setup
/api/transactions/*   # CRUD, import, split/unsplit
/api/categories/*     # Upper and sub-category management
/api/budgets/*        # Budget management
/api/rules/*          # Auto-categorisation rules
/api/sync/*           # Google Drive push/pull
/api/analytics/*      # Dashboard data
```

## Development Phases

1. **Foundation** - Project setup, database schema, authentication, basic API routes
2. **Transaction Import** - CSV parsing, column mapping, duplicate detection, manual entry
3. **Categorisation** - Category management, uncategorised inbox, transaction splitting
4. **Auto-Categorisation** - Rules engine with priority ordering
5. **Monthly Budget** - Budget view with actual vs budget comparison
6. **Dashboard** - Analytics, charts, trend analysis
7. **Google Drive Sync** - OAuth2, push/pull sync, folder configuration
8. **Polish** - Soft delete, undo system, UI refinements
9. **Desktop Packaging** - Tauri setup, native SQLite, secure storage, auto-update

## File Locations

| Context | Database | Config |
|---------|----------|--------|
| Development | `./data/puffin.db` | `./data/config.json` |
| Packaged | `%APPDATA%/Puffin/puffin.db` | `%APPDATA%/Puffin/config.json` |

## Testing

- Use Vitest for unit and integration tests
- Test files alongside source: `*.test.ts`
- Prioritise tests for calculation logic (totals, percentages, budget comparisons)

### Sync Module Testing
- Mock `fs` module for config/token storage tests
- Mock `googleapis` with class-style OAuth2 constructor
- Test encryption round-trips (save then retrieve)
- Test scope detection with exact string matching (not substring)
- Test retry logic with simulated error sequences
- Test URL/ID sanitization against injection attempts

## Important Notes

- All data stays local; sync to Google Drive is manual and optional
- Single-user model per installation (no concurrent access)
- Local backup created before every sync operation
- Conflict resolution: last-write-wins

## UI Safety Patterns

For destructive operations (delete, restore, reset, clear):
- Always show a confirmation dialog with clear consequences
- Use `AlertDialog` from shadcn/ui for consistency
- Include the item name/details in the confirmation message
- Use destructive variant styling for delete buttons

For file uploads:
- Enforce size limits (e.g., `MAX_BACKUP_SIZE = 100MB` in `lib/data/utils.ts`)
- Validate file types before processing
- Return appropriate HTTP status codes (413 for payload too large)

When removing UI features:
- Also remove the corresponding API route to avoid dead code
- Clean up any shared utilities that become unused

## Security Patterns

### Encryption
- **Algorithm**: AES-256-CBC for token and credential storage
- **Key Derivation**: Machine-derived from `os.hostname()` + `os.userInfo().username`, or `SYNC_ENCRYPTION_KEY` env var
- **IV**: Random 16-byte IV per encryption operation

### Input Sanitization
- Google Drive IDs: Strip non-alphanumeric except `-_` before use in queries
- Filenames in Drive queries: Escape single quotes to prevent injection

### API Security
- **OAuth scopes**: Request minimum necessary (`drive.file` by default)
- **supportsAllDrives**: Required for accessing files shared from other accounts
- **Retry logic**: Exponential backoff for transient errors (429, 5xx)

### Hashing
- Database integrity: SHA-256 for detecting local changes since last sync

### Rate Limiting
Authentication endpoints use in-memory rate limiting (`lib/auth/rate-limit.ts`):

| Endpoint | Max Attempts | Window | Lockout |
|----------|-------------|--------|---------|
| Login | 5 | 15 min | 15 min |
| Change PIN | 5 | 15 min | 15 min |
| Reset | 3 | 1 hour | 1 hour |

Usage pattern:
```typescript
import { checkRateLimit, recordAttempt, clearAttempts, getClientIp, AUTH_RATE_LIMITS } from '@/lib/auth';

const clientIp = getClientIp(request.headers);
const rateLimitKey = `action:${clientIp}`;
const rateLimit = checkRateLimit(rateLimitKey, AUTH_RATE_LIMITS.login);

if (!rateLimit.allowed) {
  return NextResponse.json({ error: rateLimit.message }, { status: 429 });
}

recordAttempt(rateLimitKey);  // Before verification
// ... verify credentials ...
clearAttempts(rateLimitKey);  // On success
```

**Note:** Rate limit state is in-memory and resets on server restart. For production with multiple instances, consider Redis.
