# Puffin v1.0 Release Guide

Track progress for the first public release. Check off items as completed.

---

## Phase 1: Bug Fixes

- [x] **Auto-categorisation rules** - Fixed: rules now apply on manual transaction creation and import
- [x] **Dashboard graphs** - Fixed: renamed `monthlyTrends` to `trends` to match frontend expectations
- [x] **Google Drive sync** - Fixed: OAuth loopback server, push/pull handlers, extended scope detection

---

## Phase 2: Build Verification

### Prerequisites

**Windows:**
- Node.js 18+
- Rust toolchain (`rustup`)
- Visual Studio Build Tools (C++ workload)

**WSL/Linux (optional):**
- Ubuntu 22.04+ recommended
- Required libraries: `sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`

### Build Checklist

- [ ] Clean build completes without errors (`npm run tauri:build`)
- [ ] Portable `.exe` created at `src-tauri/target/release/Puffin.exe`
- [ ] NSIS installer created at `src-tauri/target/release/bundle/nsis/Puffin_*_x64-setup.exe`

### Quick Build Script (Windows)

```powershell
# From Windows PowerShell
cd E:\puffin-app
Remove-Item -Recurse -Force src-tauri\target, out -ErrorAction SilentlyContinue
npm ci
npm run tauri:build
Test-Path "src-tauri\target\release\Puffin.exe"
```

---

## Phase 3: Functional Testing

### Smoke Tests (First Run)

- [ ] App window opens without crash
- [ ] PIN setup screen appears (first run)
- [ ] Can create 6-digit PIN
- [ ] Dashboard loads after login
- [ ] Settings page shows correct version number
- [ ] Close app cleanly (no hang)

### Database Operations

| Test | Steps | Expected | Status |
|------|-------|----------|--------|
| PIN Setup | Enter 6-digit PIN twice | User created, redirected to dashboard | [ ] |
| Login | Enter correct PIN | Session created, dashboard shown | [ ] |
| Wrong PIN | Enter wrong PIN 5 times | Rate limited for 15 minutes | [ ] |
| Change PIN | Settings > Security > Change PIN | New PIN works after lock | [ ] |
| Create Transaction | Add manual transaction | Transaction appears in list | [ ] |
| Edit Transaction | Modify amount/description | Changes saved | [ ] |
| Delete Transaction | Soft delete transaction | Transaction hidden (recoverable) | [ ] |
| Create Category | Add sub-category | Category available in dropdown | [ ] |
| Create Budget | Set budget amount | Budget shown in budget view | [ ] |
| Net Worth Entry | Add asset/liability | Entry appears in net worth view | [ ] |

### Data Management

| Test | Steps | Expected | Status |
|------|-------|----------|--------|
| Create Backup | Settings > Data > Create Backup | Backup file downloaded | [ ] |
| Restore Backup | Settings > Data > Restore | Database restored, app refreshes | [ ] |
| Export CSV | Settings > Data > Export Transactions | CSV file downloaded | [ ] |
| Import CSV | Transactions > Import | Transactions added | [ ] |
| Clear Data | Settings > Data > Clear All | Transactions deleted, categories kept | [ ] |
| Reset App | Settings > Data > Reset | Full reset, PIN setup required | [ ] |

### Auto-Categorisation

| Test | Steps | Expected | Status |
|------|-------|----------|--------|
| Create Rule | Settings > Rules > Add rule | Rule saved | [ ] |
| Rule Applies | Import transaction matching rule | Category auto-assigned | [ ] |
| Priority Order | Multiple rules match | Highest priority wins | [ ] |

### Google Drive Sync

| Test | Steps | Expected | Status |
|------|-------|----------|--------|
| Connect | Settings > Sync > Connect | OAuth flow completes | [ ] |
| Push | Settings > Sync > Push | Database uploaded to Drive | [ ] |
| Pull | Settings > Sync > Pull | Database downloaded from Drive | [ ] |
| Disconnect | Settings > Sync > Disconnect | Tokens cleared | [ ] |

---

## Phase 4: Clean Machine Test

