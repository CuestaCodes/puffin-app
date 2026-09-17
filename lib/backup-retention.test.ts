import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BACKUPS_TO_KEEP_OPTIONS,
  DEFAULT_BACKUPS_TO_KEEP,
  MAX_BACKUPS_TO_KEEP,
  MIN_BACKUPS_TO_KEEP,
  buildBackupFilename,
  clampBackupsToKeep,
  isBackupFilename,
  parseBackupSettings,
  parseBackupSettingsUpdate,
  parseBackupTimestamp,
  pruneBackups,
  selectBackupsToPrune,
  serializeBackupSettings,
  toBackupListing,
  type BackupDirectoryIO,
  type BackupFileEntry,
} from './backup-retention';

/** A backup made `minutesAgo` minutes before a fixed instant, with a matching mtime. */
function backupAt(prefix: string, minutesAgo: number, format: 'current' | 'legacy' = 'current'): BackupFileEntry {
  const date = new Date(Date.UTC(2026, 8, 17, 12, 0, 0, 0) - minutesAgo * 60_000);
  const stamp = date.toISOString().replace(/[:.]/g, '-');
  return {
    filename: `${prefix}${format === 'current' ? stamp.replace('T', '_') : stamp}.db`,
    size: 2_000_000,
    mtimeMs: date.getTime(),
  };
}

describe('buildBackupFilename / parseBackupTimestamp', () => {
  it('round-trips a timestamp through the filename', () => {
    const date = new Date('2026-09-17T10:30:05.123Z');
    const filename = buildBackupFilename('pre-sync', date);

    expect(filename).toBe('pre-sync-2026-09-17_10-30-05-123Z.db');
    expect(parseBackupTimestamp(filename)).toBe(date.getTime());
  });

  it('uses a distinct prefix per kind, and all are valid backup filenames', () => {
    const date = new Date('2026-09-17T10:30:05.123Z');
    const names = (['pre-sync', 'pre-pull', 'pre-clear', 'pre-restore', 'manual'] as const)
      .map(kind => buildBackupFilename(kind, date));

    expect(new Set(names).size).toBe(names.length);
    names.forEach(name => expect(isBackupFilename(name)).toBe(true));
  });

  it('parses the legacy dev format, which kept the T', () => {
    expect(parseBackupTimestamp('puffin-backup-2026-09-17T10-30-05-123Z.db'))
      .toBe(Date.UTC(2026, 8, 17, 10, 30, 5, 123));
  });

  it('returns null for a filename with no timestamp', () => {
    expect(parseBackupTimestamp('my-copy.db')).toBeNull();
  });
});

describe('isBackupFilename', () => {
  it('rejects non-.db files and path traversal', () => {
    expect(isBackupFilename('notes.txt')).toBe(false);
    expect(isBackupFilename('pre-sync.db-wal')).toBe(false);
    expect(isBackupFilename('../puffin.db')).toBe(false);
    expect(isBackupFilename('sub/dir.db')).toBe(false);
  });
});

