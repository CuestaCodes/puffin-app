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

## Data Models

| Model | Purpose |
|-------|---------|
| LocalUser | Single-row table for local password authentication |
| Transaction | Financial transactions with soft delete support |
| UpperCategory | Top-level category groups |
| SubCategory | User-defined categories under upper categories |
| Budget | Monthly budget amounts per sub-category |
| AutoCategoryRule | Rules for automatic transaction categorisation |
| SyncLog | Google Drive sync history |

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