- [ ] Copy installer to a different Windows PC (no Node.js, no Rust)
- [ ] Run installer - installs successfully
- [ ] SmartScreen warning appears (expected for unsigned) - can click through
- [ ] App launches and works correctly
- [ ] Database created in `%APPDATA%\Puffin\`

### File System Paths

| Context | Database | Config |
|---------|----------|--------|
| Development | `./data/puffin.db` | `./data/` |
| Windows Packaged | `%APPDATA%\Puffin\puffin.db` | `%APPDATA%\Puffin\` |
| Linux Packaged | `~/.local/share/puffin/puffin.db` | `~/.local/share/puffin/` |

---

## Phase 5: Signing & Version

- [ ] Self-sign the Windows executable (see notes below)
- [ ] Test self-signed `.exe` installs on another machine
- [ ] Update version in `src-tauri/tauri.conf.json`: `0.1.0` → `1.0.0`

### Self-Signing (Windows)

```powershell
# Create self-signed certificate
New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=Puffin App, O=CuestaCodes" -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(5)

# Export to PFX (will prompt for password)
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -like "*Puffin*" }
Export-PfxCertificate -Cert $cert -FilePath "puffin-signing.pfx" -Password (ConvertTo-SecureString -String "your-password" -Force -AsPlainText)
```

Configure in environment before build:
```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your-password"
$env:TAURI_SIGNING_PRIVATE_KEY = "path/to/puffin-signing.pfx"
```

**Note:** Self-signed certs still trigger SmartScreen initially. After enough users run it, reputation builds.

---

## Phase 6: GitHub Release

- [ ] Verify GitHub Actions workflow (`.github/workflows/release.yml`) is configured
- [ ] Create git tag: `git tag v1.0.0 && git push origin v1.0.0`
- [ ] Verify workflow builds and uploads artifacts
- [ ] Test download of released `.exe`/`.msi`
- [ ] Write release notes

### Release Notes Template

```markdown
## Puffin v1.0.0

First public release of Puffin - Personal Understanding & Forecasting of FINances.

### Features
- Local SQLite database (full data ownership)
- Transaction import from CSV
- Customisable categories and sub-categories
- Auto-categorisation rules
- Monthly budget tracking
- Net worth tracking
- Optional Google Drive backup sync
- PIN-protected access

### Downloads
- `Puffin_1.0.0_x64-setup.exe` - Windows installer (recommended)
- `Puffin.exe` - Windows portable

### Notes
- Windows SmartScreen may show a warning on first run (app is self-signed)
- Click "More info" → "Run anyway" to proceed
```

---

## Future Enhancements (Post v1.0)

- [ ] **Auto-updater** - Tauri `tauri-plugin-updater` for in-app updates
- [ ] **PDF transaction import** - Extract transactions from bank statement PDFs
- [ ] **Linux build** - Add AppImage/deb targets
- [ ] **macOS build** - Add dmg target
- [ ] **Code signing certificate** - Purchase proper cert to avoid SmartScreen

### PDF Import Complexity

| Approach | Effort | Accuracy | Notes |
|----------|--------|----------|-------|
| Text extraction + regex | Low | 40-60% | Breaks with format changes |
| Table extraction (tabula-js) | Medium | 60-80% | Requires Java runtime |
| AI/LLM extraction | Medium | 85-95% | Requires API key + costs |
| Document AI services | High | 90%+ | AWS Textract, Google Document AI |

**Recommendation:** Defer to v1.1. Consider "paste from PDF" as quick alternative.

---

## Troubleshooting

### Build Fails

```powershell
# Windows - Missing Visual Studio Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools

# Windows - Missing Rust
winget install Rustlang.Rust.MSVC
```

```bash
# WSL - Missing dependencies
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev

# WSL - Cargo not found
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### App Opens But White Screen

- Check `out/` directory has static files after `npm run build:static`
- Verify CSP in `src-tauri/tauri.conf.json` isn't blocking resources
- Check browser console (F12 in dev mode)

### Database Not Found

- Verify `%APPDATA%\Puffin\` exists after first run
- Check file permissions
