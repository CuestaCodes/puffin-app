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
Two-tier: Upper Categories (fixed types, toggleable) → Sub-categories (user-defined). Transfer excluded from reports. Upper categories have an `is_active` flag — inactive uppers and their subs are excluded from analytics, budgets, and CategorySelector. Deactivating uncategorizes all transactions under that upper; reactivating restores the category but does not re-assign transactions.

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
- **When fixing a bug in one path, read the other path's equivalent function in the same
  change.** Parity is checked when endpoints are written and never again, so divergences
  accumulate silently in existing endpoints. Two sat in `budgets` for versions: the Tauri
  initialize was missing dev's `uc.is_active = 1` filter, and dev's UNIQUE-violation guard.
  Both surfaced only because the two files were read side by side.

**Upper vs Sub Category Operations:**
Category handlers must check whether an ID refers to an upper or sub-category:
```typescript
const upperCat = await getUpperCategoryById(id);
if (upperCat) return updateUpperCategory(id, data.name);
return updateSubCategory(id, data);
```

**Type Location:** Define shared types in `types/` folder, never import from API route files (unavailable in static builds).

**Tauri DB Functions:**
| Function | Returns | Notes |
|----------|---------|-------|
| `query<T>(sql, params)` | `T[]` | Pass row type, not array |
| `queryOne<T>(sql, params)` | `T \| null` | Single row |
| `execute(sql, params)` | `{ changes, lastInsertRowId }` | Use `.changes` not `.rowsAffected` |

**API Client Methods:** `api.get()`, `api.post()`, `api.patch()`, `api.delete()` (not `api.del`).

**Multi-step DB writes:** Wrap in a transaction when the writes must succeed or fail
*together* — a write plus its dependent write, or a delete-then-reinsert.

**Do NOT wrap a batch of independent writes.** A loop inserting N unrelated rows is not one
logical operation, and on the shared Tauri connection a transaction held across the whole
batch blocks every other writer until it commits — SQLite fails them with
`database is locked` (code 5). That is a worse, harder-to-diagnose failure than whatever
partial-completion the transaction was meant to prevent. Make each write individually
idempotent instead (`ON CONFLICT ... DO NOTHING`, or an upsert) and let a partial pass
self-heal on the next run. `initializeMonthlyBudgets` in `lib/services/handlers/budgets.ts`
is the worked example, including why `DO NOTHING` beats an upsert there.
- Dev (better-sqlite3): `getDatabase().transaction(() => { ... })()`
- Tauri: wrap `ROLLBACK` in its own try-catch — concurrent operations on the shared connection can invalidate the transaction:
```typescript
await db.execute('BEGIN TRANSACTION');
try {
  // ... writes ...
  await db.execute('COMMIT');
} catch (e) {
  try { await db.execute('ROLLBACK'); } catch { /* no active transaction */ }
  throw e;
}
```

### Database Connection
- `getDatabase()` - Get connection
- `closeDatabase()` - Close only
- `resetDatabaseConnection()` - Close + reset init flag (use after DB replacement)

### SQLite WAL Mode
Before reading/copying DB file: `db.pragma('wal_checkpoint(TRUNCATE)')`.

### Schema Migrations
Three files must be updated for every schema change:
1. `lib/db/schema.ts` — base schema for fresh installs
2. `lib/db/index.ts` — dev-mode migration + bump `_CURRENT_SCHEMA_VERSION`
3. `lib/services/tauri-db.ts` — Tauri migration + bump `CURRENT_SCHEMA_VERSION`

All three must produce the same final schema.

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

