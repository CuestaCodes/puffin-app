# Changelog

All notable changes to Puffin will be documented in this file.

## [Unreleased]

### Added
- Choose how many local backups to keep — 1, 3, 5, 10, 20, 30 or 50, default 10 — in Settings → Data Management → Local Backups. Every automatic backup (before a sync upload, sync download, restore or clear) counts toward the one limit, and the oldest are deleted whenever a new one is made. Lowering the limit asks for confirmation first, saying how many backups will go and from what date. The setting is stored on this device beside the database and is never synced.
- Optional import activity log. Turn on "Record import mapping choices" in Settings → Data Management and Puffin records, for each completed import, which source columns you mapped to which fields, the date format used, and where you corrected its guesses. It is off by default, stored only on this device, never synced or uploaded, and records column names and counts rather than any amounts or descriptions. Export it as a `.jsonl` file, or clear it, from the same place. Groundwork for Puffin learning to suggest the right mapping for each bank.
- Optional auto-lock: Puffin can return to the PIN screen after a chosen period of inactivity — 1, 5, 15, 30 or 60 minutes. Off by default; enable it and pick a timeout in Settings → Security. Locking covers the app rather than logging you out, so unlocking brings you back to the same page with your filters and scroll position intact, and a sync or import already in progress carries on running underneath. Resuming from sleep or hibernation locks straight away, whatever timeout is set. A wrong PIN at the lock screen is rate-limited like any other login.
- Choosing where to sync now works in the desktop app. Cloud Sync offers three routes, during setup and after connecting: create a folder (pre-filled "Puffin"), which needs no extra permission and is found again automatically on a second computer signed into the same Google account; use a folder you already have, from a list or a pasted link; or connect to a database file another account shared with you. The last two explain that they need full Google Drive access before asking for it. Puffin never silently adopts a same-named folder it did not create, and warns when the chosen folder is shared with other people.
- Categorise several transactions at once. Select the rows, change the category on any one of them, and every selected row gets that category — the same way deleting a selected row already deletes the whole selection. Puffin asks first if any of the other rows already has a different category, and a message confirms how many were changed. Works on the Transactions page and the Monthly Budget list.

