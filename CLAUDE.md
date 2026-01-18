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
  rules/       # Auto-categorization rule components (RuleDialog)
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
tasks/         # Feature specification documents (implementation checklists)
.claude/       # Claude Code configuration and custom commands
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

**Sub-categories also use soft delete.** When querying tables that JOIN or reference `sub_category`, always filter out deleted categories:
```typescript
// ✅ CORRECT - Filter deleted categories in joins
SELECT ... FROM budget b
JOIN sub_category sc ON sc.id = b.sub_category_id
WHERE sc.is_deleted = 0  -- Don't forget this!

// ❌ WRONG - May return budgets for deleted categories
SELECT ... FROM budget b
JOIN sub_category sc ON sc.id = b.sub_category_id
```
Also wrap operations that create records referencing sub-categories in try-catch to handle race conditions where a category is deleted mid-operation.

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

**Tauri DB Select Generic:**
The `select<T>()` method returns `Promise<T[]>`, so pass the row type, not an array:
```typescript
// ✅ CORRECT - select returns T[]
const rows = await db.select<LocalUserRow>('SELECT * FROM local_user');

// ❌ WRONG - returns LocalUserRow[][] (array of arrays)
const rows = await db.select<LocalUserRow[]>('SELECT * FROM local_user');
```

**Reset/Clear Operations in Tauri Mode:**
When implementing reset or clear functionality in handlers, remember to clean up:
- Database tables (via SQL)
- Backup files in `appDataDir()/backups/`
- Sync-related localStorage keys (`puffin_sync_*`)
- Any encrypted config files (`.sync-*.enc`, `sync-config.json`)

### Tauri Capabilities

Permissions are configured in `src-tauri/capabilities/default.json`. Key permissions:

| Permission | Purpose |
|------------|---------|
| `sql:*` | Database operations via tauri-plugin-sql |
| `fs:allow-copy-file` | Copy files (needed for backup restore) |
| `fs:scope-appdata-recursive` | Access to app data directory |
| `dialog:allow-open` | Native file picker dialogs |
| `dialog:allow-save` | Native save dialogs |
| `core:window:allow-destroy` | Programmatic window close (for sync modal) |

**Debugging Permission Errors:**
If a Tauri API call fails with "not allowed" error, check `src-tauri/capabilities/default.json` for the required permission. The error message includes the permission identifier needed.

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

**CRITICAL - Dual Update Requirement:**
When adding or modifying endpoint functionality, you MUST update BOTH files in parallel:
1. `app/api/<endpoint>/route.ts` - Next.js API route (dev mode)
2. `lib/services/handlers/<endpoint>.ts` - Tauri handler (packaged mode)

Updating only the handler breaks development mode. Updating only the API route breaks the packaged app. This is a common source of bugs caught in code review.

**Handler-API Parity Checklist:**
- [ ] **Both files updated** for any new parameter, action, or response change
- [ ] Response shape matches exactly (same field names, nesting)
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
| LocalUser | Single-row table for local PIN authentication (6-digit PIN, hashed with bcrypt in dev mode or PBKDF2 in Tauri mode) |
| Transaction | Financial transactions with soft delete support |
| UpperCategory | Top-level category groups |
| SubCategory | User-defined categories under upper categories |
| Budget | Monthly budget amounts per sub-category |
| AutoCategoryRule | Rules for automatic transaction categorisation |
| NetWorthEntry | Point-in-time snapshots of assets, liabilities, and net worth |
| SyncLog | Google Drive sync history |

**Primary Key Convention:**
All tables use `TEXT PRIMARY KEY` with UUID values (generated via `crypto.randomUUID()`), not auto-increment integers. TypeScript interfaces must use `id: string`.

**Shared Type Definitions:**
Before defining new interfaces, check `types/database.ts` for existing types. All database model interfaces (`LocalUser`, `Transaction`, `SubCategory`, etc.) are defined there and should be imported rather than redefined locally. This prevents type drift and duplication.