describe('selectBackupsToPrune', () => {
  it('keeps the newest N and selects the rest', () => {
    const entries = [0, 1, 2, 3, 4].map(m => backupAt('pre-sync-', m));

    expect(selectBackupsToPrune(entries, 3)).toEqual([entries[3].filename, entries[4].filename]);
  });

  it('selects nothing when at or under the limit', () => {
    const entries = [0, 1, 2].map(m => backupAt('pre-sync-', m));

    expect(selectBackupsToPrune(entries, 3)).toEqual([]);
    expect(selectBackupsToPrune(entries, 10)).toEqual([]);
    expect(selectBackupsToPrune([], 1)).toEqual([]);
  });

  it('treats every kind as one pool, ordered by time rather than by name', () => {
    // Alphabetically pre-clear < pre-pull < pre-sync, the reverse of their ages here
    const newest = backupAt('pre-clear-', 1);
    const middle = backupAt('pre-pull-', 5);
    const oldest = backupAt('pre-sync-', 10);

    expect(selectBackupsToPrune([oldest, newest, middle], 2)).toEqual([oldest.filename]);
  });

  it('orders legacy-format names alongside current ones', () => {
    const legacyNewer = backupAt('puffin-backup-', 1, 'legacy');
    const currentOlder = backupAt('pre-sync-', 30);

    expect(selectBackupsToPrune([currentOlder, legacyNewer], 1)).toEqual([currentOlder.filename]);
  });

  it('falls back to mtime for a backup with no timestamp in its name', () => {
    const renamedOld = { filename: 'my-copy.db', size: 1, mtimeMs: Date.UTC(2020, 0, 1) };
    const recent = backupAt('pre-sync-', 0);

    expect(selectBackupsToPrune([renamedOld, recent], 1)).toEqual(['my-copy.db']);
  });

  it('never selects files that are not backups', () => {
    const entries = [
      backupAt('pre-sync-', 0),
      { filename: 'readme.txt', size: 1, mtimeMs: 0 },
      { filename: 'pre-sync-2020-01-01_00-00-00-000Z.db-wal', size: 1, mtimeMs: 0 },
    ];

    expect(selectBackupsToPrune(entries, 1)).toEqual([]);
  });

  it('never prunes below one, whatever limit it is given', () => {
    const entries = [0, 1].map(m => backupAt('pre-sync-', m));

    expect(selectBackupsToPrune(entries, 0)).toEqual([entries[1].filename]);
    expect(selectBackupsToPrune(entries, -5)).toEqual([entries[1].filename]);
  });

  it('keeps a protected backup even when its clock makes it look oldest', () => {
    // System clock set back an hour: the backup just made sorts last
    const justMade = backupAt('pre-sync-', 60);
    const others = [0, 1, 2].map(m => backupAt('pre-pull-', m));

    const doomed = selectBackupsToPrune([justMade, ...others], 2, justMade.filename);

    expect(doomed).not.toContain(justMade.filename);
    expect(doomed).toHaveLength(2);
  });

  it('counts the protected backup toward the limit', () => {
    const justMade = backupAt('pre-sync-', 0);
    const others = [1, 2, 3].map(m => backupAt('pre-pull-', m));

    expect(selectBackupsToPrune([justMade, ...others], 1, justMade.filename))
      .toEqual(others.map(e => e.filename));
  });

  it('ignores a protect name that is not in the listing', () => {
    const entries = [0, 1].map(m => backupAt('pre-sync-', m));

    expect(selectBackupsToPrune(entries, 1, 'missing.db')).toEqual([entries[1].filename]);
  });
});

describe('toBackupListing', () => {
  it('lists backups newest first with real sizes, dated from the filename', () => {
    const older = { ...backupAt('pre-sync-', 10), mtimeMs: Date.UTC(2030, 0, 1) }; // copied later
    const newer = backupAt('pre-pull-', 1);

    const listing = toBackupListing([older, newer, { filename: 'x.txt', size: 1, mtimeMs: 0 }]);

    expect(listing.map(b => b.filename)).toEqual([newer.filename, older.filename]);
    expect(listing[1].createdAt).toBe(new Date(parseBackupTimestamp(older.filename)!).toISOString());
    expect(listing[0].size).toBe(2_000_000);
  });
});

