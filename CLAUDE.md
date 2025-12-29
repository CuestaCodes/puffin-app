# Puffin - Project Guide

## Overview

**Puffin** (Personal Understanding & Forecasting of FINances) is a locally-hosted personal budgeting application for tracking expenses, categorising transactions, and monitoring spending against budgets.

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
  services/    # Tauri client-side service layer (static export mode)
    handlers/  # API route handler implementations for Tauri
  sync/        # Google Drive sync (OAuth, encryption, Drive API)
types/         # TypeScript type definitions
data/          # SQLite database file (development)
src-tauri/     # Tauri Rust backend (desktop packaging)
scripts/       # Build scripts (build-static.js)
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

Runtime detection via `window.__TAURI__` or `window.__TAURI_INTERNALS__`.

**Tauri Version Detection:**
```typescript
// ✅ CORRECT - Works with both Tauri 1.x and 2.x
const isTauri = typeof window !== 'undefined' &&
  (window.__TAURI__ || window.__TAURI_INTERNALS__);

// ❌ WRONG - Only works with Tauri 1.x
const isTauri = !!window.__TAURI__;
```
Tauri 2.x uses `__TAURI_INTERNALS__` instead of `__TAURI__`. Always check for both to ensure compatibility.

### Tauri Service Layer

For Tauri static export mode (no server), API routes are replaced by a client-side service layer.

**CRITICAL**: All components MUST use the `api` client from `@/lib/services` instead of `fetch()`:

```typescript
// ❌ WRONG - breaks in Tauri static export
const response = await fetch('/api/transactions');

// ✅ CORRECT - works in both dev and Tauri modes
import { api } from '@/lib/services';
const result = await api.get('/api/transactions');
```

| File | Purpose |
|------|---------|
| `lib/services/tauri-db.ts` | Client-side SQLite via @tauri-apps/plugin-sql |
| `lib/services/api-client.ts` | Routes requests based on environment |
| `lib/services/handlers/*` | Handler implementations mirroring API routes |

**Request Flow:**
- **Development**: `api.get('/api/...')` → fetch → Next.js API routes → better-sqlite3
- **Tauri Static**: `api.get('/api/...')` → api-client → handlers → tauri-db

**Checklist when adding/modifying components:**
- [ ] Uses `api.get()`, `api.post()`, `api.patch()`, `api.del()` instead of `fetch()`
- [ ] Handles `result.data` and `result.error` from ApiResponse type
- [ ] Handler exists in `lib/services/handlers/` for new endpoints

**Adding New Handlers:**
1. Create handler in `lib/services/handlers/` (mirror API route logic)
2. Register in `lib/services/handlers/index.ts`
3. Use `tauri-db` functions instead of `lib/db/` imports

### Tauri Capabilities

Permissions are configured in `src-tauri/capabilities/default.json`. Key permissions:

| Permission | Purpose |
|------------|---------|
| `sql:*` | Database operations via tauri-plugin-sql |
| `fs:allow-copy-file` | Copy files (needed for backup restore) |
| `fs:scope-appdata-recursive` | Access to app data directory |
| `dialog:allow-open` | Native file picker dialogs |
| `dialog:allow-save` | Native save dialogs |

**Extended Scopes for User Files:**
When accessing files outside AppData (e.g., user-selected backups from Downloads), add scoped permissions:
```json
{
  "identifier": "fs:allow-copy-file",
  "allow": [{ "path": "$DOWNLOAD/**" }, { "path": "$DOCUMENT/**" }, { "path": "$HOME/**" }]
}
```

**CSP Configuration:**
The Content Security Policy in `src-tauri/tauri.conf.json` must include `ipc: http://ipc.localhost` for Tauri IPC to work.

When integrating external APIs (e.g., Google Picker), update CSP directives:
```json
"security": {
  "csp": "default-src 'self'; script-src 'self' https://apis.google.com; style-src 'self' 'unsafe-inline'; connect-src 'self' ipc: http://ipc.localhost https://accounts.google.com https://*.googleapis.com; frame-src https://docs.google.com https://drive.google.com"
}
```

