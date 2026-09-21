'use client';

import { useCallback, useState } from 'react';
import { api } from '@/lib/services';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, Check, FolderPlus, Loader2, RefreshCw, Users } from 'lucide-react';
import { DEFAULT_SYNC_FOLDER_NAME } from '@/lib/sync/drive-selection';
import type {
  DriveBackupCandidate,
  DriveBackupListResponse,
  DriveFolderCandidate,
  DriveFolderListResponse,
  FolderValidationResult,
  SyncFileSelectionResponse,
  SyncFolderSelectionResponse,
} from '@/types/sync';

interface SyncTargetPickerProps {
  /** Full Drive access has been granted, so existing and shared items are visible */
  hasExtendedScope: boolean;
  /** Re-run Google sign-in asking for full access */
  onGrantFullAccess: () => void;
  /** A target was connected — the caller refreshes config and reports success */
  onConnected: (message: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

/**
 * Choosing where sync points: create a folder, use an existing one, or connect
 * to a database shared by another account.
 *
 * This replaces Google's Picker, which cannot run inside the desktop webview.
 * Creating a folder is the only option that works without full Drive access,
 * because Google shows the app only what it created — which is also why the
 * other two paths have to ask for the wider scope first.
 */
export function SyncTargetPicker({
  hasExtendedScope,
  onGrantFullAccess,
  onConnected,
  onError,
  disabled,
}: SyncTargetPickerProps) {
  const [folderName, setFolderName] = useState(DEFAULT_SYNC_FOLDER_NAME);
  const [isWorking, setIsWorking] = useState(false);

  // Folders of that name that Puffin cannot claim as its own
  const [candidates, setCandidates] = useState<DriveFolderCandidate[] | null>(null);

  const [folders, setFolders] = useState<DriveFolderCandidate[] | null>(null);
  const [backups, setBackups] = useState<DriveBackupCandidate[] | null>(null);
  const [folderUrl, setFolderUrl] = useState('');
  const [fileUrl, setFileUrl] = useState('');

  const sharedWarning = (shared?: boolean) =>
    shared ? ' This folder is shared with other people, who will be able to read your database.' : '';

  /** POST to the folder endpoint. api.* resolves with { error }, so check the value. */
  const selectFolder = useCallback(
    async (payload: { name?: string; folderId?: string; create?: boolean }) => {
      setIsWorking(true);
      try {
        const result = await api.post<SyncFolderSelectionResponse>('/api/sync/folder', payload);
        const data = result.data;

        if (data?.needsConfirmation && data.candidates?.length) {
          setCandidates(data.candidates);
          return;
        }

        if (result.error || !data?.success) {
          onError(data?.error || result.error || 'Could not set the sync folder');
          return;
        }

        setCandidates(null);
        onConnected(
          (data.created
            ? `Created "${data.folderName}" in your Google Drive.`
            : `Using your existing "${data.folderName}" folder.`) + sharedWarning(data.shared)
        );
      } finally {
        setIsWorking(false);
      }
    },
    [onConnected, onError]
  );

  const loadFolders = useCallback(async () => {
    setIsWorking(true);
    try {
      const result = await api.get<DriveFolderListResponse>('/api/sync/folders');
      if (result.error || !result.data) {
        onError(result.data?.error || result.error || 'Could not list your Drive folders');
        return;
      }
      setFolders(result.data.folders);
    } finally {
      setIsWorking(false);
    }
  }, [onError]);

  const loadBackups = useCallback(async () => {
    setIsWorking(true);
    try {
      const result = await api.get<DriveBackupListResponse>('/api/sync/backups');
      if (result.error || !result.data) {
        onError(result.data?.error || result.error || 'Could not list database files');
        return;
      }
      setBackups(result.data.files);
    } finally {
      setIsWorking(false);
    }
  }, [onError]);

  const connectFolderUrl = useCallback(async () => {
    if (!folderUrl.trim()) return;
    setIsWorking(true);
    try {
      const result = await api.post<FolderValidationResult>('/api/sync/validate', {
        folderUrl: folderUrl.trim(),
      });
      if (result.error || !result.data?.success) {
        onError(result.data?.error || result.error || 'Could not connect to that folder');
        return;
      }
      setFolderUrl('');
      onConnected(`Connected to folder: ${result.data.folderName}`);
    } finally {
      setIsWorking(false);
    }
  }, [folderUrl, onConnected, onError]);

  const connectFile = useCallback(
    async (url: string) => {
      if (!url.trim()) return;
      setIsWorking(true);
      try {
        const result = await api.post<SyncFileSelectionResponse>('/api/sync/file', {
          fileUrl: url.trim(),
        });
        if (result.error || !result.data?.success) {
          onError(result.data?.error || result.error || 'Could not connect to that file');
          return;
        }
        setFileUrl('');
        onConnected(
          `Connected to ${result.data.fileName}` +
            (result.data.sharedWithMe ? ', shared with you by another account.' : '.')
        );
      } finally {
        setIsWorking(false);
      }
    },
    [onConnected, onError]
  );

  const busy = disabled || isWorking;

  const fullAccessNotice = (what: string) => (
    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700 space-y-2">
      <p className="text-xs text-slate-400">
        {what} needs <strong className="text-slate-300">full Google Drive access</strong>, because
        Google hides everything Puffin did not create. Granting it lets Puffin read and write your
        whole Drive — creating a folder above needs no such permission.
      </p>
      <Button
        onClick={onGrantFullAccess}
        disabled={busy}
        variant="outline"
        size="sm"
        className="border-slate-700 text-slate-300 hover:bg-slate-800"
      >
        Grant full access
      </Button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* 1. Create a folder — the only path that works without full access */}
      <div className="space-y-2">
        <Label htmlFor="sync-folder-name" className="text-slate-300">
          Create a folder in your Drive
        </Label>
        <div className="flex gap-2">
          <Input
            id="sync-folder-name"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder={DEFAULT_SYNC_FOLDER_NAME}
            className="flex-1 bg-slate-800/50 border-slate-700 text-slate-100"
          />
          <Button
            onClick={() => selectFolder({ name: folderName })}
            disabled={busy || !folderName.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 shrink-0"
          >
            {isWorking ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <FolderPlus className="w-4 h-4 mr-2" />
            )}
            Create
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Puffin only gets access to the folder it creates. If it already made one with this name,
          that folder is used again — which is how a second computer joins the same sync.
        </p>
      </div>

      {/* 2. An existing folder — invisible to the app without full access */}
      <div className="space-y-2 border-t border-slate-700/50 pt-4">
        <Label className="text-slate-300">Use a folder you already have</Label>
        {!hasExtendedScope ? (
          fullAccessNotice('Choosing a folder you already have')
        ) : (
          <div className="space-y-2">
            <Button
              onClick={loadFolders}
              disabled={busy}
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {folders ? 'Refresh list' : 'Show my folders'}
            </Button>

            {folders && folders.length === 0 && (
              <p className="text-xs text-slate-500">No folders found in your Drive.</p>
            )}

            {folders && folders.length > 0 && (
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {folders.map((folder) => (
                  <div
                    key={folder.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-800/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate" title={folder.name}>
                        {folder.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {folder.createdByPuffin ? 'Created by Puffin' : 'Your folder'}
                        {folder.shared ? ' · shared with others' : ''}
                      </p>
                    </div>
                    <Button
                      onClick={() => selectFolder({ folderId: folder.id })}
                      disabled={busy}
                      variant="ghost"
                      size="sm"
                      aria-label={`Use folder ${folder.name}`}
                      className="shrink-0 text-slate-400 hover:text-emerald-400"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={folderUrl}
                onChange={(e) => setFolderUrl(e.target.value)}
                placeholder="Or paste a folder link"
                aria-label="Google Drive folder link"
                className="flex-1 bg-slate-800/50 border-slate-700 text-slate-100"
              />
              <Button
                onClick={connectFolderUrl}
                disabled={busy || !folderUrl.trim()}
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 shrink-0"
              >
                Connect
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 3. A database shared from another account */}
      <div className="space-y-2 border-t border-slate-700/50 pt-4">
        <Label className="text-slate-300 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-400" />
          Connect to a database shared with you
        </Label>
        <p className="text-xs text-slate-400">
          For sharing one set of finances between two Google accounts. The other account shares
          the database file with you, then you connect to it here.
        </p>
        {!hasExtendedScope ? (
          fullAccessNotice('Connecting to a database shared by someone else')
        ) : (
          <div className="space-y-2">
            <Button
              onClick={loadBackups}
              disabled={busy}
              variant="outline"
              size="sm"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {backups ? 'Refresh list' : 'Show database files'}
            </Button>

            {backups && backups.length === 0 && (
              <p className="text-xs text-slate-500">
                No database files found. Ask the other account to share the file with you.
              </p>
            )}

            {backups && backups.length > 0 && (
              <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                {backups.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-800/50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-slate-200 truncate" title={file.name}>
                        {file.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {file.sharedWithMe ? `Shared by ${file.owner ?? 'another account'}` : 'Yours'}
                        {file.modifiedTime
                          ? ` · ${new Date(file.modifiedTime).toLocaleDateString()}`
                          : ''}
                      </p>
                    </div>
                    <Button
                      onClick={() => connectFile(file.id)}
                      disabled={busy}
                      variant="ghost"
                      size="sm"
                      aria-label={`Connect to ${file.name}`}
                      className="shrink-0 text-slate-400 hover:text-blue-400"
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Input
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                placeholder="Or paste a file link"
                aria-label="Google Drive file link"
                className="flex-1 bg-slate-800/50 border-slate-700 text-slate-100"
              />
              <Button
                onClick={() => connectFile(fileUrl)}
                disabled={busy || !fileUrl.trim()}
                variant="outline"
                className="border-slate-700 text-slate-300 hover:bg-slate-800 shrink-0"
              >
                Connect
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* A folder of that name exists that Puffin cannot prove it created */}
      <AlertDialog open={candidates !== null} onOpenChange={(open) => !open && setCandidates(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              A folder called &ldquo;{folderName}&rdquo; already exists
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Puffin cannot tell whether it created {candidates?.length === 1 ? 'this folder' : 'these folders'},
              so it will not use {candidates?.length === 1 ? 'it' : 'one'} without asking. Use an existing
              folder, or create another with the same name.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2">
            {candidates?.map((folder) => (
              <div
                key={folder.id}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-800/50"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 truncate">{folder.name}</p>
                  <p className="text-xs text-slate-500">
                    {folder.createdTime
                      ? `Created ${new Date(folder.createdTime).toLocaleDateString()}`
                      : 'Created date unknown'}
                    {folder.shared ? ' · shared with others' : ''}
                  </p>
                </div>
                <Button
                  onClick={() => selectFolder({ folderId: folder.id })}
                  disabled={busy}
                  size="sm"
                  aria-label={`Use folder ${folder.name}`}
                  className="shrink-0 bg-emerald-600 hover:bg-emerald-500"
                >
                  Use this
                </Button>
              </div>
            ))}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => selectFolder({ name: folderName, create: true })}
              className="bg-slate-700 hover:bg-slate-600 text-slate-100"
            >
              Create another
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
