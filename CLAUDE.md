# Puffin - Project Guide

## Overview

**Puffin** (Personal Understanding & Forecasting of FINances) is a locally-hosted personal budgeting app with local SQLite database, optional Google Drive sync, and Tauri desktop packaging.

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 14+ with App Router |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Components | shadcn/ui (Radix primitives) |
| Database | SQLite (better-sqlite3 dev, tauri-plugin-sql packaged) |
| Desktop | Tauri 2.x |
| Testing | Vitest |

## Project Structure

```
app/           # Next.js App Router pages and API routes
components/    # React UI components
lib/           # Utilities, database layer, validations
  db/          # Database operations and abstraction
  services/    # Tauri client-side service layer
    handlers/  # API route handler implementations for Tauri
  sync/        # Google Drive sync (OAuth, encryption)
types/         # TypeScript type definitions
src-tauri/     # Tauri Rust backend
tasks/         # Feature specification documents
```

### CategorySelector Context

`CategorySelector` requires `CategoryProvider` context. Pages already wrapped: `transactions.tsx`, `monthly-budget.tsx`, `rules-management.tsx`.

## Key Conventions

### Amount Signs
- **Negative** = Expense, **Positive** = Income

### Category System
Two-tier: Upper Categories (fixed) → Sub-categories (user-defined). Transfer excluded from reports.

### Soft Delete
Transactions and sub-categories use `is_deleted` flag. Always filter in JOINs:
```sql
SELECT ... FROM budget b
JOIN sub_category sc ON sc.id = b.sub_category_id
WHERE sc.is_deleted = 0
```

### Database Abstraction
Runtime detection: `window.__TAURI__ || window.__TAURI_INTERNALS__` (check both for Tauri 2.x compatibility).

### Tauri Service Layer

**CRITICAL**: Use `api` client from `@/lib/services`, never `fetch()`:
```typescript
import { api } from '@/lib/services';
const result = await api.get('/api/transactions');
```

**Request Flow:**
- **Dev**: api → fetch → Next.js API routes → better-sqlite3
- **Tauri**: api → api-client → handlers → tauri-db

**Adding endpoints:** Create both `app/api/<endpoint>/route.ts` AND `lib/services/handlers/<endpoint>.ts`.

**Handler-API Parity:**
- Response shape must match exactly
- Query param names must match
- SQL logic must match (same filters, JOINs, aggregations)
- Test both modes with same inputs

**Type Location:** Define shared types in `types/` folder, never import from API route files (unavailable in static builds).

**Tauri DB Functions:**
| Function | Returns | Notes |
|----------|---------|-------|
| `query<T>(sql, params)` | `T[]` | Pass row type, not array |
| `queryOne<T>(sql, params)` | `T \| null` | Single row |
| `execute(sql, params)` | `{ changes, lastInsertRowId }` | Use `.changes` not `.rowsAffected` |

**API Client Methods:** `api.get()`, `api.post()`, `api.patch()`, `api.delete()` (not `api.del`).

### Database Connection
- `getDatabase()` - Get connection
- `closeDatabase()` - Close only
- `resetDatabaseConnection()` - Close + reset init flag (use after DB replacement)

### SQLite WAL Mode
Before reading/copying DB file: `db.pragma('wal_checkpoint(TRUNCATE)')`.

### Schema Migrations
When adding migrations to `tauri-db.ts`, also update `CURRENT_SCHEMA_VERSION` constant.

## Data Models

| Model | Purpose |
|-------|---------|
| LocalUser | PIN authentication (6-digit, bcrypt/PBKDF2 hashed) |
| Transaction | Financial transactions with soft delete |
| SubCategory | User-defined categories under upper categories |
| Budget | Monthly budget amounts per sub-category |
| AutoCategoryRule | Rules for automatic categorisation |
| NetWorthEntry | Point-in-time asset/liability snapshots |
| Note | Financial planning notes and reminders |

**Primary Keys:** TEXT with UUID (`crypto.randomUUID()`), not auto-increment.

**Shared Types:** Import from `types/database.ts`, don't redefine locally.

### Auth API Field Names
| UI | API Field |
|----|-----------|
| PIN | `password` |
| Confirm PIN | `confirmPassword` |
| Current PIN | `currentPin` OR `currentPassword` |

### Transaction Table Columns
| Column | Purpose |
|--------|---------|
| `sub_category_id` | FK to sub_category |
| `parent_transaction_id` | FK for split children |
| `is_split` | 1 = split parent |
| `is_deleted` | Soft delete flag |
| `import_batch_id` | Groups transactions from same import |

**is_split usage:** Filter `is_split = 0` for CALCULATIONS only. Show split parents (greyed) in displays.

### FK Delete Order
```sql
DELETE FROM "transaction";
DELETE FROM budget;
DELETE FROM auto_category_rule;
DELETE FROM sub_category;
DELETE FROM source;
DELETE FROM local_user;
DELETE FROM sync_log;
DELETE FROM net_worth_entry;
DELETE FROM note;
```

## Sync

### Storage
| File | Purpose |
|------|---------|
| `sync-config.json` | Folder ID, last sync time, DB hash |
| `.sync-tokens.enc` | OAuth tokens (AES-256-CBC) |
| `.sync-credentials.enc` | Google credentials (AES-256-CBC) |

