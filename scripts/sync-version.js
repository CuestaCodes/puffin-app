#!/usr/bin/env node
/**
 * Version Sync Script
 *
 * Keeps version numbers in sync between package.json and tauri.conf.json.
 * Run with: node scripts/sync-version.js [version]
 *
 * If no version is provided, reads from package.json and updates tauri.conf.json.
 * If version is provided, updates both files.
 */

const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const tauriConfPath = path.join(__dirname, '..', 'src-tauri', 'tauri.conf.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function isValidSemver(version) {
  return /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(version);
}

function main() {
  const newVersion = process.argv[2];

  // Read current files
  const packageJson = readJson(packageJsonPath);
  const tauriConf = readJson(tauriConfPath);

  if (newVersion) {
    // Validate version format
    if (!isValidSemver(newVersion)) {
      console.error(`Error: Invalid version format "${newVersion}". Expected semver (e.g., 1.0.0)`);
      process.exit(1);
    }

    // Update both files
    packageJson.version = newVersion;
    tauriConf.version = newVersion;

    writeJson(packageJsonPath, packageJson);
    writeJson(tauriConfPath, tauriConf);

    console.log(`Updated version to ${newVersion} in both package.json and tauri.conf.json`);
  } else {
    // Sync from package.json to tauri.conf.json
    const currentVersion = packageJson.version;

    if (tauriConf.version !== currentVersion) {
      tauriConf.version = currentVersion;
      writeJson(tauriConfPath, tauriConf);
      console.log(`Synced version ${currentVersion} from package.json to tauri.conf.json`);
    } else {
      console.log(`Versions already in sync: ${currentVersion}`);
    }
  }

  // Show current versions
  console.log('\nCurrent versions:');
  console.log(`  package.json:    ${packageJson.version}`);
  console.log(`  tauri.conf.json: ${tauriConf.version}`);
}

main();
