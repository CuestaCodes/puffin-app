# Plan: Sync Robustness Improvements

## Overview

Two improvements to sync conflict detection:
1. **Hash-based cloud detection** - Compare DB hashes instead of timestamps for more reliable mismatch detection
2. **Session-aware local_only blocking** - Show blocking dialog for `local_only` when changes were made in a previous app session (not current session)

---

## Part 1: Hash-Based Cloud Detection

### Current Behavior

```
Cloud change detection: cloudModifiedTime > lastSyncedAt + 60s buffer
```

**Problems:**
- Clock skew between devices can cause false positives/negatives
- Timezone issues
- Only knows *when* changed, not *if* data actually differs

### Proposed Behavior

```
Cloud change detection: cloudDbHash !== syncedDbHash
Data match detection:   localDbHash === cloudDbHash
```

### Implementation

#### 1.1 Update Push Handler (`handleSyncPush`)

**File:** `lib/services/handlers/sync.ts`

After uploading the database file, update the file's description with the DB hash:

```typescript
// After successful upload, store hash in file metadata
const dbHash = computeDbHash(fileData); // SHA-256

await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
  method: 'PATCH',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    description: JSON.stringify({
      dbHash,
      pushedAt: new Date().toISOString(),
      pushedFrom: 'puffin-app'
    })
  })
});
```

**Also update:** `saveSyncConfig()` to store `syncedDbHash` (already done, but verify).

#### 1.2 Update Check Handler (`handleSyncCheck`)

**File:** `lib/services/handlers/sync.ts`

Modify cloud info fetching to include description:

```typescript
// Current
const response = await fetch(
  `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,modifiedTime&supportsAllDrives=true`,
  ...
);

// Proposed
const response = await fetch(
  `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,modifiedTime,description&supportsAllDrives=true`,
  ...
);
```

Parse the description and compare hashes:

```typescript
let cloudDbHash: string | null = null;
if (data.description) {
  try {
    const meta = JSON.parse(data.description);
    cloudDbHash = meta.dbHash || null;
  } catch {
    // Legacy file without hash metadata
  }
}

// Determine cloud changes by hash comparison (if available)
let hasCloudChanges = false;
if (cloudDbHash && config.syncedDbHash) {
  hasCloudChanges = cloudDbHash !== config.syncedDbHash;
} else {
  // Fallback to timestamp-based for legacy/migration
  hasCloudChanges = cloudModifiedTime > lastSyncTime + 60000;
}
```

#### 1.3 Update Pull Handler (`handleSyncPull`)

**File:** `lib/services/handlers/sync.ts`

After downloading, compute hash and store in config:

```typescript
// Compute hash of downloaded file
const hashBuffer = await crypto.subtle.digest('SHA-256', fileData);
const dbHash = Array.from(new Uint8Array(hashBuffer))
  .map(b => b.toString(16).padStart(2, '0')).join('');

// Save to config
saveSyncConfig({
  ...config,
  lastSyncedAt: new Date().toISOString(),
  syncedDbHash: dbHash,
});
```

**(Already implemented - verify it matches cloud hash)**

#### 1.4 Update API Routes (Dev Mode)

**Files:**
- `app/api/sync/push/route.ts`
- `app/api/sync/check/route.ts`
- `app/api/sync/pull/route.ts`

Mirror the same changes for dev mode consistency.

#### 1.5 Backward Compatibility

- If cloud file has no `description` or no `dbHash` in description, fall back to timestamp-based detection
- First push after this update will add the hash metadata
- Log a warning when falling back to timestamp-based

---

## Part 2: Session-Aware local_only Blocking

### Current Behavior

`local_only` always returns `canEdit: true`, no blocking dialog.

### Problem

If user:
1. Makes changes in Session A
2. Closes app without syncing
3. Opens app (Session B)
4. No warning about unsynced changes from previous session

### Proposed Behavior

- If `local_only` AND changes were made in a **previous session**, show blocking dialog
- If `local_only` AND changes were made in **current session**, allow editing (no dialog)

This prevents the annoying case of being blocked while actively working, but warns when reopening with stale unsynced changes.

### Implementation

#### 2.1 Session ID Tracking

