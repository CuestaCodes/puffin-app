# Build Testing Strategy

This document outlines the testing strategy for verifying Puffin builds across platforms.

## Prerequisites

### Windows
- Node.js 18+
- Rust toolchain (`rustup`)
- Visual Studio Build Tools (C++ workload)

### WSL (Linux Proxy)
- Ubuntu 22.04+ recommended
- Node.js 18+
- Rust toolchain
- Required system libraries:
  ```bash
  sudo apt update
  sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
  ```

---

## Phase 1: Build Verification

### 1.1 Windows Build Test

```powershell
# From Windows PowerShell/Terminal
cd E:\puffin-app

# Clean previous builds
Remove-Item -Recurse -Force src-tauri\target -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force out -ErrorAction SilentlyContinue

# Install dependencies
npm ci

# Build static export
npm run build:static

# Build Tauri app
npm run tauri:build

# Verify outputs exist
Test-Path "src-tauri\target\release\Puffin.exe"
Test-Path "src-tauri\target\release\bundle\nsis\*.exe"
```

**Expected Outputs:**
- `src-tauri/target/release/Puffin.exe` (portable)
- `src-tauri/target/release/bundle/nsis/Puffin_0.1.0_x64-setup.exe` (installer)

### 1.2 WSL/Linux Build Test

```bash
# From WSL terminal
cd /mnt/e/puffin-app

# Clean previous builds
rm -rf src-tauri/target out

# Install dependencies
npm ci

# Build static export
npm run build:static

# Build Tauri app (Linux target)
npm run tauri:build

# Verify outputs exist
ls -la src-tauri/target/release/puffin
ls -la src-tauri/target/release/bundle/deb/*.deb
ls -la src-tauri/target/release/bundle/appimage/*.AppImage
```

**Expected Outputs:**
- `src-tauri/target/release/puffin` (binary)
- `src-tauri/target/release/bundle/deb/puffin_0.1.0_amd64.deb`
- `src-tauri/target/release/bundle/appimage/puffin_0.1.0_amd64.AppImage`

---

## Phase 2: Smoke Tests

### 2.1 Windows Runtime Test

```powershell
# Run the portable executable
& "src-tauri\target\release\Puffin.exe"
```

**Manual Verification Checklist:**
- [ ] App window opens without crash
- [ ] PIN setup screen appears (first run)
- [ ] Can create 6-digit PIN
- [ ] Dashboard loads after login
- [ ] Settings page shows version number (0.1.0)
- [ ] Can create a manual transaction
- [ ] Can view transaction list
- [ ] Close app cleanly (no hang)

### 2.2 WSL Runtime Test (Requires WSLg or X Server)

```bash
# If using WSLg (Windows 11)
./src-tauri/target/release/puffin

# If using X server (Windows 10)
export DISPLAY=:0
./src-tauri/target/release/puffin
```

**Same checklist as Windows.**

---

## Phase 3: Functional Tests

### 3.1 Database Operations

| Test | Steps | Expected Result |
|------|-------|-----------------|
| PIN Setup | Enter 6-digit PIN twice | User created, redirected to dashboard |
| Login | Enter correct PIN | Session created, dashboard shown |
| Wrong PIN | Enter wrong PIN 5 times | Rate limited for 15 minutes |
| Create Transaction | Add manual transaction | Transaction appears in list |
| Edit Transaction | Modify amount/description | Changes saved |
| Delete Transaction | Soft delete transaction | Transaction hidden (recoverable) |
| Create Category | Add sub-category | Category available in dropdown |
| Create Budget | Set budget amount | Budget shown in budget view |

### 3.2 Data Management

| Test | Steps | Expected Result |
|------|-------|-----------------|
| Create Backup | Settings > Data > Create Backup | Backup file created |
| Restore Backup | Settings > Data > Restore | Database restored, refresh required |
| Export CSV | Settings > Data > Export Transactions | CSV downloaded |
| Import Backup | Settings > Data > Import | Database replaced |
| Clear Data | Settings > Data > Clear All | Transactions deleted, categories kept |
| Reset App | Settings > Data > Reset | Full reset, PIN setup required |

### 3.3 File System Paths