### Change Detection
- **Local:** SHA-256 hash comparison against `syncedDbHash`
- **Cloud:** Timestamp with 5s buffer for clock skew

### Device-Specific Data
`local_user` and `sync_log` are NOT synced. **CRITICAL:** Sync pull must save/restore `local_user` to prevent lockout.

### Session Tracking (Tauri)
`SESSION_ID` + `LAST_MODIFY_SESSION_KEY` in localStorage blocks edits when local_only changes exist from previous session.

## Commands

```bash
npm run dev          # Dev server
npm run test         # Vitest
npm run lint         # ESLint
npm run tauri:dev    # Tauri with devtools
npm run tauri:build  # Build .exe (run from Windows PowerShell)
npm run build:static # Static export (moves API routes temporarily)
```

**Static Build:** If API routes missing, run `git restore app/api/`.

**WSL:** Run `npm ci` on target platform before building (native modules are platform-specific).

### Slash Commands
| Command | Purpose |
|---------|---------|
| `/dev` | 7-phase workflow for tasks in `/tasks` |
| `/code-review <base> <feature>` | Code review between git refs |
| `/reflection` | Suggest CLAUDE.md improvements |

## Releases

1. Move `[Unreleased]` to version header in CHANGELOG.md
2. Bump version in `package.json` and `src-tauri/tauri.conf.json`
3. Tag and push: `git tag v1.x.0 && git push origin main --tags`
4. GitHub Actions creates draft release

## Import

### CSV
Configurable column mapping with date format auto-detection.

### PDF Paste
`lib/paste/parser.ts` - Extracts columns from pasted bank statement tables.

### Optional Columns
Add to: `types/import.ts` → `lib/validations.ts` → UI components → preview table.

### Limits
Define in `lib/validations.ts`, import everywhere: `MAX_IMPORT_TRANSACTIONS = 5000`.

## Testing

- Vitest for unit/integration tests (`*.test.ts` alongside source)
- No `@testing-library/react` - skip UI component tests
- Focus on: database ops, calculations, sync logic
- Use shared helpers from `lib/db/test-utils.ts`

**Vitest imports:** Always import all needed: `describe, it, expect, vi, beforeEach, afterEach`.

## Code Style

### Unused Variables
Prefix with underscore: `const [a, b, _c] = items;`

### Catch Blocks
Omit error param if unused: `catch { console.warn('failed'); }`

### Logging
- Remove debug logs before commit
- Keep error logs for unexpected failures

## UI Patterns

### Components
Use shadcn/ui components (Checkbox, Select, Button), not native HTML elements.

### Destructive Operations
- Use `AlertDialog` for confirmations (never `window.confirm()` - breaks in Tauri)
- Include item details in confirmation message

### Toasts
```typescript
import { toast } from 'sonner';
toast.success('Saved');
toast.error('Failed', { description: 'Details...' });
```

### Modals
Success callbacks MUST close the modal: `setShowModal(false)`.

### Bulk Actions
Per-row action on selected item should operate on ALL selected items.

### Debouncing
Always debounce API calls triggered by user input (300ms typical).

### Scroll Preservation
Use `withScrollPreservation()` from `lib/utils.ts` when refreshing lists.

### Popover in Dialog
Add `onWheel={(e) => e.stopPropagation()}` to scrollable content inside dialogs.

### Dialog Width
Override `sm:` breakpoint: `className="w-[95vw] max-w-[1400px] sm:max-w-[1400px]"`.

### Nested Overlays
Don't nest Popover inside Popover - use Dialog instead.

### Calendar Caption
Custom caption elements need `relative z-20` to be clickable above nav overlay.

### Responsive Breakpoints
Tauri min window: 800×600. Use `lg:` (1024px) not `md:` (768px) for breakpoints.

### Hook Order
Define `useCallback` before `useEffect` that uses it.

### Null Comparison
Guard optional ID checks: `editingId !== null && editingId === item.id`.

### Derive from Props
Prefer deriving values from props over useState + useEffect sync.

### Accessibility
- Icon-only buttons MUST have `aria-label`
- Checkboxes with labels: add `aria-label` as fallback

## Security

### Encryption
AES-256-CBC with machine-derived key or `SYNC_ENCRYPTION_KEY` env var.

### Input Sanitization
- Strip non-alphanumeric from Drive IDs (except `-_`)
- Escape single quotes in Drive filename queries

### Rate Limiting
| Endpoint | Attempts | Window |
|----------|----------|--------|
| Login | 5 | 15 min |
| Change PIN | 5 | 15 min |
| Reset | 3 | 1 hour |

Dev: in-memory (`lib/auth/rate-limit.ts`). Tauri: localStorage-based.

## Tauri Capabilities

Key permissions in `src-tauri/capabilities/default.json`:
- `sql:*` - Database ops
- `fs:allow-copy-file` - Backup restore
- `dialog:allow-open/save` - File pickers

**Debugging:** Permission errors include the required identifier.

## Performance

### Batch Queries
Load all data in 2 queries + process in memory, not N queries per item:
```typescript
const rules = db.query('SELECT * FROM auto_category_rule');
const txns = db.query('SELECT description FROM transaction WHERE is_deleted = 0');
// Process in memory instead of N queries
```

## Important Notes

- All data local; Google Drive sync is manual/optional
- Single-user model per installation
- Local backup created before every sync
- Conflict resolution: last-write-wins