describe('settings', () => {
  it('defaults when the file is missing, empty or corrupt', () => {
    expect(parseBackupSettings(null)).toEqual({ keep: DEFAULT_BACKUPS_TO_KEEP });
    expect(parseBackupSettings('')).toEqual({ keep: DEFAULT_BACKUPS_TO_KEEP });
    expect(parseBackupSettings('{not json')).toEqual({ keep: DEFAULT_BACKUPS_TO_KEEP });
    expect(parseBackupSettings('null')).toEqual({ keep: DEFAULT_BACKUPS_TO_KEEP });
    expect(parseBackupSettings('{"keep":"lots"}')).toEqual({ keep: DEFAULT_BACKUPS_TO_KEEP });
  });

  it('clamps an out-of-range stored value rather than rejecting it', () => {
    expect(parseBackupSettings('{"keep":0}')).toEqual({ keep: MIN_BACKUPS_TO_KEEP });
    expect(parseBackupSettings('{"keep":9999}')).toEqual({ keep: MAX_BACKUPS_TO_KEEP });
    expect(parseBackupSettings('{"keep":7.6}')).toEqual({ keep: 8 });
  });

  it('round-trips through serialize', () => {
    expect(parseBackupSettings(serializeBackupSettings({ keep: 20 }))).toEqual({ keep: 20 });
  });

  it('clampBackupsToKeep defaults non-numbers', () => {
    expect(clampBackupsToKeep(undefined)).toBe(DEFAULT_BACKUPS_TO_KEEP);
    expect(clampBackupsToKeep(NaN)).toBe(DEFAULT_BACKUPS_TO_KEEP);
    expect(clampBackupsToKeep(Infinity)).toBe(DEFAULT_BACKUPS_TO_KEEP);
  });

  it('offers only in-range choices, including the default', () => {
    BACKUPS_TO_KEEP_OPTIONS.forEach(option => {
      expect(option).toBeGreaterThanOrEqual(MIN_BACKUPS_TO_KEEP);
      expect(option).toBeLessThanOrEqual(MAX_BACKUPS_TO_KEEP);
    });
    expect(BACKUPS_TO_KEEP_OPTIONS).toContain(DEFAULT_BACKUPS_TO_KEEP);
  });
});

describe('parseBackupSettingsUpdate', () => {
  it('accepts a whole number within range', () => {
    expect(parseBackupSettingsUpdate({ keep: 1 })).toBe(1);
    expect(parseBackupSettingsUpdate({ keep: 50 })).toBe(50);
  });

  it('refuses anything else instead of clamping it', () => {
    expect(parseBackupSettingsUpdate({ keep: 0 })).toBeNull();
    expect(parseBackupSettingsUpdate({ keep: 51 })).toBeNull();
    expect(parseBackupSettingsUpdate({ keep: 2.5 })).toBeNull();
    expect(parseBackupSettingsUpdate({ keep: '10' })).toBeNull();
    expect(parseBackupSettingsUpdate({})).toBeNull();
    expect(parseBackupSettingsUpdate(null)).toBeNull();
  });
});

describe('pruneBackups', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  function directory(entries: BackupFileEntry[], failOn: string[] = []): BackupDirectoryIO & { files: Set<string> } {
    const files = new Set(entries.map(e => e.filename));
    return {
      files,
      async list() {
        return entries.filter(e => files.has(e.filename));
      },
      async remove(filename) {
        if (failOn.includes(filename)) throw new Error('EBUSY: file locked');
        files.delete(filename);
      },
    };
  }

  it('deletes down to the limit and reports how many', async () => {
    const entries = [0, 1, 2, 3].map(m => backupAt('pre-sync-', m));
    const dir = directory(entries);

    await expect(pruneBackups(dir, 2)).resolves.toBe(2);
    expect([...dir.files]).toEqual([entries[0].filename, entries[1].filename]);
  });

  it('carries on past a locked file and does not throw', async () => {
    const entries = [0, 1, 2, 3].map(m => backupAt('pre-sync-', m));
    const dir = directory(entries, [entries[2].filename]);

    await expect(pruneBackups(dir, 1)).resolves.toBe(2);
    expect(dir.files.has(entries[2].filename)).toBe(true);
    expect(dir.files.has(entries[3].filename)).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('returns 0 rather than throwing when the directory cannot be listed', async () => {
    const dir: BackupDirectoryIO = {
      list: async () => { throw new Error('permission denied'); },
      remove: async () => {},
    };

    await expect(pruneBackups(dir, 1)).resolves.toBe(0);
  });
});
