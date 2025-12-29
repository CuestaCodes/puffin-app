# Puffin Windows Build Test Script
# Run from project root: .\scripts\build-test-windows.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectRoot

Write-Host "=== Puffin Windows Build Test ===" -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"

# Step 1: Clean
Write-Host "`n[1/5] Cleaning previous builds..." -ForegroundColor Yellow
Remove-Item -Recurse -Force src-tauri\target -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force out -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$env:APPDATA\Puffin" -ErrorAction SilentlyContinue
Write-Host "  Cleared app data folder" -ForegroundColor Gray

# Step 2: Install
Write-Host "`n[2/5] Installing dependencies..." -ForegroundColor Yellow
npm ci
if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }

# Step 3: Run tests
Write-Host "`n[3/5] Running tests..." -ForegroundColor Yellow
npm test
if ($LASTEXITCODE -ne 0) { throw "Tests failed" }

# Step 4: Build
Write-Host "`n[4/5] Building Tauri app..." -ForegroundColor Yellow
npm run tauri:build
if ($LASTEXITCODE -ne 0) { throw "Tauri build failed" }

# Step 5: Verify
Write-Host "`n[5/5] Verifying outputs..." -ForegroundColor Yellow

$exe = "src-tauri\target\release\Puffin.exe"
$nsisInstaller = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
$msiInstaller = Get-ChildItem "src-tauri\target\release\bundle\msi\*.msi" -ErrorAction SilentlyContinue | Select-Object -First 1

$success = $true

if (Test-Path $exe) {
    $size = (Get-Item $exe).Length / 1MB
    Write-Host "  [OK] Portable: $exe ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "  [FAIL] Portable executable not found" -ForegroundColor Red
    $success = $false
}

if ($nsisInstaller) {
    $size = $nsisInstaller.Length / 1MB
    Write-Host "  [OK] NSIS Installer: $($nsisInstaller.Name) ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "  [WARN] NSIS installer not found" -ForegroundColor Yellow
}

if ($msiInstaller) {
    $size = $msiInstaller.Length / 1MB
    Write-Host "  [OK] MSI Installer: $($msiInstaller.Name) ($([math]::Round($size, 2)) MB)" -ForegroundColor Green
} else {
    Write-Host "  [WARN] MSI installer not found" -ForegroundColor Yellow
}

if (-not $success) {
    Write-Host "`n=== Build Test FAILED ===" -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Build Test PASSED ===" -ForegroundColor Green
Write-Host "`nTo run the app:"
Write-Host "  & `"$ProjectRoot\$exe`"" -ForegroundColor Cyan

# Optional: Run the app
$response = Read-Host "`nRun the app now? (y/N)"
if ($response -eq 'y' -or $response -eq 'Y') {
    Write-Host "Starting Puffin..." -ForegroundColor Cyan
    Start-Process "$ProjectRoot\$exe"
}
