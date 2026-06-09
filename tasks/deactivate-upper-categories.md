# Task: Deactivate Upper Categories

## Status: Completed

## Priority: P2-Medium

## Overview
Allow the user to toggle individual upper categories as "inactive" from Settings. Inactive upper categories (and their sub-categories) should be excluded from dashboard graphs, summary cards, and other analytic surfaces, but their historical transactions must remain intact. This is for users who no longer track certain spending areas and want to declutter visualizations without deleting data.

---

## Phase 1: Discovery & Planning

### Key Decisions Required
- [x] Decision 1: Schema column `is_active INTEGER NOT NULL DEFAULT 1` on `upper_category` — syncs naturally via Google Drive
- [x] Decision 2: Scope — ALL surfaces: dashboard tiles, charts, pie charts, monthly breakdown, monthly budget page, transaction category filters, CategorySelector
- [x] Decision 3: Hide inactive upper categories AND their sub-categories from CategorySelector — can't assign new transactions to them
- [x] Decision 4: On deactivate, uncategorize all transactions under that upper category (`sub_category_id = NULL`). Show an AlertDialog warning with affected transaction count before proceeding. Reactivating restores the upper+subs to selectors/analytics but does NOT re-assign transactions (they stay uncategorized).
- [x] Decision 5: All existing categories default to active (`is_active = 1`) on migration

### Affected Files
- `types/database.ts` — Add `is_active` to `UpperCategory` interface
- `lib/services/tauri-db.ts` — Migration 6 + bump `CURRENT_SCHEMA_VERSION` to 6
- `lib/db/categories.ts` — Return `is_active` in queries
- `app/api/categories/[id]/route.ts` — Extend PATCH to support `is_active`
- `lib/services/handlers/categories.ts` — Tauri handler parity for PATCH
- `lib/db/analytics.ts` — Extend transfer exclusion pattern to also exclude `uc.is_active = 0`
- `app/api/analytics/dashboard/route.ts` — Pass through (analytics.ts does the filtering)
- `lib/services/handlers/analytics.ts` — Same exclusion pattern as analytics.ts
- `components/settings/category-management.tsx` — Add toggle per upper category
- `components/transactions/category-selector.tsx` — Filter out inactive uppers + their subs
- `components/transactions/category-context.tsx` — Pass `is_active` through
- `components/pages/monthly-budget.tsx` — Filter inactive upper categories
- `lib/services/handlers/budgets.ts` — Exclude inactive from budget summary
- `lib/db/budgets.ts` — Same

### Database Changes
```sql
-- Migration: add is_active flag to upper_category
ALTER TABLE upper_category ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;
```

### CLAUDE.md Conventions to Follow
- [x] Bump `CURRENT_SCHEMA_VERSION` when adding migration
- [x] Update both `app/api/.../route.ts` AND `lib/services/handlers/...` (handler-API parity)
- [x] Use shadcn `Switch` or `Checkbox` for toggle UI (no native HTML)
- [x] Add `aria-label` to toggle buttons
- [x] Use `AlertDialog` if confirming deactivation has any destructive implication
- [x] Boolean column stored as INTEGER 0/1 in SQLite

---

## Phase 2: Implementation

### Requirements
- [x] Schema migration adds `is_active` column defaulting to 1
- [x] Settings page has a section listing all upper categories with a toggle each
- [x] Toggling persists via PATCH endpoint (both Next.js route + Tauri handler)
- [x] Dashboard summary tiles exclude inactive upper categories from totals
- [x] Spending Trends chart hides inactive categories
- [x] Income Sources chart hides inactive upper categories
- [x] Monthly Breakdown table hides inactive rows
- [x] (Per Decision 3) CategorySelector behavior for inactive categories
- [x] Inactive state syncs via Google Drive (column is part of DB)

### Acceptance Criteria
- [ ] User can toggle an upper category off in Settings; UI reflects state
- [ ] Toggled-off category disappears from all dashboard analytics surfaces
- [ ] Existing transactions in that category remain queryable and visible in Transactions list
- [ ] Toggling back on restores the category everywhere
- [ ] Schema version increments correctly; fresh install + upgrade both work
- [ ] No regressions in Monthly Budget, Reports, or other category-aware pages

---

## Phase 3: Manual Testing

### Test Steps
1. [ ] Open Settings → toggle off "Bills" upper category → Expected: dashboard tiles, charts, and breakdown no longer include Bills
2. [ ] Navigate to Transactions → Expected: Bills transactions still visible and editable
3. [ ] Toggle Bills back on → Expected: Bills reappears everywhere with correct totals
4. [ ] Restart app → Expected: toggled state persists
5. [ ] Trigger sync push → pull on a second device → Expected: inactive flag syncs

### Edge Cases to Verify
- [ ] Toggling off the only upper category of a given type (e.g., the only "Income" upper)
- [ ] All upper categories deactivated — dashboard should render gracefully (empty state)
- [ ] Sub-category under deactivated upper still referenced by an AutoCategoryRule
- [ ] Schema upgrade from a pre-migration DB file

---

## Phase 4: Automated Testing

### Vitest Tests Required
- [ ] `lib/services/handlers/upper-categories.test.ts` - Patch handler toggles `is_active` correctly
- [ ] `lib/services/handlers/analytics.test.ts` - Aggregations exclude inactive categories
- [ ] `lib/db/tauri-db.test.ts` - Migration adds column with default 1 on existing rows

### Test Coverage Notes
Skip UI component tests per CLAUDE.md. Focus on DB migration correctness and analytics filtering math.

---

## Phase 5: Code Review

Run `/code-review main <feature-branch>` and verify:
- [ ] No Critical issues
- [ ] No Major issues
- [ ] Minor issues addressed or documented

---

## Phase 6: Reflection

Run `/reflection` and:
- [ ] Review suggested CLAUDE.md improvements
- [ ] Apply approved changes

---

## Phase 7: Release

### CHANGELOG Entry
```markdown
### Added
- Deactivate upper categories from Settings to hide them from dashboard graphs and tiles without deleting transactions
```

### Documentation Updates
- [ ] CLAUDE.md updates (if new patterns emerged around active flag conventions)
- [ ] README updates (if user-facing feature) → likely yes

---

## Notes
User context: some upper categories are no longer relevant but the historical data should remain. The Transfer upper category is already excluded from reports — confirm whether "deactivate" should follow the same exclusion pattern as Transfer to avoid duplicating logic.