```typescript
// ✅ CORRECT - Import shared type
import type { LocalUser } from '@/types/database';

// ❌ WRONG - Redefining existing type locally
interface LocalUserRow {
  id: string;
  password_hash: string;
  // ...
}
```

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

### Database Delete Order (Foreign Keys)
When deleting all data (reset), tables must be deleted in order respecting FK constraints:
```typescript
// ✅ CORRECT ORDER - delete referencing tables first
await db.execute('DELETE FROM "transaction"');     // references sub_category, source
await db.execute('DELETE FROM budget');            // references sub_category
await db.execute('DELETE FROM auto_category_rule'); // references sub_category
await db.execute('DELETE FROM sub_category');      // now safe
await db.execute('DELETE FROM source');            // now safe
await db.execute('DELETE FROM local_user');
await db.execute('DELETE FROM sync_log');
await db.execute('DELETE FROM net_worth_entry');
```
**Common mistake:** Deleting `sub_category` before `budget` or `auto_category_rule` causes FK constraint error.

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

**Local Change Detection:**
- Database is hashed (SHA-256) after each successful sync
- Hash stored in `sync-config.json` as `syncedDbHash`
- On sync check, current DB hash is compared to stored hash
- Hash mismatch = local changes since last sync

**Cloud Change Detection:**
Timestamp is the primary signal for detecting cloud changes:
```typescript
const CLOCK_SKEW_BUFFER_MS = 5000; // 5 second buffer

if (cloudModifiedTime <= lastSyncTime + CLOCK_SKEW_BUFFER_MS) {
  hasCloudChanges = false;  // Cloud not modified since our last sync
} else {
  hasCloudChanges = true;   // Cloud is newer - assume changes
}
```

**Why timestamp over hash?**
- v1.0 pushes update file content but NOT the description metadata (which stores hash)
- After a pull, the cloud's hash (from pusher) won't match local hash (which includes local_user restoration)
- Google Drive's `modifiedTime` is reliable - if newer than last sync, content changed

**Buffer rationale:** 5 seconds accounts for clock skew between local machine and Google servers.

**Device-Specific vs Synced Data:**
When implementing sync operations, preserve device-specific tables:

| Table | Synced? | Reason |
|-------|---------|--------|
| `local_user` | NO | Each device maintains its own PIN independently |
| `transaction` | YES | Core financial data |
| `sub_category` | YES | User-defined categories |
| `budget` | YES | Budget amounts |
| `auto_category_rule` | YES | Categorization rules |
| `source` | YES | Bank/account sources |
| `net_worth_entry` | YES | Net worth snapshots |
| `sync_log` | NO | Device-specific sync history |

**CRITICAL:** Sync pull must save and restore `local_user` before/after replacing the database file. Otherwise, users get locked out when the cloud backup has a different PIN from their local device.

**Session Tracking (Tauri-only):**
The Tauri handler tracks which app session last modified the database using:
- `SESSION_ID`: Generated on module load, unique per app instance
- `LAST_MODIFY_SESSION_KEY`: localStorage key storing the session that last wrote data

This enables blocking edits when `local_only` changes exist from a **previous** app session (user closed without syncing). The API routes (dev mode) don't have this - `canEdit` is always `true` for `local_only` in dev mode.

**Multi-Version Compatibility:**
When modifying sync logic, consider backward compatibility with previous versions:
- v1.0 doesn't store hash in Drive file description
- v1.0 doesn't update description when pushing (only file content)
- New versions must use timestamp fallback to detect v1.0 pushes

Test sync between different versions before releasing breaking changes.

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

**Static Build Warning:**
`npm run build:static` temporarily moves `app/api/` to `app/_api_backup/` during the build. If editing API routes fails with "file not found", the static build may have run. Restore with:
```bash
# Preferred - restore from git (works even with permission issues)
git restore app/api/

# Alternative - move backup folder back
mv app/_api_backup app/api
```
After restoring, delete the backup folder if it still exists: `rm -rf app/_api_backup`

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