| Directive | Purpose |
|-----------|---------|
| `script-src` | External JavaScript (e.g., Google API loader) |
| `connect-src` | XHR/fetch destinations (e.g., OAuth endpoints) |
| `frame-src` | Embedded iframes (e.g., Google Picker UI) |

**Handler-API Parity Checklist:**
- [ ] Response shape matches API route exactly (same field names, nesting)
- [ ] Query param names match (e.g., `summary` not `includeSummary`)
- [ ] Column names match schema (e.g., `is_split` not `is_split_parent`)
- [ ] Pagination responses include: `total`, `page`, `limit`, `totalPages`
- [ ] Test both dev mode (API routes) and Tauri mode (handlers) with same inputs

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
| NetWorthEntry | Point-in-time snapshots of assets, liabilities, and net worth |
| SyncLog | Google Drive sync history |

**Primary Key Convention:**
All tables use `TEXT PRIMARY KEY` with UUID values (generated via `crypto.randomUUID()`), not auto-increment integers. TypeScript interfaces must use `id: string`.

**Note:** Authentication uses a 6-digit numeric PIN (not passwords). Validation schemas use PIN terminology (`setupPinSchema`, `loginPinSchema`) with backward-compatible aliases (`setupPasswordSchema`, `loginSchema`).

### Auth API Field Names

The validation schemas use legacy field names for backward compatibility:

| UI Concept | API Field Name | Notes |
|------------|----------------|-------|
| PIN | `password` | 6-digit numeric string |
| Confirm PIN | `confirmPassword` | Must match `password` |
| Current PIN | `currentPin` OR `currentPassword` | change-password accepts both |
| New PIN | `newPin` OR `newPassword` | change-password accepts both |

**Example - Setup endpoint expects this field name:**
```typescript
{ password: "123456", confirmPassword: "123456" }  // ✅ Correct field names
```

**Common mistake:**
```typescript
{ pin: "123456" }  // ❌ Wrong field name - causes 400 validation error
```

### Transaction Table Key Columns
| Column | Purpose |
|--------|---------|
| `sub_category_id` | FK to sub_category (not `category_id`) |
| `parent_transaction_id` | FK to parent for split children (not `split_from`) |
| `is_split` | Boolean flag for split parent transactions (1 = is a split parent) |
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

**OAuth Loopback Server (Tauri Desktop):**
- In Tauri mode, OAuth uses a temporary local HTTP server for the callback
- The `start_oauth_flow` Tauri command starts a server on `http://127.0.0.1:<port>` (dynamic port)
- OAuth flow: App starts local server → Opens browser → User authenticates → Google redirects to localhost → Server receives code → App exchanges code for tokens
- **Google Cloud Console Setup Required**: Add `http://127.0.0.1` as an authorized redirect URI in your OAuth client settings (no port needed - Google allows any port with loopback addresses)

## Key Commands

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run test       # Run Vitest tests
npm run lint       # ESLint check

