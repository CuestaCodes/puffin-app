import { describe, it, expect } from 'vitest';
import {
  buildBackupFileQuery,
  buildFolderQuery,
  toBackupCandidate,
  toFolderCandidate,
  DEFAULT_SYNC_FOLDER_NAME,
  DRIVE_FOLDER_MIME_TYPE,
  PUFFIN_FOLDER_APP_PROPERTIES,
  PUFFIN_FOLDER_MARKER_KEY,
  chooseSyncFolder,
  extractDriveId,
  isUsableFolder,
  looksLikeBackupFile,
  requiresFullDriveAccess,
  sortBackupCandidates,
} from './drive-selection';
import type { DriveFolderCandidate } from '@/types/sync';

function folder(overrides: Partial<DriveFolderCandidate> = {}): DriveFolderCandidate {
  return {
    id: 'folder-1',
    name: DEFAULT_SYNC_FOLDER_NAME,
    createdByPuffin: true,
    createdTime: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

describe('requiresFullDriveAccess', () => {
  it('needs full access for anything the app did not create', () => {
    expect(requiresFullDriveAccess('create-folder')).toBe(false);
    expect(requiresFullDriveAccess('existing-folder')).toBe(true);
    expect(requiresFullDriveAccess('shared-file')).toBe(true);
  });
});

describe('chooseSyncFolder', () => {
  it('creates when nothing matches', () => {
    expect(chooseSyncFolder('Puffin', [])).toEqual({ action: 'create' });
    expect(chooseSyncFolder('Puffin', [folder({ name: 'Budgets' })])).toEqual({ action: 'create' });
  });

  it('reuses the folder Puffin made, rather than creating a second one', () => {
    // The second device would otherwise sync to its own folder while both
    // machines reported a healthy connection
    const existing = folder({ id: 'made-by-puffin' });

    expect(chooseSyncFolder('Puffin', [existing])).toEqual({ action: 'reuse', folder: existing });
  });

  it('ignores case and surrounding spaces when matching the name', () => {
    const existing = folder({ name: '  puffin ' });

    expect(chooseSyncFolder('Puffin', [existing])).toMatchObject({ action: 'reuse' });
  });

  it('never adopts a same-named folder Puffin did not create', () => {
    const theirs = folder({ id: 'user-folder', createdByPuffin: false });

    expect(chooseSyncFolder('Puffin', [theirs])).toEqual({ action: 'confirm', candidates: [theirs] });
  });

  it('prefers its own folder over a same-named one of the user\'s', () => {
    const theirs = folder({ id: 'user-folder', createdByPuffin: false });
    const ours = folder({ id: 'puffin-folder' });

    expect(chooseSyncFolder('Puffin', [theirs, ours])).toEqual({ action: 'reuse', folder: ours });
  });

  it('asks when it made more than one, newest first', () => {
    const older = folder({ id: 'old', createdTime: '2026-01-01T00:00:00.000Z' });
    const newer = folder({ id: 'new', createdTime: '2026-09-01T00:00:00.000Z' });

    expect(chooseSyncFolder('Puffin', [older, newer])).toEqual({
      action: 'confirm',
      candidates: [newer, older],
    });
  });

  it('keeps the shared flag on candidates, so the UI can warn', () => {
    const shared = folder({ createdByPuffin: false, shared: true });
    const result = chooseSyncFolder('Puffin', [shared]);

    expect(result).toMatchObject({ action: 'confirm' });
    expect(result.action === 'confirm' && result.candidates[0].shared).toBe(true);
  });
});

describe('extractDriveId', () => {
  it('reads an id from a file URL', () => {
    expect(extractDriveId('https://drive.google.com/file/d/1AbCdEf_ghij-KLMNOP/view?usp=sharing'))
      .toBe('1AbCdEf_ghij-KLMNOP');
  });

  it('reads an id from a Docs editor URL, so the file can be refused by name', () => {
    expect(extractDriveId('https://docs.google.com/document/d/1AbCdEf_ghij-KLMNOP/edit?tab=t.0'))
      .toBe('1AbCdEf_ghij-KLMNOP');
    expect(extractDriveId('https://docs.google.com/spreadsheets/d/1AbCdEf_ghij-KLMNOP/edit#gid=0'))
      .toBe('1AbCdEf_ghij-KLMNOP');
  });

  it('still reads folder URLs and bare ids', () => {
    expect(extractDriveId('https://drive.google.com/drive/folders/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs'))
      .toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
    expect(extractDriveId('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs'))
      .toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs');
  });

  it('returns null for anything else', () => {
    expect(extractDriveId('')).toBeNull();
    expect(extractDriveId('https://example.com/file/d/abc/view')).toBeNull();
    expect(extractDriveId(null as unknown as string)).toBeNull();
  });
});

describe('backup candidates', () => {
  it('recognises .db files whatever the case', () => {
    expect(looksLikeBackupFile('puffin-backup.db')).toBe(true);
    expect(looksLikeBackupFile('Shared Puffin.DB')).toBe(true);
    expect(looksLikeBackupFile('budget.xlsx')).toBe(false);
    expect(looksLikeBackupFile('puffin-backup.db.txt')).toBe(false);
  });

  it('sorts most recently changed first', () => {
    const older = { id: 'a', name: 'a.db', modifiedTime: '2026-01-01T00:00:00.000Z' };
    const newer = { id: 'b', name: 'b.db', modifiedTime: '2026-09-01T00:00:00.000Z' };

    expect(sortBackupCandidates([older, newer]).map(f => f.id)).toEqual(['b', 'a']);
  });

  it('does not mutate the array it is given', () => {
    const files = [
      { id: 'a', name: 'a.db', modifiedTime: '2026-01-01T00:00:00.000Z' },
      { id: 'b', name: 'b.db', modifiedTime: '2026-09-01T00:00:00.000Z' },
    ];
    sortBackupCandidates(files);

    expect(files.map(f => f.id)).toEqual(['a', 'b']);
  });
});

describe('folder marker', () => {
  it('writes the marker under its own key', () => {
    expect(PUFFIN_FOLDER_APP_PROPERTIES[PUFFIN_FOLDER_MARKER_KEY]).toBe('true');
  });
});

describe('Drive queries', () => {
  it('asks only for folders that are not in the bin', () => {
    const query = buildFolderQuery();

    expect(query).toContain("mimeType='application/vnd.google-apps.folder'");
    expect(query).toContain('trashed=false');
    expect(query).not.toContain('name=');
  });

  it('filters by name when given one', () => {
    expect(buildFolderQuery('  Puffin ')).toContain("name='Puffin'");
  });

  it('escapes a quote in the name rather than breaking the query', () => {
    expect(buildFolderQuery("Ben's budget")).toContain("name='Ben\\'s budget'");
  });

  it('looks for database files that are not folders', () => {
    const query = buildBackupFileQuery();

    expect(query).toContain("name contains '.db'");
    expect(query).toContain("mimeType!='application/vnd.google-apps.folder'");
    expect(query).toContain('trashed=false');
  });
});

describe('mapping Drive responses', () => {
  it('treats our marker as proof the folder is ours', () => {
    expect(toFolderCandidate({ id: 'f', name: 'Puffin', appProperties: { puffinSyncFolder: 'true' } }))
      .toMatchObject({ createdByPuffin: true });
  });

  it('treats anything else as not ours, including a similar property', () => {
    expect(toFolderCandidate({ id: 'f', name: 'Puffin' }).createdByPuffin).toBe(false);
    expect(toFolderCandidate({ id: 'f', name: 'Puffin', appProperties: {} }).createdByPuffin).toBe(false);
    expect(toFolderCandidate({ id: 'f', name: 'Puffin', appProperties: { puffinSyncFolder: 'yes' } }).createdByPuffin)
      .toBe(false);
  });

  it('defaults shared to false when Drive omits it', () => {
    expect(toFolderCandidate({ id: 'f', name: 'Puffin' }).shared).toBe(false);
  });

  it('marks a file owned by someone else as shared with me', () => {
    const file = toBackupCandidate({
      id: 'x', name: 'puffin-backup.db', ownedByMe: false,
      owners: [{ displayName: 'Sam' }], size: '2048',
    });

    expect(file).toMatchObject({ sharedWithMe: true, owner: 'Sam', size: 2048 });
  });

  it('does not mark my own files as shared with me', () => {
    expect(toBackupCandidate({ id: 'x', name: 'a.db', ownedByMe: true }).sharedWithMe).toBe(false);
  });
});

describe('isUsableFolder', () => {
  it('accepts a folder that is not in the bin', () => {
    expect(isUsableFolder({ mimeType: DRIVE_FOLDER_MIME_TYPE, trashed: false })).toBe(true);
    // Drive omits `trashed` unless asked; absent is not trashed
    expect(isUsableFolder({ mimeType: DRIVE_FOLDER_MIME_TYPE })).toBe(true);
  });

  it('rejects a trashed folder, so sync cannot point into the bin', () => {
    expect(isUsableFolder({ mimeType: DRIVE_FOLDER_MIME_TYPE, trashed: true })).toBe(false);
  });

  it('rejects anything that is not a folder', () => {
    expect(isUsableFolder({ mimeType: 'application/octet-stream', trashed: false })).toBe(false);
    expect(isUsableFolder({})).toBe(false);
  });
});