### Claude Code Slash Commands

Custom commands in `.claude/commands/`:

| Command | Purpose |
|---------|---------|
| `/dev` | Systematically work through feature tasks in `/tasks` folder with 7-phase workflow (discovery, implementation, manual testing, automated testing, code review, reflection, release). Supports fast-track for trivial fixes. |
| `/code-review <base> <feature>` | Run comprehensive code review comparing two git refs (branches or commits) |
| `/reflection <base> <feature>` | Analyze session and suggest improvements to CLAUDE.md instructions |

**Workflow:**
1. After implementing a feature, run `/code-review main feature-branch` to identify issues
2. Address any Critical/Major issues found
3. Run `/reflection` to capture learnings and update documentation

**Code Review Output:**
- High-level summary (product impact, engineering approach)
- Prioritized issues: Critical → Major → Minor → Enhancement
- Highlights of well-implemented patterns

## Releases

### GitHub Actions Workflow
The release workflow (`.github/workflows/release.yml`) automatically builds and creates GitHub releases.

**Triggers:**
- Push a tag matching `v*` (e.g., `v1.1.0`)
- Manual dispatch via GitHub Actions UI (with version input)

**What it does:**
1. Extracts release notes from `CHANGELOG.md` for the tagged version
2. Falls back to `[Unreleased]` section if version not found
3. Builds Tauri app for Windows (x86_64-pc-windows-msvc)
4. Creates a draft GitHub release with changelog + installation instructions