### Improved
- Cloud Sync setup is shorter: the Google API key and the Picker API are no longer needed, so both steps are gone from the instructions. Cloud Sync messages now appear as toasts instead of a banner at the top of the page, saving credentials and disconnecting confirm that they worked, and the note about what Puffin can see in your Drive now reflects the access you actually granted.
- The import mapping step now explains the date format it chose: how many dates could only be read that way, whether it had to guess, and which dates don't fit the selected format, naming them. Columns containing dates in both orders are flagged instead of being silently read one way, and those rows show as invalid in the preview. Changing which column holds the date re-runs detection, while a format you pick by hand is kept.
- Settings remembers where you were. Leaving a Settings page such as Data Management and coming back returns you to it until Puffin is closed, and clicking Settings in the sidebar while already in Settings takes you back to the Settings home — so moving between Cloud Sync and Data Management no longer means hunting for the small back arrow.
- The Local Backups list now scrolls inside its own box instead of stretching the page, shows how many backups are on disk and their total size, and truncates long filenames.
- Transaction search now waits until you stop typing before querying, instead of running a search on every keystroke. Typing a word used to flash the loading spinner once per letter and fire one database query per letter; it now does neither.
- Monthly Budget's "Copy from last month" and "Use 12-month average" now confirm how many budgets they changed, and report a failure instead of doing nothing visible.
- Budget category tiles are now clickable anywhere, not just on the category name, and the hover hint covers the whole tile instead of only the name. Action buttons and currency amounts are excluded, so double-click word-select and copy still work on figures.
- Dashboard summary tiles now reveal the full value and an explanation on hover/focus: Total Income (definition), Total Spent (`Expenses + Bills + Debts + Sinking Funds` with live component amounts), Savings (`Savings ÷ Total Income × 100` with live values), and Net Balance (`Total Income − Total Spent − Savings` with live values). Tiles are keyboard-focusable.
- Transactions: paging with Next/Previous now keeps your scroll position, so the pager stays under the cursor instead of jumping to the top of the list and having to be hunted down again on every page. Changing month, filters, search or sort still starts you at the top of the fresh list.
- Dashboard Spending Trends chart: when a line is highlighted (hover or click-to-pin a legend item), each point now shows a compact value label. Labels are staggered across two rows so neighbouring months don't overlap, and only the pinned line stays labelled when hovering other legend items.
- Summary tiles now behave the same way across the app. Net Worth (Current Net Worth, Total Assets, Liquid Assets, Total Liabilities, Total Snapshots) and Monthly Budget (Income, Budgeted, Spent, Remaining) tiles now truncate long values instead of overflowing their card, and reveal the tile title, the full untruncated value and an explanation on hover or keyboard focus — matching the Dashboard tiles. Net Worth's Current Net Worth shows `Total Assets − Total Liabilities`, Monthly Budget's Spent shows `Spent ÷ Budgeted × 100` and Remaining shows `Budgeted − Spent`, each with live values. Dashboard tooltips now name the tile as well.
- The Monthly Budget transaction list and the Transactions page are now the same list, so they behave identically. The Monthly Budget list gains the duplicate button, deleting a selected row now deletes the whole selection there too, its dates show the year, and its row buttons are labelled for screen readers.
- The Monthly Budget transaction list remembers your search, filters, sort and page when you go to another screen and come back, until Puffin is closed. Search, filters and sort carry over when you change month; the page number starts again at 1.
- The Transactions page now returns you to the page number you left. It already remembered filters, search and sort, but always went back to page 1.
- A transaction's category can be removed straight from the list: the category picker on each row now starts with an "Uncategorized" entry. Previously the only way was to open the transaction for editing.
- Clicking a sorted column header a third time clears the sort, returning the list to newest first.
- Selected transactions stay selected when you edit or categorise a row in place; the selection used to be dropped by any change to the list.
- The "selected" bar on transaction lists now floats at the bottom of the list, so Delete stays in reach however far down you have selected.
- Monthly Budget's month selector sits on its own row and is larger, so the month you are looking at is easier to see.
- Import now recognises separate Debit and Credit columns. A statement headed Debit/Credit, Withdrawals/Deposits or Paid out/Paid in is mapped without any manual work, in both CSV and paste import: withdrawals import as expenses, deposits as income, and a Balance column is recognised and left out. The CSV import gains the "separate Debit / Credit columns" mode that paste import already had, with a button on the mapping step to switch either way.
- Import previews now show how many of the selected rows are expenses and how many are income ("3 expenses · 1 income"), so an import with its signs the wrong way round is obvious before it happens. Both previews have a "Swap all signs" button, and clicking any amount swaps just that one — the CSV preview had neither before, and the paste preview offered them only for a single amount column.
- "First row contains column headers" now starts ticked when the first row reads as column names, in both CSV and paste import. It used to start unticked every time, and column detection cannot work from header names it has been told are not there.
- Clicking outside a window you are typing in no longer closes it and discards what you typed. This applies to import, add/edit transaction, split transaction, notes and the net worth record. Escape and the close and cancel buttons still close them; Escape now closes the import window too.
- The split transaction window scrolls when the app window is too short to show all of it, so its buttons can always be reached.

