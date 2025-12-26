#!/usr/bin/env node
/**
 * Build script for Tauri static export.
 * Temporarily moves the API folder since API routes are not supported
 * in static export mode (they'll be replaced by Tauri commands).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const API_DIR = path.join(__dirname, '..', 'app', 'api');
const API_BACKUP_DIR = path.join(__dirname, '..', 'app', '_api_backup');
const NEXT_CACHE_DIR = path.join(__dirname, '..', '.next');

// Track state for cleanup
let apiMoved = false;

function moveDir(from, to) {
  if (fs.existsSync(from)) {
    fs.renameSync(from, to);
    return true;
  }
  return false;
}

function removeDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Restore API folder from backup.
 * Called on normal exit and signal interrupts.
 */
function restoreApiFolder() {
  if (apiMoved && fs.existsSync(API_BACKUP_DIR)) {
    try {
      console.log('Restoring API routes...');
      moveDir(API_BACKUP_DIR, API_DIR);
      apiMoved = false;
    } catch (restoreError) {
      console.error('CRITICAL: Failed to restore API routes:', restoreError.message);
      console.error('Manual recovery required: mv app/_api_backup app/api');
    }
  }
}

// Handle interrupts to ensure API folder is restored
['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => {
    console.log(`\nReceived ${signal}, cleaning up...`);
    restoreApiFolder();
    process.exit(1);
  });
});

function main() {
  try {
    // Clean Next.js cache to avoid stale type references
    console.log('Cleaning Next.js cache...');
    removeDir(NEXT_CACHE_DIR);

    // Move API folder out of the way for static build
    if (fs.existsSync(API_DIR)) {
      console.log('Moving API routes for static build...');
      apiMoved = moveDir(API_DIR, API_BACKUP_DIR);
    }

    // Run Next.js build with static export
    console.log('Building Next.js static export...');
    execSync('next build', {
      stdio: 'inherit',
      env: { ...process.env, TAURI_ENV: '1' }
    });

    console.log('Static build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error.message);
    process.exit(1);
  } finally {
    // Always restore API folder
    restoreApiFolder();
  }
}

main();