### CHANGELOG Format
The workflow expects [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [Unreleased]

### Added
- New feature description

### Fixed
- Bug fix description

## [1.0.0] - 2025-01-12

### Added
- Previous release features
```

**Section headers:** `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`, `Improved`

### Release Checklist
1. Move `[Unreleased]` content to new version header:
   ```markdown
   ## [1.1.0] - 2025-01-15
   ```
2. Bump version in `package.json` and `src-tauri/tauri.conf.json`
3. Commit: `git commit -m "Release v1.1.0"`
4. Tag and push:
   ```bash
   git tag v1.1.0
   git push origin main --tags
   ```
5. GitHub Actions builds and creates draft release
6. Review draft release on GitHub, then publish

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

### Adding Optional Import Columns

When adding new optional columns to CSV import (e.g., Notes, Tags), follow this pattern:

1. **Type Definition** (`types/import.ts`):
   ```typescript
   export interface ColumnMapping {
     // ... required fields
     notes?: number;  // Optional column index
   }

   export interface ParsedRow {
     parsed: {
       // ... required fields
       notes: string | null;  // Parsed value
     };
   }
   ```

2. **Validation Schema** (`lib/validations.ts`):
   ```typescript
   export const IMPORT_NOTES_MAX_LENGTH = 250;  // Truncation limit

   export const columnMappingSchema = z.object({
     // ... required fields
     notes: z.number().int().min(0).optional(),
   });
   ```

3. **UI Toggle** (`components/import/column-mapping.tsx`):
   - Add checkbox with `aria-label` for accessibility
   - Use PropSync pattern to sync toggle state with mapping prop
   - Conditionally show column selector when enabled

4. **Processing** (`components/import/import-wizard.tsx`):
   - Check if column is mapped: `columnMapping.notes !== undefined && columnMapping.notes >= 0`
   - Truncate values if needed: `rawNotes.substring(0, IMPORT_NOTES_MAX_LENGTH)`
   - Pass to transaction creation

5. **Preview Table** (`components/import/preview-table.tsx`):
   - Add `showNotes?: boolean` prop
   - Conditionally render header and cell: `{showNotes && <th>...</th>}`
   - Pass from parent: `showNotes={columnMapping.notes !== undefined && columnMapping.notes >= 0}`

6. **Tests** (`lib/validations.test.ts`):
   - Test schema accepts optional field
   - Test validation (non-negative integer)
   - Test backward compatibility (without field)

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

### UI Component Testing
`@testing-library/react` is NOT installed. UI component tests should be skipped. Focus testing efforts on:
- Database operation tests (`lib/db/*.test.ts`)
- Calculation and utility function tests
- Sync logic tests

### Test Utilities
Shared test helpers are in `lib/db/test-utils.ts`:
- `TEST_TIMESTAMP` - Fixed timestamp for deterministic tests
- `TEST_SCHEMA` - Complete database schema for in-memory test DBs
- `createTestDatabase(path)` - Creates test DB with schema
- `cleanupTestDb(db, path)` - Closes connection and deletes file

Use these instead of duplicating schema across test files.

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

## Performance Patterns

### Batch Queries for Aggregations
When computing data for many items (e.g., counts for N rules, stats for N categories), load all data in 2 queries and process in memory rather than N queries:
```typescript
// ✅ CORRECT - 2 queries, O(rules × transactions) in memory
const rules = db.query('SELECT id, match_text FROM auto_category_rule');
const transactions = db.query('SELECT description FROM transaction WHERE is_deleted = 0');

const counts = new Map<string, number>();
for (const rule of rules) {
  const matchText = rule.match_text.toLowerCase();
  counts.set(rule.id, transactions.filter(t =>
    t.description.toLowerCase().includes(matchText)
  ).length);
}

// ❌ WRONG - N queries, one per rule
for (const rule of rules) {
  const count = db.query('SELECT COUNT(*) FROM transaction WHERE description LIKE ?', rule.match_text);
  counts.set(rule.id, count);
}
```
For 100 rules and 10k transactions, batch is ~100-300ms vs N×100ms for individual queries.

## Important Notes

- All data stays local; sync to Google Drive is manual and optional
- Single-user model per installation (no concurrent access)
- Local backup created before every sync operation
- Conflict resolution: last-write-wins

### Code Style & Lint Compliance

**Unused Variables:**
Prefix intentionally unused variables with underscore to satisfy `@typescript-eslint/no-unused-vars`:
```typescript
// ✅ CORRECT - Underscore prefix for intentionally unused
const [highest, mid, _lowest] = sortedItems;
function handler(_req: Request, res: Response) { ... }

// ❌ WRONG - Lint error for unused variable
const [highest, mid, lowest] = sortedItems;  // lowest never used
```

**Catch Block Error Parameters:**
Omit the error parameter if not used:
```typescript
// ✅ CORRECT - No parameter if not used
try {
  await riskyOperation();
} catch {
  console.warn('Operation failed, using fallback');
}

// ❌ WRONG - Unused 'error' causes lint warning
try {
  await riskyOperation();
} catch (error) {
  console.warn('Operation failed, using fallback');
}

// ✅ CORRECT - Keep parameter if logging the error
try {
  await riskyOperation();
} catch (error) {
  console.error('Operation failed:', error);
}
```

**Unused Imports:**
Remove unused imports rather than commenting them out. If keeping for future use, prefix with underscore.

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

### Component Consistency
Always use shadcn/ui components instead of native HTML elements for form controls:
```typescript
// ✅ CORRECT - Use shadcn Checkbox
import { Checkbox } from '@/components/ui/checkbox';
<Checkbox checked={value} onCheckedChange={setValue} />

// ❌ WRONG - Native input breaks visual consistency
<input type="checkbox" checked={value} onChange={e => setValue(e.target.checked)} />
```
This ensures consistent styling, accessibility, and behavior across the app. The same applies to Select, Input, Button, and other form elements.

### Destructive Operations
For destructive operations (delete, restore, reset, clear):
- Always show a confirmation dialog with clear consequences
- Use `AlertDialog` from shadcn/ui for consistency
- Include the item name/details in the confirmation message
- Use destructive variant styling for delete buttons

**CRITICAL - Tauri Mode:** Never use `window.confirm()` or `window.alert()` in Tauri. These don't block execution properly in the webview, causing actions to execute immediately without waiting for user response. Always use React-based dialogs (AlertDialog).

### Toast Notifications
Use Sonner for non-blocking feedback (success messages, errors that don't require action):
```typescript
import { toast } from 'sonner';

// Success feedback
toast.success('Changes uploaded to cloud');

// Error with description
toast.error('Sync failed', {
  description: 'Please check your network connection',
});
```

**When to use toasts vs dialogs:**
- **Toast**: Non-blocking feedback (success, info, errors user can dismiss)
- **AlertDialog**: Destructive actions requiring confirmation, blocking errors

**Setup**: `<Toaster />` is rendered in `app-shell.tsx` with `position="bottom-right"`.

### Sync Conflict Resolution
The app uses a **blocking modal** pattern for sync conflicts (`SyncConflictDialog`):
- Dialog cannot be dismissed (no escape key, no click-outside, no close button)
- User MUST choose "Use Cloud" or "Use Local" before continuing
- Therefore, individual `disabled={!canEdit}` checks on buttons are **unnecessary**
- The `canEdit` flag from `useSyncContext` controls dialog visibility, not button states

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

### React Callback Closures
When callbacks depend on state that changes during async flows, they may capture stale values:
```typescript
// ❌ WRONG - pendingClose may be stale when callback executes
const handleComplete = useCallback(async () => {
  setShowModal(false);
  if (pendingClose) {  // May still be false due to closure
    await closeWindow();
  }
}, [pendingClose]);

// ✅ CORRECT - Don't depend on state that changes during the flow
const handleComplete = useCallback(async () => {
  setShowModal(false);
  await closeWindow();  // Always close - modal only shows when close was requested
}, []);
```
**Rule of thumb:** If a modal/dialog only appears in response to a specific action, the completion handler should always perform that action rather than checking state.

### Null Comparison in Optional ID Checks
When comparing optional IDs (e.g., `editingId === item.id`), remember that `null === null` is `true`:
```typescript
// ❌ WRONG - Returns true when both are null
const isEditing = editingBudgetId === category.budget_id;

// ✅ CORRECT - Guard against null comparison
const isEditing = editingBudgetId !== null && editingBudgetId === category.budget_id;
```
This is especially important for "is currently editing" checks where items may not have IDs yet.

### Deriving State from Props (Preferred)
When possible, derive values directly from props instead of maintaining separate state:
```typescript
// ✅ BEST - Derive directly from props, no state needed
function ColumnMapping({ mapping }: { mapping: Mapping }) {
  const includeNotes = mapping.notes !== undefined;
  // Use includeNotes directly - updates automatically when mapping changes
}

// ⚠️ AVOID - useState + useEffect triggers eslint set-state-in-effect error
function ColumnMapping({ mapping }: { mapping: Mapping }) {
  const [includeNotes, setIncludeNotes] = useState(mapping.notes !== undefined);
  useEffect(() => {
    setIncludeNotes(mapping.notes !== undefined);  // ❌ Lint error
  }, [mapping.notes]);
}
```

**When you must use internal state** (e.g., UI-only state like "display year" in a month picker that differs from the selected value):
```typescript
function MonthPicker({ selected }: { selected: Date }) {
  const [displayYear, setDisplayYear] = useState(selected.getFullYear());

  // This is acceptable when displayYear is UI-only state that can diverge from props
  // The lint warning can be suppressed if truly necessary
  useEffect(() => {
    setDisplayYear(selected.getFullYear());
  }, [selected]);
}
```
Prefer deriving from props. Only use useState + useEffect sync when the internal state serves a distinct UI purpose.

### Debouncing API Calls in Input Handlers
When user input triggers API calls (e.g., search-as-you-type, live preview), always debounce:
```typescript
// ✅ CORRECT - Debounce with useRef
const debounceRef = useRef<NodeJS.Timeout | null>(null);

const handleInputChange = (value: string) => {
  setValue(value);

  if (debounceRef.current) {
    clearTimeout(debounceRef.current);
  }
  debounceRef.current = setTimeout(() => {
    fetchData(value);  // API call
  }, 300);
};

// ❌ WRONG - API call on every keystroke
const handleInputChange = (value: string) => {
  setValue(value);
  fetchData(value);  // Fires on every character typed
};
```

### Scroll Position Preservation
When refreshing data that may cause re-renders, use the `withScrollPreservation` utility from `lib/utils.ts`:
```typescript
import { withScrollPreservation } from '@/lib/utils';

const handleRefresh = useCallback(async () => {
  await withScrollPreservation(async () => {
    await fetchData();
    onDataChange?.();
  });
}, [fetchData, onDataChange]);
```

The utility saves scroll position before the async operation and restores it using double `requestAnimationFrame` to ensure DOM is fully painted. Use this pattern when users interact with lists that refresh (e.g., editing, categorizing, or deleting transactions).

### Fire-and-Forget API Calls
When making API calls where you don't need to await the result, use `void` prefix and add error handling:
```typescript
// ✅ CORRECT - Explicit fire-and-forget with error handling
const closeDialog = () => {
  setOpen(false);
  void api.get('/api/data').then(result => {
    // handle result
  }).catch(err => {
    console.error('Failed to fetch:', err);
  });
};

// ❌ WRONG - Unhandled promise, no error handling
const closeDialog = () => {
  setOpen(false);
  api.get('/api/data').then(result => {
    // handle result
  });
};
```

### useCallback/useEffect Declaration Order
When a `useCallback` is used in a `useEffect` dependency array, define the callback **before** the useEffect:
```typescript
// ✅ CORRECT - Callback defined before useEffect that uses it
const fetchData = useCallback(async () => {
  // ...
}, []);

useEffect(() => {
  fetchData();
}, [fetchData]);

// ❌ WRONG - TypeScript error: "used before declaration"
useEffect(() => {
  fetchData();
}, [fetchData]);

const fetchData = useCallback(async () => {
  // ...
}, []);
```

### Accessibility: Icon-Only Buttons
Icon-only buttons (no visible text) MUST have `aria-label` for screen readers:
```typescript
// ✅ CORRECT - Accessible
<Button onClick={handlePrev} aria-label="Previous year">
  <ChevronLeft className="h-4 w-4" />
</Button>

// ❌ WRONG - Screen reader sees no label
<Button onClick={handlePrev}>
  <ChevronLeft className="h-4 w-4" />
</Button>
```

### Accessibility: Checkboxes with Labels
Checkboxes with adjacent `<label>` elements should also include `aria-label` for redundant accessibility:
```typescript
// ✅ CORRECT - Accessible with both htmlFor association and aria-label
<Checkbox
  id="include-notes"
  checked={includeNotes}
  onCheckedChange={handleToggle}
  aria-label="Include notes column in import"
/>
<label htmlFor="include-notes">Include Notes column</label>

// ⚠️ WORKS but less robust - relies only on htmlFor association
<Checkbox id="include-notes" checked={includeNotes} />
<label htmlFor="include-notes">Include Notes column</label>
```
The `aria-label` provides a fallback if the label association breaks and makes the purpose explicit to assistive technologies.

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

**Tauri Mode Rate Limiting:**
Server-side rate limiting doesn't work in Tauri (no server). The Tauri auth handler (`lib/services/handlers/auth.ts`) uses localStorage-based rate limiting instead:
```typescript
const RATE_LIMIT_KEY = 'puffin_rate_limit';
// Stores: { attempts: number, firstAttemptAt: number, lockedUntil: number | null }
```
This persists across app restarts but can be cleared by the user (acceptable trade-off for local-only app).
