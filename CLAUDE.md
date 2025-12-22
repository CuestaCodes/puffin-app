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
types/         # TypeScript type definitions
data/          # SQLite database file (development)
```

## TypeScript Best Practices

### Use `as const` for Literal Types
TypeScript widens types by default. Use `as const` to preserve literal types and make objects read-only. Great for config files, routes, and exact values.
```typescript
// Bad - method becomes string
const request = { method: "get", url: "/api" };

// Good - method stays as "get"
const request = { method: "get", url: "/api" } as const;
```

### Discriminated Unions
Avoid interfaces with many optional properties. Create separate interfaces sharing a common "discriminant" property to enable type narrowing in switch statements.
```typescript
// Bad - optional properties everywhere
interface ApiState { status: string; data?: User; error?: string; }

// Good - discriminated union
type ApiState =
  | { status: "loading" }
  | { status: "success"; data: User }
  | { status: "error"; error: string };
```

### Use `satisfies` Over Type Annotations
Type annotations widen types and lose specifics. `satisfies` keeps literal types while validating against a type, and provides protection against typos.
```typescript
// Bad - loses literal type
const button: ButtonConfig = { variant: "primary" };
// button.variant is "primary" | "secondary" | "muted"

// Good - keeps literal type
const button = { variant: "primary" } satisfies ButtonConfig;
// button.variant is "primary"
```

### Template Literal Types for String Patterns
Enforce string patterns at compile time for CSS units, API endpoints, etc.
```typescript
type CSSUnit = "rem" | "px" | "em";
type CSSValue = `${number}${CSSUnit}`;
// "20px" works, "20" fails
```

### Utility Types
- `Required<T>` - makes all properties required
- `Partial<T>` - makes all properties optional
- `Omit<T, K>` - removes specific properties
- `Pick<T, K>` - selects specific properties

### Common Gotchas
- **Object keys are always strings** - even `{ 1: "a" }` has string keys
- **Empty `{}` type** - accepts any non-null value, use `Record<string, never>` for truly empty objects
- **Optional chaining returns `T | undefined`** - handle undefined before accessing nested properties

## Key Conventions

### Amount Signs
- **Negative** = Expense (money going out)
- **Positive** = Income (money coming in)

### Category System
Two-tier hierarchy:
1. **Upper Categories** (fixed, renameable): Income, Expense, Saving, Bill, Debt, Transfer
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

### Test Failure Policy
**IMPORTANT:** When Vitest tests fail, do NOT automatically fix the issue or modify the test. Instead:
1. Report the failing test(s) and error message to the user
2. Explain what the test is checking and why it might be failing
3. Wait for user input on how to proceed (fix the code, update the test, or investigate further)

## Important Notes

- All data stays local; sync to Google Drive is manual and optional
- Single-user model per installation (no concurrent access)
- Local backup created before every sync operation
- Conflict resolution: last-write-wins