**File:** `lib/services/handlers/sync.ts` (or new utility)

```typescript
// Generate unique session ID on module load (in-memory only)
const SESSION_ID = crypto.randomUUID();

// LocalStorage key for tracking which session last modified the DB
const LAST_MODIFY_SESSION_KEY = 'puffin_last_modify_session';
```

#### 2.2 Track DB Modifications

**File:** `lib/services/tauri-db.ts`

After any write operation that changes data, update the session marker:

```typescript
// In execute() or a wrapper
localStorage.setItem(LAST_MODIFY_SESSION_KEY, SESSION_ID);
```

**Alternative:** Track in specific handlers that modify data:
- Transaction create/update/delete
- Category changes
- Budget changes
- etc.

**Simpler alternative:** Track on push failure or when `local_only` is detected:
- When sync check returns `local_only`, check if we're in the same session that made changes

#### 2.3 Update Sync Check Logic

**File:** `lib/services/handlers/sync.ts`

```typescript
if (hasLocalChanges && !hasCloudChanges) {
  // Check if changes were made in current session
  const lastModifySession = localStorage.getItem(LAST_MODIFY_SESSION_KEY);
  const changesFromPreviousSession = lastModifySession && lastModifySession !== SESSION_ID;

  return {
    syncRequired: true,
    reason: 'local_only',
    message: changesFromPreviousSession
      ? "You have unsynced changes from a previous session."
      : "You have local changes that haven't been uploaded yet.",
    canEdit: !changesFromPreviousSession, // Block if from previous session
    hasLocalChanges: true,
    hasCloudChanges: false,
    lastSyncedAt: config.lastSyncedAt,
  };
}
```

#### 2.4 Update needsResolution Check

**File:** `hooks/use-sync-context.tsx`

No change needed - `canEdit: false` will automatically trigger the dialog.

#### 2.5 Clear Session Marker on Successful Sync

**File:** `lib/services/handlers/sync.ts`

After successful push or pull:

```typescript
localStorage.removeItem(LAST_MODIFY_SESSION_KEY);
```

---

## Testing Plan

### Hash-Based Detection Tests

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Fresh push stores hash | Push from app, check Drive file description | Description contains `dbHash` |
| 2 | Check detects cloud change via hash | Push from A, manually edit description hash, check from A | `hasCloudChanges: true` |
| 3 | Check detects match via hash | Push, close, reopen, check | `in_sync` (hashes match) |
| 4 | Fallback for legacy files | File without description, check | Falls back to timestamp, logs warning |
| 5 | Pull updates local hash | Pull from cloud, verify `syncedDbHash` in config | Matches cloud hash |

### Session-Aware Blocking Tests

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Same session, no block | Make changes, navigate away, navigate back | `canEdit: true`, no dialog |
| 2 | New session, block | Make changes, close app, reopen | `canEdit: false`, dialog appears |
| 3 | Sync clears marker | Make changes, push successfully, reopen | No dialog (marker cleared) |
| 4 | Pull clears marker | Have local changes, pull from cloud, reopen | No dialog (marker cleared) |

---

## Files to Modify

| File | Changes |
|------|---------|
| `lib/services/handlers/sync.ts` | Hash storage on push, hash comparison on check, session tracking |
| `lib/services/tauri-db.ts` | Track DB modifications with session ID |
| `app/api/sync/push/route.ts` | Store hash in Drive file description |
| `app/api/sync/check/route.ts` | Fetch and compare hash |
| `types/sync.ts` | Add `syncedDbHash` to config type if not present |
| `CLAUDE.md` | Document new sync behavior |

---

## Open Questions

1. **Session marker granularity:** Should we track at the DB level (any change) or be more specific (only track "significant" changes)?

2. **UI messaging:** Should the `local_only` blocking dialog have different wording than `conflict`? e.g., "You have unsynced changes from a previous session. Push to cloud or discard?"

3. **Discard option:** Should the blocking dialog for `local_only` offer a "discard local changes" option (pull from cloud)?

---

## Rollout Considerations

- **Backward compatible:** Files without hash metadata fall back to timestamp-based
- **Gradual adoption:** Hash metadata added on first push after update
- **No migration needed:** Existing sync configs continue to work