**Shared Types:** Import from `types/database.ts` or `lib/db/*.ts` — don't redefine interfaces locally when a canonical source exists. Local copies drift (e.g. missing fields) and bypass type-checking.

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
npm run dev          # Browser dev server (web preview only — not the shipping target)
npm run test         # Vitest
npm run lint         # ESLint
npm run tauri:dev    # Tauri desktop dev with devtools — USE THIS for verification
npm run tauri:build  # Build .exe (run from Windows PowerShell)
npm run build:static # Static export (moves API routes temporarily)
```

**Shipping target is the Windows desktop app (Tauri).** When verifying changes, the user should run `npm run tauri:dev` (opens the actual app window), not `npm run dev` (which only opens a browser and runs the Next.js code path, not the Tauri service-layer/handlers code path). Browser dev is fine for quick UI tweaks but won't exercise the Tauri DB handlers or capabilities.

**Static Build:** If API routes missing, run `git restore app/api/`.

**WSL:** Run `npm ci` on target platform before building (native modules are platform-specific).

**Dev server (for Claude):** This repo's `node_modules` is normally installed on Windows, so `npm run dev` and `npm run tauri:dev` will fail under WSL with native-module errors (`lightningcss`, `better-sqlite3`). Do NOT run any dev command or `npm ci` from WSL — instead, ask the user to start `npm run tauri:dev` (preferred) or `npm run dev` from Windows PowerShell themselves and report back. Code edits, `npm run lint` and `npx tsc --noEmit` can still be run from WSL. **`npm run test` cannot** — Vitest fails to start at all under WSL (`Cannot find module '@rollup/rollup-linux-x64-gnu'`), before reaching any test, so there is no subset that works. Write tests from WSL, then ask the user to run `npm run test` from PowerShell and report the result.

**Committing from WSL:** The husky pre-commit hook runs `npm run test`, which requires native modules (`rollup`). Since `node_modules` is Windows-installed, this fails under WSL. Use `git commit --no-verify` to skip the hook — tests should be verified from PowerShell before or after committing.

### Slash Commands
| Command | Purpose |
|---------|---------|
| `/dev` | 7-phase workflow for tasks in `/tasks` |
| `/code-review <base> <feature>` | Code review between git refs |
| `/reflection` | Suggest CLAUDE.md improvements |

## Releases

### Branch Strategy

**One integration branch per version — no per-task branches.**

- Each version's work happens on a single `vX.Y-dev` branch (e.g. `v2.3-dev`), branched off `main`.
- Tasks are worked sequentially on that branch. Each task contributes its own series of commits; there is no feature branch to create, merge, or push.
- Cut the release (tag) from `vX.Y-dev` once its task set is done, then merge to `main`.
- Task specs live in `/tasks` (one `.md` per task, following `_template.md`); `/dev` discovers them by `## Status:`/`## Priority:` headers. `tasks/` is gitignored, so specs are local-only.

### The `reviewed` Marker

A local-only branch pointer meaning **"everything up to here has passed code review."** It scopes each review to the current task's commits, instead of re-reviewing every earlier task in the version.

```bash
/code-review reviewed vX.Y-dev     # same command every task
git branch -f reviewed vX.Y-dev    # only once the task is finished
```

- **Created once** per repo; it then moves forward forever. Never checked out, never merged, **never pushed**.
- **Moved once per task**, when the task is complete — *not* after each review run. A task usually needs several runs (review → fix → re-review); the marker must stay put so the re-review still shows the original change alongside the fix, rather than only the fix commits.
- `git log reviewed..vX.Y-dev` lists everything not yet reviewed.
- **If you forget to move it**, nothing breaks — the next review is merely wider, re-showing the previous task. Move it then and it self-corrects. There is no state to repair.

Because reviews run against local refs, this workflow requires **no pushes per task**. Push `vX.Y-dev` when you want an off-machine copy, not because a tool demands it.

### Release Steps
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
- Focus on: database ops, calculations, sync logic, and shared helpers in `lib/utils.ts` that encode an environment assumption (DOM shape, platform, timing) rather than pure formatting
- Use shared helpers from `lib/db/test-utils.ts`

**Vitest imports:** Always import all needed: `describe, it, expect, vi, beforeEach, afterEach`.

**Test schemas:** `lib/db/*.test.ts` files define inline `TEST_SCHEMA` strings. When adding/changing columns, update these to match `lib/db/schema.ts`.

## Code Style

### Unused Variables
Prefix with underscore: `const [a, b, _c] = items;`

### Catch Blocks
Omit error param if unused: `catch { console.warn('failed'); }`

### Logging
- Remove debug logs before commit
- Keep error logs for unexpected failures

