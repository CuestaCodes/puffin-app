# Changelog

All notable changes to Puffin will be documented in this file.

## [Unreleased]

### Added
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
- Budget progress bars now show orange warning up to 105% of limit instead of turning red immediately at 100%
- Import limit increased from 1,000 to 5,000 transactions with loading indicator and within-file duplicate detection

### Fixed
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
