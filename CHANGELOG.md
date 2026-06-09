# Changelog

All notable changes to Puffin will be documented in this file.

## [Unreleased]

## [2.2.1] - 2026-06-09

### Added
- Deactivate upper categories from Settings to hide them from dashboard analytics, budget pages, and category selector without deleting historical transactions
- Dashboard "Net Balance" tile showing income minus all outflows (spend + savings)

### Improved
- Multi-account sync description now includes setup instructions (upload, share, connect)

### Fixed
- Dashboard Y-axis now anchors at zero and auto-scales to the selected category when a legend item is pinned
- Spending Trends legend no longer overlaps month labels at narrow window widths
- Summary tile icons no longer overflow at narrow window widths
- Category deactivation no longer fails with "cannot rollback" error when sync check runs concurrently
- OAuth reconnect no longer asks for Google Cloud credentials when tokens expire — only the Google authorization step is needed, matching the original intent of the v2.2.0 reconnect flow
- Reconnect dialog can no longer be accidentally dismissed by clicking outside or pressing Escape — user must explicitly choose Dismiss or Open Sync Settings
- OAuth reconnect now restores the prior scope level (standard vs extended) so multi-account sync users aren't silently downgraded
- `isAuthenticated` flag is now cleared on `invalid_grant` so the UI accurately shows "Sign in with Google" instead of stale "connected" state

## [2.2.0] - 2026-05-08

