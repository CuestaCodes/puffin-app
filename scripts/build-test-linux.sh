#!/bin/bash
# Puffin Linux/WSL Build Test Script
# Run from project root: ./scripts/build-test-linux.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Get project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo -e "${CYAN}=== Puffin Linux Build Test ===${NC}"
echo "Project: $PROJECT_ROOT"

# Check for required dependencies
echo -e "\n${YELLOW}[0/5] Checking dependencies...${NC}"

check_dep() {
    if ! command -v $1 &> /dev/null; then
        echo -e "  ${RED}[MISSING] $1${NC}"
        return 1
    else
        echo -e "  ${GREEN}[OK] $1${NC}"
        return 0
    fi
}

DEPS_OK=true
check_dep node || DEPS_OK=false
check_dep npm || DEPS_OK=false
check_dep cargo || DEPS_OK=false
check_dep rustc || DEPS_OK=false

# Check for WebKit (required for Tauri)
if ! pkg-config --exists webkit2gtk-4.1 2>/dev/null; then
    echo -e "  ${RED}[MISSING] libwebkit2gtk-4.1-dev${NC}"
    echo -e "  Run: sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev"
    DEPS_OK=false
else
    echo -e "  ${GREEN}[OK] webkit2gtk-4.1${NC}"
fi

if [ "$DEPS_OK" = false ]; then
    echo -e "\n${RED}Missing dependencies. Please install them first.${NC}"
    exit 1
fi

# Step 1: Clean
echo -e "\n${YELLOW}[1/5] Cleaning previous builds...${NC}"
rm -rf src-tauri/target out .next

# Step 2: Install
echo -e "\n${YELLOW}[2/5] Installing dependencies...${NC}"
npm ci

# Step 3: Run tests
echo -e "\n${YELLOW}[3/5] Running tests...${NC}"
npm test

# Step 4: Build
echo -e "\n${YELLOW}[4/5] Building Tauri app...${NC}"
npm run tauri:build

# Step 5: Verify
echo -e "\n${YELLOW}[5/5] Verifying outputs...${NC}"

BINARY="src-tauri/target/release/puffin"
DEB=$(find src-tauri/target/release/bundle/deb -name "*.deb" 2>/dev/null | head -1)
APPIMAGE=$(find src-tauri/target/release/bundle/appimage -name "*.AppImage" 2>/dev/null | head -1)

SUCCESS=true

if [ -f "$BINARY" ]; then
    SIZE=$(du -h "$BINARY" | cut -f1)
    echo -e "  ${GREEN}[OK] Binary: $BINARY ($SIZE)${NC}"
else
    echo -e "  ${RED}[FAIL] Binary not found${NC}"
    SUCCESS=false
fi

if [ -n "$DEB" ] && [ -f "$DEB" ]; then
    SIZE=$(du -h "$DEB" | cut -f1)
    echo -e "  ${GREEN}[OK] DEB: $(basename $DEB) ($SIZE)${NC}"
else
    echo -e "  ${YELLOW}[WARN] DEB package not found${NC}"
fi

if [ -n "$APPIMAGE" ] && [ -f "$APPIMAGE" ]; then
    SIZE=$(du -h "$APPIMAGE" | cut -f1)
    echo -e "  ${GREEN}[OK] AppImage: $(basename $APPIMAGE) ($SIZE)${NC}"
else
    echo -e "  ${YELLOW}[WARN] AppImage not found${NC}"
fi

if [ "$SUCCESS" = false ]; then
    echo -e "\n${RED}=== Build Test FAILED ===${NC}"
    exit 1
fi

echo -e "\n${GREEN}=== Build Test PASSED ===${NC}"
echo -e "\nTo run the app:"
echo -e "  ${CYAN}$BINARY${NC}"

# Check if we can run GUI apps (WSLg or X server)
if [ -n "$DISPLAY" ] || [ -n "$WAYLAND_DISPLAY" ]; then
    echo -e "\nGUI display detected. You can run the app directly."
    read -p "Run the app now? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${CYAN}Starting Puffin...${NC}"
        "$BINARY" &
    fi
else
    echo -e "\n${YELLOW}No GUI display detected.${NC}"
    echo "To run on WSL, you need either:"
    echo "  - Windows 11 with WSLg (automatic)"
    echo "  - X server like VcXsrv with: export DISPLAY=:0"
fi
