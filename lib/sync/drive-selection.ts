/**
 * Choosing where Drive sync points — pure logic, shared by both paths.
 *
 * No Drive calls and no Node imports live here, so the dev routes, the Tauri
 * handlers and the Settings UI all apply the same rules. The I/O around it is
 * in app/api/sync/** and lib/services/handlers/sync.ts.
 *
 * Google's Picker used to do this job. It cannot run in WebView2 (see
 * "Never Embed a Third-Party Sign-In or Picker Frame" in CLAUDE.md), and
 * removing it changes what is reachable at each scope:
 *
 * - `drive.file` (standard) — the app sees only what it created. It can make a
 *   folder and use it forever, on any device signed into the same account, but
 *   it cannot see a folder that already exists.
 * - `drive` (extended) — everything, including files shared with the user.
 *   Needed for choosing an existing folder, and for multi-account sync, where
 *   the database was created by somebody else's copy of the app.
 */

import { extractFolderIdFromUrl } from '@/types/sync';
import type { DriveBackupCandidate, DriveFolderCandidate } from '@/types/sync';

export type { DriveBackupCandidate, DriveFolderCandidate };

/** Default name offered when creating a sync folder. The user can edit it. */
export const DEFAULT_SYNC_FOLDER_NAME = 'Puffin';

/**
 * Private marker written to folders Puffin creates.
 *
 * `appProperties` is only readable by the app that set it, which makes it proof
 * of "we made this" — a name match is not. Without it, a user's own folder
 * called "Puffin" (visible once full access is granted) could be adopted
 * silently and have a financial database written into it.
 */
export const PUFFIN_FOLDER_MARKER_KEY = 'puffinSyncFolder';
export const PUFFIN_FOLDER_MARKER_VALUE = 'true';

export const PUFFIN_FOLDER_APP_PROPERTIES: Record<string, string> = {
  [PUFFIN_FOLDER_MARKER_KEY]: PUFFIN_FOLDER_MARKER_VALUE,
};

export const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

/** What the user is trying to do, and therefore which scope it needs. */
export type SyncTargetAction = 'create-folder' | 'existing-folder' | 'shared-file';

/**
 * Only creating a folder works at the standard scope. Anything the app did not
 * create — an existing folder, or a database shared from another account — is
 * invisible without full access, which is why those paths must ask first.
 */
export function requiresFullDriveAccess(action: SyncTargetAction): boolean {
  return action !== 'create-folder';
}

export type SyncFolderChoice =
  /** Exactly one folder we made: use it, no prompt */
  | { action: 'reuse'; folder: DriveFolderCandidate }
  /** Needs a human: several of ours, or one we did not make */
  | { action: 'confirm'; candidates: DriveFolderCandidate[] }
  /** Nothing matching exists */
  | { action: 'create' };

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Newest first, so a confirm list leads with the most likely folder. */
function byNewest(a: DriveFolderCandidate, b: DriveFolderCandidate): number {
  return new Date(b.createdTime ?? 0).getTime() - new Date(a.createdTime ?? 0).getTime();
}

/**
 * Decide what to do about a folder of this name.
 *
 * Reuse is what protects a second device: left to create, it would make its own
 * "Puffin" folder and sync to that, while both machines reported a healthy
 * connection and never saw each other's data.
 */
export function chooseSyncFolder(
  name: string,
  candidates: DriveFolderCandidate[]
): SyncFolderChoice {
  const matching = candidates.filter(folder => sameName(folder.name, name));
  const ours = matching.filter(folder => folder.createdByPuffin).sort(byNewest);

  if (ours.length === 1) return { action: 'reuse', folder: ours[0] };
  if (ours.length > 1) return { action: 'confirm', candidates: ours };

  const theirs = matching.filter(folder => !folder.createdByPuffin).sort(byNewest);
  if (theirs.length > 0) return { action: 'confirm', candidates: theirs };

  return { action: 'create' };
}

