# Puffin

**Personal Understanding & Forecasting of FINances**

A privacy-first desktop budgeting app that keeps your financial data on your computer, not in the cloud.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-blue)

## Why Puffin?

- **Your data stays yours** - Everything is stored locally on your computer
- **No subscriptions** - Download once, use forever
- **No account required** - No sign-ups, no emails, no tracking
- **Optional cloud backup** - Sync to your own Google Drive if you want

## Features

### Transaction Management
- Import transactions from CSV files or paste from bank statement PDFs
- Manual transaction entry
- Split transactions across multiple categories
- Soft delete with recovery option

### Budgeting
- Set monthly budgets by category
- Track spending vs budget in real-time
- View 12-month spending averages
- Copy budgets from previous months

### Categories
- Two-tier category system (e.g., "Bills" > "Electricity")
- Auto-categorisation rules based on transaction descriptions
- Customisable category names

### Analytics
- Dashboard with spending trends
- Monthly comparisons
- Net worth tracking over time

### Security
- PIN-protected access (6-digit PIN)
- Rate limiting on failed login attempts
- All data encrypted at rest

### Cloud Backup (Optional)
- Sync to your personal Google Drive
- End-to-end encrypted backups
- Manual push/pull - you control when it syncs

## Installation

### Windows
1. Download `Puffin_1.0.0_x64-setup.exe` from the [latest release](https://github.com/CuestaCodes/puffin-app/releases/latest)
2. Run the installer
3. Windows SmartScreen may show a warning - click "More info" then "Run anyway"

> **Note:** macOS and Linux builds are planned for a future release.

## Getting Started

1. **Set up your PIN** - Create a 6-digit PIN to protect your data
2. **Add categories** - Customise the default categories or create your own
3. **Import transactions** - Import a CSV from your bank or paste from a PDF statement
4. **Set budgets** - Create monthly budgets for your spending categories
5. **Track your spending** - The dashboard shows your progress at a glance

## Importing Transactions

### From CSV
1. Export transactions from your bank's website as CSV
2. Click "Import" on the Transactions page
3. Map the columns (Date, Description, Amount)
4. Review and confirm

### From PDF Bank Statements
1. Open your bank statement PDF
2. Select and copy the transaction table
3. Click "Import" > "Paste" tab
4. Adjust column mapping if needed
5. Review and confirm

## Data Storage

Your data is stored locally at:
```
%APPDATA%\Puffin\puffin.db
```

## Backup & Restore

### Local Backups
- Go to Settings > Data > Create Backup
- Saves a `.db` file you can store anywhere

### Google Drive Sync (Optional)
1. Go to Settings > Sync
2. Connect your Google account
3. Choose a folder for backups
4. Use Push/Pull to sync manually

## FAQ

**Is my data sent to any servers?**
No. All data stays on your computer unless you explicitly enable Google Drive sync.

**What if I forget my PIN?**
You can reset the app from the login screen, but this will delete all data. Keep backups!

**Can I use Puffin on multiple devices?**
Yes, using Google Drive sync. Set up sync on each device and push/pull to keep them in sync.

**Is there a mobile app?**
Not currently. Puffin is a desktop application.

## System Requirements

- **Windows 10 or later** (64-bit)

## Contributing

Puffin is open source! Contributions are welcome.

See [CLAUDE.md](CLAUDE.md) for development documentation.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Made with care for people who want to understand their finances without giving up their privacy.