# Tauri desktop app
npm run tauri:dev      # Run in Tauri shell with dev tools
npm run tauri:build    # Build portable Windows .exe
npm run build:static   # Build static export for Tauri (moves API routes temporarily)
```

### Platform-Specific Builds

**WSL Development Caveat:**
- Native modules (lightningcss, rollup) are platform-specific
- If `node_modules` was installed on Windows, WSL builds will fail
- If `node_modules` was installed on WSL, Windows builds will fail
- **Solution**: Run `npm ci` on the target platform before building
- Pre-commit hooks may fail on WSL with Windows-installed modules; use `git commit --no-verify` when necessary

**Tauri Build Requirements:**
- Tauri desktop builds MUST be run from Windows PowerShell (not WSL)
- Run `npm ci && npm run tauri:build` from Windows for Windows executables

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

## Import Formats

### CSV Import
Standard CSV with configurable column mapping. Supports date format auto-detection.

### PDF Paste Import
For copying transaction tables directly from PDF bank statements. Located in `lib/paste/parser.ts`.

**Expected Column Structures:**
| Format | Columns | Notes |
|--------|---------|-------|
| 5-column | Date, Description, Debit, Credit, Balance | Common AU bank format |
| 4-column | Date, Description, Amount, Balance | Single amount column |
| 3-column | Date, Description, Amount | Minimal format |

**Parser Features:**
- Extracts trailing amounts from combined cells (e.g., `"TRANSFER ABC123 1,427.00 52,243.23"` → Description + Amount + Balance)
- Merges multi-line descriptions from PDF text wrapping
- Detects date patterns: `DD/MM/YYYY`, `YYYY-MM-DD`, `6 Dec 25`, etc.
- Handles amount formats: `1,234.56`, `-$100.00`, `(500.00)`, `100.00 DR/CR`

**Column Mapping Modes:**
- **Single Column**: One amount column; user toggles expense/income globally or per-row in preview
- **Separate Columns**: Distinct Debit (→ negative) and Credit (→ positive) columns for tabbed data

**Key Functions:**
| Function | Purpose |
|----------|---------|
| `parsePastedText()` | Main entry point - splits lines, extracts columns |
| `splitAmountsInLastCell()` | Extracts trailing amounts from text+amount cells |
| `detectPasteColumnMapping()` | Auto-detects Date, Description, Amount columns |
| `parseAmount()` | Converts amount strings to numbers with sign handling |

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

**OAuth Scope Matching:**
When checking granted OAuth scopes, use exact array matching, not substring matching:
```typescript
// ✅ CORRECT - Exact match prevents false positives
const grantedScopes = (tokens.scope || '').split(' ');
const hasFullDrive = grantedScopes.includes('https://www.googleapis.com/auth/drive');

// ❌ WRONG - 'drive.file' would match 'drive' substring
const hasFullDrive = tokens.scope.includes('drive');

// ❌ WRONG - Trailing space is fragile
const hasFullDrive = tokens.scope.includes('https://www.googleapis.com/auth/drive ');
```

## Important Notes

- All data stays local; sync to Google Drive is manual and optional
- Single-user model per installation (no concurrent access)
- Local backup created before every sync operation
- Conflict resolution: last-write-wins

### Logging Practices

- **Debug logs**: Remove before committing
  ```typescript
  // ❌ Remove before commit
  console.log('Request:', endpoint);
  ```

- **Error logging**: Keep for unexpected failures
  ```typescript
  // ✅ Keep - helps diagnose production issues
  console.error('Handler failed:', error);
  ```

- **Operational logs for complex flows**: Acceptable during stabilization of new features (e.g., backup restore, sync). Use `[Module]` prefix and remove once the feature is stable:
  ```typescript
  // ⚠️ OK temporarily - remove once feature is stable
  console.log('[Import] Copying backup file...');
  ```

## UI Safety Patterns

### Destructive Operations
For destructive operations (delete, restore, reset, clear):
- Always show a confirmation dialog with clear consequences
- Use `AlertDialog` from shadcn/ui for consistency
- Include the item name/details in the confirmation message
- Use destructive variant styling for delete buttons

### Modal Completion
Success callbacks (`onComplete`, `onSuccess`) should ALWAYS close the modal:
```typescript
const handleImportComplete = (result: ImportResult) => {
  if (result.imported > 0) {
    fetchData();  // Refresh data
  }
  setShowModal(false);  // ✅ ALWAYS close the modal
};
```
**Common mistake:** Only refreshing data without closing the modal.

### Bulk Actions
Per-row actions on a selected item should operate on ALL selected items:
```typescript
const handleDeleteRow = (item: Item) => {
  // If this item is selected and multiple items are selected, do bulk delete
  if (selectedIds.has(item.id) && selectedIds.size > 1) {
    handleBulkDelete();
  } else {
    deleteSingleItem(item);
  }
};
```
This prevents user confusion when they select multiple items then click an action on one of them.

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