/**
 * Drive id from a folder URL, a file URL, or a bare id.
 *
 * Folder URLs and bare ids are handled by extractFolderIdFromUrl, which has its
 * own tests; this adds the `/file/d/<id>/` shape used by backup files.
 */
export function extractDriveId(input: string): string | null {
  if (!input || typeof input !== 'string') return null;

  const fromFolderOrId = extractFolderIdFromUrl(input);
  if (fromFolderOrId) return fromFolderOrId;

  const fileMatch = input.trim().match(/drive\.google\.com\/file\/d\/([^/?#]+)/);
  return fileMatch?.[1] ?? null;
}

/**
 * Whether a Drive file looks like a Puffin database, used to keep the
 * "shared with you" list to plausible candidates. Deliberately loose: a
 * database copied by hand may be renamed, and SQLite files have no distinct
 * MIME type in Drive.
 */
export function looksLikeBackupFile(name: string): boolean {
  return /\.db$/i.test(name.trim());
}

/** Most recently changed first — the copy someone just shared is the one wanted. */
export function sortBackupCandidates(files: DriveBackupCandidate[]): DriveBackupCandidate[] {
  return [...files].sort(
    (a, b) => new Date(b.modifiedTime ?? 0).getTime() - new Date(a.modifiedTime ?? 0).getTime()
  );
}

/**
 * Field lists and queries, shared so the two transports cannot drift.
 *
 * The dev path calls these through the googleapis client and the Tauri path
 * through fetch, but both must ask Drive for the same thing — a missing
 * `appProperties` here would silently turn "our folder" into "someone's
 * folder" on one path only.
 */
export const DRIVE_FOLDER_FIELDS = 'id,name,createdTime,shared,appProperties';
export const DRIVE_FILE_FIELDS = 'id,name,mimeType,shared,modifiedTime,size,ownedByMe,owners(displayName)';

/** Single-quote is the only character that can break a Drive query string. */
function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** Folders, optionally of one name. Trashed folders must never be offered. */
export function buildFolderQuery(name?: string): string {
  const parts = [`mimeType='${DRIVE_FOLDER_MIME_TYPE}'`, 'trashed=false'];
  if (name?.trim()) parts.push(`name='${escapeDriveQueryValue(name.trim())}'`);
  return parts.join(' and ');
}

/**
 * Candidate database files, including ones shared with this account — which is
 * the whole point for multi-account sync, where the file belongs to someone else.
 */
export function buildBackupFileQuery(): string {
  return `name contains '.db' and mimeType!='${DRIVE_FOLDER_MIME_TYPE}' and trashed=false`;
}

interface RawDriveFolder {
  id?: string | null;
  name?: string | null;
  createdTime?: string | null;
  shared?: boolean | null;
  appProperties?: Record<string, string> | null;
}

interface RawDriveFile {
  id?: string | null;
  name?: string | null;
  shared?: boolean | null;
  modifiedTime?: string | null;
  size?: string | number | null;
  ownedByMe?: boolean | null;
  owners?: { displayName?: string | null }[] | null;
}

export function toFolderCandidate(raw: RawDriveFolder): DriveFolderCandidate {
  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    createdByPuffin: raw.appProperties?.[PUFFIN_FOLDER_MARKER_KEY] === PUFFIN_FOLDER_MARKER_VALUE,
    shared: raw.shared ?? false,
    createdTime: raw.createdTime ?? null,
  };
}

export function toBackupCandidate(raw: RawDriveFile): DriveBackupCandidate {
  return {
    id: raw.id ?? '',
    name: raw.name ?? '',
    sharedWithMe: raw.ownedByMe === false,
    owner: raw.owners?.[0]?.displayName ?? null,
    modifiedTime: raw.modifiedTime ?? null,
    size: raw.size === null || raw.size === undefined ? null : Number(raw.size),
  };
}