### Fixed
- A database created by a fresh install of 2.2.1 now opens on later starts. A new database did not record which version it was, so the next start re-ran an upgrade step against a table that already had its new column and stopped with "duplicate column name: is_active". Fresh installs now record their version, and a database already caught by this opens normally. Databases created before 2.2.1 were never affected.
- Signing in to Google no longer hides the browser behind Puffin. The app used to pull itself back to the front half a second after opening the consent page; it now stays out of the way and comes forward once sign-in finishes or times out. While it waits, a "Copy sign-in link" button lets you finish in another browser if the wrong one opened.
- The "Select Folder" and "Connect to Existing Backup" buttons, which showed a Google "Can't access your Google Account" page inside the app window, are replaced by the folder and file choices above. Google's picker cannot run inside the desktop app.
- The first upload to a new or empty Drive folder no longer fails with "Maximum call stack size exceeded" in the desktop app.
- Disconnecting sync in the desktop app now signs out of Google, withdraws Puffin's access to your Drive at Google, and keeps your Google Cloud credentials, as it always did in browser development. Other computers syncing with the same Google account will need to sign in again. It previously did the reverse: the saved sign-in was left on disk, the credentials were erased, and the Sign in button that remained could only report "OAuth credentials not found".
- Import no longer reads American dates back to front. A column of `MM/DD/YYYY` dates was detected as `DD/MM/YYYY`, so `01/12/2027` imported as 1 December instead of 12 January. Detection now reads the whole column instead of the first ten rows, and dates that are only a real date one way round now outweigh dates that could be read either way. Where every date is ambiguous, the order they appear in is used: dates a few days apart are recognised as such, rather than as months apart.
- Choosing a Drive folder now switches sync to that folder properly. If multi-account file sync had ever been set up, the app kept showing "Multi-Account Sync" with the old file name, and push and pull carried on using that file rather than the folder just chosen. Switching sync target also clears the record of what was last synced, which belonged to the previous target and could make an unrelated database look already in sync.
- Entering a Google Drive folder URL by hand now works in the desktop app. It always failed with "Folder validation requires OAuth authentication", because the check was only ever implemented for browser development — leaving no way to set up sync on the desktop, since the Select Folder button cannot work there either (Google's picker is blocked inside the app window).
- Local backups no longer pile up forever in the desktop app. Every sync wrote a backup roughly the size of your database and nothing ever removed one, so they grew without limit. They are now pruned to the chosen limit after each new backup. **The first backup after updating removes all but the newest 10 existing backups** — if you want to keep more, raise "Backups to keep" in Settings → Data Management before your next sync.
- The Local Backups list in the desktop app now shows each backup's real size and date. It previously showed every backup as 0 bytes, created "now", which hid how much disk they were using.
- Restoring from a backup file in the desktop app now saves its safety backup of your current data in the backups folder with the rest, where it is listed and can be restored. It was previously written beside the database, out of sight.
- Bulk-deleting transactions now waits for your confirmation. The confirmation used the browser's native prompt, which does not block in the desktop app, so the transactions were deleted the moment the dialog appeared and Cancel had no effect. Both the Transactions page and the Monthly Budget list now use a proper confirmation dialog and report how many rows were deleted.
- Exporting no longer looks like it did nothing. "Export Transactions (CSV)" and the new import log export now open a save dialog in the desktop app and tell you the exact path they wrote to — previously the file was dropped into your Downloads folder with no prompt and no message naming where it went.
- Lists no longer jump and snap back when you edit them. Saving a budget, or categorising, deleting, splitting or editing a transaction, now leaves the list exactly where it was — previously the page swapped the whole list for a loading spinner, which threw you to the top and then jumped back a second later once the data returned. The spinner still appears when the list genuinely changes, such as switching month or applying a filter. Paging on the Transactions page now keeps your position too, matching the Monthly Budget list.
- Monthly Budget no longer throws a "UNIQUE constraint failed" database error when opening a month whose budgets are being created for the first time. Two overlapping initialisation passes could each try to create the same $0 budget row; the second is now ignored rather than failing.
- Monthly Budget no longer creates $0 budgets for sub-categories belonging to a deactivated upper category. This only affected the desktop app, where the deactivation filter was missing.
- Lists no longer lose your place when they refresh. Scroll preservation was targeting the wrong element, so it had never taken effect anywhere it was used — Monthly Budget and the transaction list both now hold position after an edit, delete or save.
- Monthly Budget: saving a budget no longer scrolls the page away. The inline editor no longer scrolls itself into view when it opens, and the refresh that follows a save preserves position.
- Transactions: categorising rows under the Uncategorised (or a specific category) filter no longer causes the next page navigation to skip a page of results. The list now reconciles with the server on the next Next/Previous action — dropping the rows that no longer match and renumbering pages — so no transactions are skipped.
- Transactions: the current page now clamps back into range when the filtered set shrinks (e.g. after editing or deleting rows out of the active filter), preventing a stuck empty page.
- Undo Last Import and Reset App dialogs no longer trigger React hydration errors caused by invalid nested `<p>` elements.
- Bulk-deleting transactions no longer nudges the list down. The "selected" bar used to sit above the rows, so every row shifted when it disappeared.
- On the Monthly Budget list, categorising a transaction out of the current filter and then pressing Next no longer skips a page of transactions, and deleting the last rows of the final page returns you to the new last page — as the Transactions page already did.
- A transaction that fails to unsplit now says so instead of doing nothing.
- CSV import no longer records spending as income for statements with Debit and Credit columns. The Debit column was taken as the amount, so every withdrawal imported as a positive amount and every deposit row was rejected as having no amount.
- CSV import now reads amounts in brackets, with a `DR` marker or with a typographic minus sign as negative. `(84.35)`, `84.35 DR` and `−84.35` all used to import as +84.35.
- Paste import no longer loses rows when the amount is the last column and carries a sign. `-84.35` and `(84.35)` were split into two cells, which pushed unsigned amounts on other rows into the wrong column, where they were rejected as having no amount.
- Paste import now keeps the signs in what you pasted. Every amount in a single amount column used to be imported as an expense, so a salary pasted as `3,438.75` beside `-84.35` came in as spending unless it was flipped by hand. A column with no signs at all still starts as all expenses.
- Paste import now recognises a column of amounts marked `DR` or `CR`.
- A row with an amount in both the Debit and the Credit column is now flagged in the preview instead of being imported as a withdrawal.

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