### Line Endings
The repo has **mixed line endings** — 37 tracked files are CRLF, the rest LF — and there
is no `.gitattributes`. A scripted whole-file rewrite (e.g. Python's text mode) silently
converts CRLF to LF, turning a small edit into a whole-file diff.

- Check `file <path>` for "CRLF line terminators" before any scripted rewrite; prefer the
  Edit tool, or read/write in binary and restore endings.
- Always sanity-check `git diff --stat` after a scripted edit. A line count far larger
  than the intended change means endings were rewritten.
- **Do not add a `.gitattributes` to "fix" this mid-task** — renormalising 37 files is a
  large diff unrelated to whatever you are working on.

### ESLint Disable Comments
When disabling ESLint rules, always explain which dependency is omitted and why:
```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally omit `filters` to avoid syncing during edits
```

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

**The app does not scroll the window.** The shell is `h-screen` and `<main>` carries
`overflow-auto` (`components/layout/app-shell.tsx`), so `window.scrollY` is always `0`
and `window.scrollTo()` is a no-op. Never read or write window scroll — go through
`withScrollPreservation()`, which resolves the real container.

This assumption being wrong once made the helper silently inert at all eight of its call
sites for its entire life: the convention was followed everywhere and did nothing. If a
scroll fix appears to have no effect, verify the container before assuming a timing bug.

**Known limitation:** the helper restores position *after* the browser has painted the
refreshed layout, so a jump-and-return flash is still visible. Tracked in
`tasks/scroll-preservation-flash.md` — don't re-diagnose it.

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

### Text Overflow & Truncation
For text that should truncate with ellipsis:
- Add `truncate` class to the text element
- Add `min-w-0` to the flex **item** that contains the truncating text — flex items default
  to `min-width: auto` and refuse to shrink below their content
- Add `shrink-0` to fixed-width siblings (prevents them from shrinking)
- Use `whitespace-nowrap` for text that must stay on one line (e.g., "(5 categories)")

```tsx
<div className="flex items-center gap-2">        {/* flex container */}
  <div className="min-w-0">                      {/* flex ITEM - min-w-0 belongs here */}
    <span className="truncate">{longCategoryName}</span>
  </div>
  <span className="shrink-0 font-mono">{amount}</span>
</div>
```

**`min-w-0` on a flex container does nothing.** It is a property of the element itself, and
only matters when that element is a flex item. The two roles often coincide — a flex item
that is itself a flex container — which is what makes this easy to get wrong. A block-level
child of a non-flex parent (e.g. a row inside `CardContent`) needs no `min-w-0` at all:
`truncate` alone works, because the block already fills and is bounded by its parent.

This was previously documented as "add `min-w-0` to flex containers", and following it
literally produced nine inert classes on tile title rows — the same failure mode as the
scroll-preservation helper below: a convention followed everywhere, doing nothing.

### Action Button Groups
When multiple action buttons overflow at narrow widths:
- **2x2 grid:** `grid grid-cols-2 gap-1` for 4 buttons
- **Separate row:** Buttons below content on narrow screens
- Always add `shrink-0` to button containers to prevent squishing

### Hook Order
Define `useCallback` before `useEffect` that uses it.

### Null Comparison
Guard optional ID checks: `editingId !== null && editingId === item.id`.

### Derive from Props
Prefer deriving values from props over useState + useEffect sync.

### Sticky Table Columns
For sticky columns that scroll horizontally, use **solid backgrounds** (not semi-transparent):
```tsx
// Good - solid background covers scrolled content
<td className="sticky left-0 bg-slate-800">...</td>

// Bad - content shows through when scrolling
<td className="sticky left-0 bg-slate-800/50">...</td>
```

### Collapsible Sections
For collapsible category/section lists, follow the pattern in `monthly-budget.tsx`:
```tsx
const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

const toggle = useCallback((key: string) => {
  setCollapsed(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
}, []);

// ChevronDown with rotation for visual indicator
<ChevronDown className={cn('w-4 h-4 transition-transform', collapsed.has(key) && '-rotate-90')} />
```

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