| Platform | Database Location | Config Location |
|----------|-------------------|-----------------|
| Windows Dev | `./data/puffin.db` | `./data/` |
| Windows Packaged | `%APPDATA%\Puffin\puffin.db` | `%APPDATA%\Puffin\` |
| Linux Dev | `./data/puffin.db` | `./data/` |
| Linux Packaged | `~/.local/share/puffin/puffin.db` | `~/.local/share/puffin/` |

**Verification:**
```powershell
# Windows - check packaged app data location
dir "$env:APPDATA\Puffin"
```

```bash
# Linux - check packaged app data location
ls -la ~/.local/share/puffin/
```

---

## Phase 4: Update Notification Test

### 4.1 Simulate Update Available

1. Temporarily edit `src-tauri/tauri.conf.json`:
   ```json
   "version": "0.0.1"
   ```

2. Rebuild and run the app

3. **Expected:** Update banner appears showing "Version 0.1.0 available"

4. Click "Download" - should open GitHub releases page

5. Restore version to `0.1.0`

---

## Phase 5: Cross-Platform Compatibility

### 5.1 Database Portability

1. Create transactions on Windows build
2. Copy `puffin.db` to WSL location
3. Run Linux build
4. **Expected:** All data intact and accessible

### 5.2 Backup Compatibility

1. Create backup on Windows
2. Restore backup on Linux (or vice versa)
3. **Expected:** Successful restore, all data intact

---

## Quick Test Script

### Windows Quick Test

```powershell
# build-test-windows.ps1
$ErrorActionPreference = "Stop"

Write-Host "=== Puffin Windows Build Test ===" -ForegroundColor Cyan

# Step 1: Clean
Write-Host "`n[1/4] Cleaning previous builds..." -ForegroundColor Yellow
Remove-Item -Recurse -Force src-tauri\target -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force out -ErrorAction SilentlyContinue

# Step 2: Install
Write-Host "`n[2/4] Installing dependencies..." -ForegroundColor Yellow
npm ci

# Step 3: Build
Write-Host "`n[3/4] Building Tauri app..." -ForegroundColor Yellow
npm run tauri:build

# Step 4: Verify
Write-Host "`n[4/4] Verifying outputs..." -ForegroundColor Yellow
$exe = "src-tauri\target\release\Puffin.exe"
$installer = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | Select-Object -First 1

if (Test-Path $exe) {
    Write-Host "  [OK] Portable: $exe" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Portable executable not found" -ForegroundColor Red
    exit 1
}

if ($installer) {
    Write-Host "  [OK] Installer: $($installer.Name)" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] NSIS installer not found" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Build Test PASSED ===" -ForegroundColor Green
Write-Host "Run the app: & `"$exe`""
```

### WSL Quick Test

```bash
#!/bin/bash
# build-test-linux.sh
set -e

echo "=== Puffin Linux Build Test ==="

# Step 1: Clean
echo -e "\n[1/4] Cleaning previous builds..."
rm -rf src-tauri/target out

# Step 2: Install
echo -e "\n[2/4] Installing dependencies..."
npm ci

# Step 3: Build
echo -e "\n[3/4] Building Tauri app..."
npm run tauri:build

# Step 4: Verify
echo -e "\n[4/4] Verifying outputs..."
BINARY="src-tauri/target/release/puffin"
APPIMAGE=$(find src-tauri/target/release/bundle/appimage -name "*.AppImage" 2>/dev/null | head -1)

if [ -f "$BINARY" ]; then
    echo "  [OK] Binary: $BINARY"
else
    echo "  [FAIL] Binary not found"
    exit 1
fi

if [ -n "$APPIMAGE" ]; then
    echo "  [OK] AppImage: $(basename $APPIMAGE)"
else
    echo "  [WARN] AppImage not found (may require additional deps)"
fi

echo -e "\n=== Build Test PASSED ==="
echo "Run the app: $BINARY"
```

---

## CI/CD Verification

The GitHub Actions workflow (`.github/workflows/release.yml`) automatically tests builds on:
- Windows (x64)
- macOS (Intel + Apple Silicon)
- Linux (x64)

To trigger a test build without releasing:
1. Create a draft release or pre-release tag
2. Or manually trigger workflow dispatch

---

## Troubleshooting

### Windows Build Fails

```powershell
# Missing Visual Studio Build Tools
winget install Microsoft.VisualStudio.2022.BuildTools

# Missing Rust
winget install Rustlang.Rust.MSVC
```

### WSL Build Fails

```bash
# Missing WebKit
sudo apt install libwebkit2gtk-4.1-dev

# Missing GTK
sudo apt install libgtk-3-dev

# Cargo not found
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

### App Opens But White Screen

- Check browser console (F12 in dev mode)
- Verify `out/` directory has static files
- Check CSP isn't blocking resources