### Added
- Duplicate-transaction button next to Edit/Delete on each transaction row. Opens the transaction form pre-filled with the source row's date, description, amount, category, and source — review and save to create a copy.
- Date pickers throughout the app now open on the currently-selected date instead of always on today.
- Currency amounts in the Monthly Budget view are now selectable so they can be copied to the clipboard (group totals, sub-category amounts, and "spent" sub-text on unbudgeted rows).
- Spending Trends chart on the Dashboard: hover any legend item to dim the other lines and isolate that trend; click to pin the highlight (click again to unpin).
- "Current: $X" quick-fill in the inline budget editor — sets the budget to this month's actual spend with one click. Sits alongside the existing 3mo/6mo averages and carry-over.
- Reconnect Google Drive flow: when an OAuth refresh token expires (Google's 7-day window for apps in Testing publishing status), a modal now offers a one-click path to re-sign in. The Sync Settings page auto-fires the Sign in with Google flow on arrival from the modal — no need to disconnect first or re-enter credentials.

### Fixed
- Drag-and-drop of CSV files onto the import drop zone now works in the Windows desktop app (Tauri was intercepting OS-level drops before they reached the page).
- Manually ticking a flagged duplicate in the import preview now actually imports it; the override checkbox was being ignored.
- Monthly Budget: a refund (positive transaction in an expense-side sub-category) now displays as a credit (e.g. `-$200 spent`) instead of as additional spending; the progress bar floors at 0% rather than going negative.
- Monthly Budget: the "Total Spent" tile now equals the sum of the visible group totals (Expenses + Savings + Bills + Debts + Sinking). It now includes unbudgeted categories with spend and treats refunds as reductions, matching the per-row display.
- Dashboard: "Total Spent" tile, "Savings" tile, Spending Trends graph, both pie charts, and the Monthly Category Totals table no longer inflate when refunds or savings withdrawals are present — refunds correctly reduce the totals.
- Pie charts now omit categories whose net is a credit for the period (e.g. refund-only) instead of showing them as positive slices.
- Empty budget rows now display as `$0.00` instead of `-$0.00`.
- Sync prompt on app close is now suppressed when there are no local changes since the last sync (was previously shown on every close).
- Dashboard pie chart labels no longer briefly disappear when interacting with the Spending Trends legend (legend hover state was triggering a re-render of unrelated charts).
- Eliminated a "setState during render" warning on initial app load that came from URL-cleanup happening inside a `useState` initializer.

### Changed
- Monthly Budget progress bars are now two-tiered: red above 105% of budget, normal (emerald/cyan) below. The amber 80–105% tier has been removed.
- Dashboard "Total Spent" now excludes Savings (savings represents money set aside, not money spent). The Savings tile and savings rate are unchanged. Monthly Budget "Total Spent" still includes Savings because that view shows a Savings group total.


### Added
- Delete button for budget templates in Monthly Budget view
- Collapsible upper categories in Dashboard Monthly Breakdown table with Collapse/Expand All button

### Fixed
- Category filter X button now correctly clears the selected category in Transactions and Monthly Budget filter dialogs

### Improved
- Page filter and sort states now persist during navigation within a session
- Template save/apply/delete notifications now use themed toast messages instead of native alerts
- Transaction search now includes notes field

## [2.0.0] - 2026-01-21

### Added
- **Notes Page** - create, edit, and delete financial planning notes with tags
  - Appears in sidebar navigation between Net Worth and Settings
  - Search notes by title or content
  - Filter notes by tag
  - URLs in note content are clickable and open in default browser
  - Tags stored as JSON array, displayed as pills
- **Liquid Assets Tracking** in Net Worth - track liquid assets (stocks, super, cash, offset) separately with dedicated subtotal
  - Predefined liquid asset fields: Stocks 1/2, Super 1/2, Cash, Offset, plus 4 custom liquid asset slots
  - Liquid assets shown as shaded blue area in net worth chart
  - Projection line now based on liquid assets only (not total net worth)
  - User-configurable growth rate (3%, 5%, 7%, 10%) with compound quarterly calculation
  - **Historical growth rate option** - calculates actual CAGR from your data (requires 2+ entries)
  - User-configurable projection period (5, 10, or 20 years)
- **Undo Last Import** - 5-minute window to undo an import if you made a mistake (wrong column mapping, forgot to select source, etc.)
  - Toast notification with Undo button appears after each import
  - "Undo Import" button in Transactions page header with countdown timer
  - Warns if transactions were edited since import (changes will be lost)
- Option to apply auto-category rules to already-categorised transactions (with preview and confirmation)
- Rules list now shows current matching transaction count instead of historical cumulative count
- Collapsible category sections in Monthly Budget view (Income, Transfers, Expense groups)
- Hover tooltips on category names showing "Click to filter" and 3mo/6mo average spending

### Changed
- Renamed "Import CSV" button to "Import" (covers both CSV and PDF paste methods)

### Improved
- Responsive layout for tiles on Dashboard, Monthly Budget, and Net Worth pages (no longer break at 800px minimum window)
- Category rules text no longer overlaps action buttons at narrow widths (uses 2x2 grid layout)
- Budget progress bars now show orange warning up to 105% of limit instead of turning red immediately at 100%
- Import limit increased from 1,000 to 5,000 transactions with loading indicator and within-file duplicate detection
- Category dropdown in auto-category rule dialog is now searchable
- Categories now sorted alphabetically (A-Z) within each section in all dropdowns
- Date pickers now allow clicking the month/year to quickly jump to any month (opens MonthPicker dialog)
- Budget sub-categories now display in two columns for better use of screen space (responsive)
- Added "Expand All / Collapse All" button to Monthly Budget category sections
- Monthly Budget page header reorganized with title above action buttons (better on narrow windows)

### Fixed
- Upper category renaming now works in Tauri mode (was only updating sub-categories)
- CSV and PDF paste import now have "First row contains headers" toggle - uncheck to import files without header rows
- Category filter in Monthly Budget view now works correctly from the Filters popover
- Monthly Budget view now preserves scroll position when editing, categorising, splitting, or deleting transactions
- Income and Transfer categories now display correctly in Monthly Budget view (Tauri mode)
- Category average calculations now correctly include months with zero spending
- Split parent transactions now display correctly in Transactions page (Tauri mode) - were incorrectly hidden
- Transfer transactions now greyed out in Transactions page (consistent with Monthly Budget view)

## [1.1.1] - 2026-01-16

### Fixed
- GitHub release notes now render markdown correctly (was showing encoded characters)

### Improved
- Release notes now include privacy clarification about local data storage

## [1.1.0] - 2026-01-16

### Added
- Create auto-categorization rule from any transaction row (Sparkles button) - available on both the main Transactions page and the Monthly Budget transaction list
- Option to add new rules to top of list (highest priority) via checkbox in rule dialog
- Session-aware sync conflict detection - blocks editing when local changes exist from a previous app session
- "Discard Local" option in sync conflict dialog - allows pulling cloud version when local changes exist
- Month picker on Monthly Budget page - click the month label to quickly jump to any month
- Optional Notes column mapping in CSV import - map reference/memo columns to transaction notes (truncated to 250 chars)
- Quick sync button in header - click the cloud icon to upload local changes without navigating to Settings

### Fixed
- Monthly Budget page no longer jumps when navigating to a new month (fixed null comparison bug in edit state)
- "Forget PIN" reset now properly deletes local backup files and clears sync configuration (previously only cleared database tables)
- Local Backups section now shows storage location path
- "Restore Backup" button for local backups now works (was throwing an error instead of restoring)
- Sync conflict detection now works in Tauri mode (was always returning "in sync")
- OAuth access token now automatically refreshes when expired in Tauri mode (previously required re-authentication after 1 hour)
- PIN preserved during sync pull - no more lockout after downloading cloud backup
- Mixed-version sync compatibility - correctly detects cloud changes pushed by v1.0.0 (uses timestamp, not stale hash from description)
- Sync pull now correctly marks database as synced (fixed hash computation timing)
- Sync conflict dialog now appears when cloud changes are detected during polling

### Changed
- "Cloud Update Available" dialog now offers both "Use Cloud" and "Use Local" options (previously forced download)
- Sync status checks on window focus only instead of continuous polling (saves battery and network)

### Improved
- Hash-based sync detection (more reliable than timestamp-only)
- Rule dialog now debounces match text preview (reduces API calls while typing)
- Rule dialog input no longer lags when typing quickly (memoized rendering)
- Test suite quality improvements:
  - Added shared test utilities (`lib/db/test-utils.ts`)
  - Fixed date calculation bug in budgets 12-month average test
  - Added CRUD tests for net-worth operations
  - Added time-based tests for rate limit window expiration
  - Improved split transaction tests with actual database verification

### Security
- Updated `qs` dependency to fix high severity DoS vulnerability (GHSA-6rw7-vpxm-498p)

## [1.0.0] - 2025-01-12

### Added
- Initial release
- Local SQLite database for full data ownership
- Transaction import from CSV and PDF paste
- Two-tier category system (upper categories + sub-categories)
- Auto-categorization rules with priority ordering
- Monthly budget tracking with actual vs budget comparison
- Dashboard with analytics and trend charts
- Optional Google Drive sync with encryption
- Net worth tracking with projections
- Desktop app packaging with Tauri (Windows)
