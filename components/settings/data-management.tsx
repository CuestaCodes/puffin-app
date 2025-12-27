'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/services';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  Download,
  Upload,
  Database,
  Trash2,
  HardDrive,
  FileDown,
  FileUp,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Calendar,
} from 'lucide-react';

interface DataManagementProps {
  onBack?: () => void;
}

interface DatabaseStats {
  fileSize: number;
  transactionCount: number;
  categoryCount: number;
  ruleCount: number;
  sourceCount: number;
  earliestTransaction: string | null;
  latestTransaction: string | null;
}

interface LocalBackup {
  filename: string;
  size: number;
  createdAt: string;
}

export function DataManagement({ onBack }: DataManagementProps) {
  // Stats
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // Backups
  const [backups, setBackups] = useState<LocalBackup[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState(true);

  // Operations
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Dialogs
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const [clearConfirmText, setClearConfirmText] = useState('');
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isClearing, setIsClearing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Messages
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch database stats
  const fetchStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const result = await api.get<DatabaseStats>('/api/data/stats');
      if (result.data) {
        setStats(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  // Fetch local backups
  const fetchBackups = useCallback(async () => {
    setIsLoadingBackups(true);
    try {
      const result = await api.get<{ backups: LocalBackup[]; message?: string }>('/api/data/backups');
      if (result.data) {
        setBackups(result.data.backups || []);
      }
    } catch (error) {
      console.error('Failed to fetch backups:', error);
    } finally {
      setIsLoadingBackups(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchBackups();
  }, [fetchStats, fetchBackups]);

  // Format bytes to human readable
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString();
  };

  // Show temporary message
  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const showError = (message: string) => {
    setErrorMessage(message);
    setSuccessMessage(null);
    setTimeout(() => setErrorMessage(null), 5000);
  };

  // Export transactions as CSV
  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const result = await api.get<{ csv: string; filename: string } | Blob>('/api/data/export/transactions');

      // Handle Tauri mode (returns data object) vs web mode (returns blob)
      if (result.data && 'csv' in result.data) {
        // Tauri mode - create blob from CSV string
        const blob = new Blob([result.data.csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.data.filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        showSuccess('Transactions exported successfully');
      } else {
        // Web mode fallback - direct fetch for blob
        const response = await fetch('/api/data/export/transactions');
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `puffin-transactions-${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          showSuccess('Transactions exported successfully');
        } else {
          showError('Failed to export transactions');
        }
      }
    } catch (error) {
      console.error('Export error:', error);
      showError('Failed to export transactions');
    } finally {
      setIsExporting(false);
    }
  };

  // Export database backup
  const handleExportBackup = async () => {
    setIsExportingBackup(true);
    try {
      const result = await api.get<{ success: boolean; path?: string; cancelled?: boolean }>('/api/data/export/backup');

      if (result.data?.success) {
        showSuccess('Database backup exported successfully');
      } else if (result.data?.cancelled) {
        // User cancelled the dialog
      } else if (result.error) {
        showError(result.error);
      } else {
        // Web mode fallback
        const response = await fetch('/api/data/export/backup');
        if (response.ok) {
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `puffin-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          showSuccess('Database backup exported successfully');
        } else {
          showError('Failed to export backup');
        }
      }
    } catch (error) {
      console.error('Backup export error:', error);
      showError('Failed to export backup');
    } finally {
      setIsExportingBackup(false);
    }
  };

  // Restore from backup file
  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.db')) {
      showError('Please select a valid .db backup file');
      return;
    }

    setIsRestoring(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/data/import/backup', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        showSuccess('Database restored successfully. Reloading...');
        setTimeout(() => window.location.reload(), 1500);
      } else {
        const data = await response.json();
        showError(data.error || 'Failed to restore backup');
      }
    } catch (error) {
      console.error('Restore error:', error);
      showError('Failed to restore backup');
    } finally {
      setIsRestoring(false);
      // Reset file input
      event.target.value = '';
    }
  };

  // Clear all transactions
  const handleClear = async () => {
    if (clearConfirmText !== 'CLEAR') return;

    setIsClearing(true);
    try {
      const result = await api.post<{ success: boolean }>('/api/data/clear', {});
      if (result.data?.success) {
        showSuccess('All transactions cleared');
        setShowClearDialog(false);
        setClearConfirmText('');
        fetchStats();
      } else {
        showError(result.error || 'Failed to clear transactions');
      }
    } catch (error) {
      console.error('Clear error:', error);
      showError('Failed to clear transactions');
    } finally {
      setIsClearing(false);
    }
  };

  // Full reset
  const handleReset = async () => {
    if (resetConfirmText !== 'RESET') return;

    setIsResetting(true);
    try {
      const result = await api.post<{ success: boolean }>('/api/data/reset', {});
      if (result.data?.success) {
        showSuccess('Database reset. Redirecting to setup...');
        setTimeout(() => window.location.href = '/', 1500);
      } else {
        showError(result.error || 'Failed to reset database');
      }
    } catch (error) {
      console.error('Reset error:', error);
      showError('Failed to reset database');
    } finally {
      setIsResetting(false);
    }
  };

  // Open delete confirmation dialog
  const confirmDeleteBackup = (filename: string) => {
    setSelectedBackup(filename);
    setShowDeleteDialog(true);
  };

  // Delete a local backup
  const handleDeleteBackup = async () => {
    if (!selectedBackup) return;

    setIsDeleting(true);
    try {
      const result = await api.delete<{ success: boolean }>(
        `/api/data/backups/${encodeURIComponent(selectedBackup)}`
      );
      if (result.data?.success) {
        showSuccess('Backup deleted');
        setShowDeleteDialog(false);
        setSelectedBackup(null);
        fetchBackups();
      } else {
        showError(result.error || 'Failed to delete backup');
      }
    } catch (error) {
      console.error('Delete backup error:', error);
      showError('Failed to delete backup');
    } finally {
      setIsDeleting(false);
    }
  };

  // Open restore confirmation dialog
  const confirmRestoreLocalBackup = (filename: string) => {
    setSelectedBackup(filename);
    setShowRestoreDialog(true);
  };

  // Restore from local backup
  const handleRestoreLocalBackup = async () => {
    if (!selectedBackup) return;

    setIsRestoring(true);
    try {
      const result = await api.post<{ success: boolean }>(
        `/api/data/backups/${encodeURIComponent(selectedBackup)}`,
        {}
      );
      if (result.data?.success) {
        showSuccess('Restored from backup. Reloading...');
        setShowRestoreDialog(false);
        setSelectedBackup(null);
        setTimeout(() => window.location.reload(), 1500);
      } else {
        showError(result.error || 'Failed to restore from backup');
      }
    } catch (error) {
      console.error('Restore error:', error);
      showError('Failed to restore from backup');
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        {onBack && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onBack}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">Data Management</h1>
          <p className="text-slate-400 mt-1">
            Export, import, and manage your data
          </p>
        </div>
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/50 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <p className="text-emerald-300">{successMessage}</p>
        </div>
      )}
      {errorMessage && (
        <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/50 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <p className="text-red-300">{errorMessage}</p>
        </div>
      )}

      {/* Database Statistics */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-950/50 border border-blue-900/50">
              <Database className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">Database Statistics</CardTitle>
              <CardDescription className="text-slate-400">Overview of your data</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingStats ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Database Size</p>
                <p className="text-lg font-semibold text-slate-100">{formatBytes(stats.fileSize)}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Transactions</p>
                <p className="text-lg font-semibold text-slate-100">{stats.transactionCount.toLocaleString()}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Categories</p>
                <p className="text-lg font-semibold text-slate-100">{stats.categoryCount}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Rules</p>
                <p className="text-lg font-semibold text-slate-100">{stats.ruleCount}</p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50 col-span-2">
                <p className="text-sm text-slate-400">Date Range</p>
                <p className="text-lg font-semibold text-slate-100">
                  {formatDate(stats.earliestTransaction)} - {formatDate(stats.latestTransaction)}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-slate-800/50">
                <p className="text-sm text-slate-400">Sources</p>
                <p className="text-lg font-semibold text-slate-100">{stats.sourceCount}</p>
              </div>
            </div>
          ) : (
            <p className="text-slate-400">Failed to load statistics</p>
          )}
        </CardContent>
      </Card>

      {/* Export Section */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-950/50 border border-emerald-900/50">
              <Download className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">Export Data</CardTitle>
              <CardDescription className="text-slate-400">Download your data</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              onClick={handleExportCSV}
              disabled={isExporting}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500"
            >
              {isExporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4 mr-2" />
              )}
              Export Transactions (CSV)
            </Button>
            <Button
              onClick={handleExportBackup}
              disabled={isExportingBackup}
              variant="outline"
              className="flex-1 border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              {isExportingBackup ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <HardDrive className="w-4 h-4 mr-2" />
              )}
              Export Full Backup (.db)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Import Section */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-950/50 border border-cyan-900/50">
              <Upload className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">Import & Restore</CardTitle>
              <CardDescription className="text-slate-400">Restore from a backup file</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg border-2 border-dashed border-slate-700 hover:border-cyan-600 transition-colors">
            <label className="flex flex-col items-center cursor-pointer">
              <FileUp className="w-8 h-8 text-slate-400 mb-2" />
              <span className="text-sm text-slate-300">
                {isRestoring ? 'Restoring...' : 'Click to upload a .db backup file'}
              </span>
              <span className="text-xs text-slate-500 mt-1">
                This will replace your current database
              </span>
              <input
                type="file"
                accept=".db"
                onChange={handleRestoreBackup}
                disabled={isRestoring}
                className="hidden"
              />
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Local Backups */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-950/50 border border-violet-900/50">
              <Calendar className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">Local Backups</CardTitle>
              <CardDescription className="text-slate-400">
                Automatic backups created before sync operations
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingBackups ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
          ) : backups.length > 0 ? (
            <div className="space-y-2">
              {backups.map((backup) => (
                <div
                  key={backup.filename}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-200">{backup.filename}</p>
                    <p className="text-xs text-slate-400">
                      {formatBytes(backup.size)} - {new Date(backup.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => confirmRestoreLocalBackup(backup.filename)}
                      disabled={isRestoring}
                      className="text-slate-400 hover:text-cyan-400"
                    >
                      <Upload className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => confirmDeleteBackup(backup.filename)}
                      disabled={isDeleting}
                      className="text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center py-4">No local backups found</p>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-900/50 bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-950/50 border border-red-900/50">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-red-400">Danger Zone</CardTitle>
              <CardDescription className="text-slate-400">
                Irreversible actions - proceed with caution
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Button
              variant="outline"
              onClick={() => setShowClearDialog(true)}
              className="flex-1 border-red-900/50 text-red-400 hover:bg-red-950/50 hover:border-red-700"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Clear All Transactions
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowResetDialog(true)}
              className="flex-1 border-red-900/50 text-red-400 hover:bg-red-950/50 hover:border-red-700"
            >
              <AlertTriangle className="w-4 h-4 mr-2" />
              Full App Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Clear Confirmation Dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Clear All Transactions
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              This will permanently delete all transactions. Categories, rules, and sources will be kept.
              A backup will be created before clearing.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="clear-confirm" className="text-slate-300">
              Type <span className="font-mono text-red-400">CLEAR</span> to confirm
            </Label>
            <Input
              id="clear-confirm"
              value={clearConfirmText}
              onChange={(e) => setClearConfirmText(e.target.value)}
              className="mt-2 bg-slate-800 border-slate-700 text-slate-100"
              placeholder="CLEAR"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowClearDialog(false);
                setClearConfirmText('');
              }}
              className="text-slate-400"
            >
              Cancel
            </Button>
            <Button
              onClick={handleClear}
              disabled={clearConfirmText !== 'CLEAR' || isClearing}
              className="bg-red-600 hover:bg-red-500"
            >
              {isClearing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Clear Transactions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Full App Reset
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              This will permanently delete ALL data including transactions, categories, rules, sources,
              local backups, and disconnect Google Drive sync. You will need to set up the app from scratch.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reset-confirm" className="text-slate-300">
              Type <span className="font-mono text-red-400">RESET</span> to confirm
            </Label>
            <Input
              id="reset-confirm"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              className="mt-2 bg-slate-800 border-slate-700 text-slate-100"
              placeholder="RESET"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowResetDialog(false);
                setResetConfirmText('');
              }}
              className="text-slate-400"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReset}
              disabled={resetConfirmText !== 'RESET' || isResetting}
              className="bg-red-600 hover:bg-red-500"
            >
              {isResetting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Reset App
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Backup Confirmation Dialog */}
      <Dialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-cyan-400 flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Restore from Backup
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              This will replace your current database with the backup. A pre-restore backup will be created automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-300">
              Restore from: <span className="font-mono text-cyan-400">{selectedBackup}</span>
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowRestoreDialog(false);
                setSelectedBackup(null);
              }}
              className="text-slate-400"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRestoreLocalBackup}
              disabled={isRestoring}
              className="bg-cyan-600 hover:bg-cyan-500"
            >
              {isRestoring ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Restore Backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Backup Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Delete Backup
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to delete this backup? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-300">
              Delete: <span className="font-mono text-red-400">{selectedBackup}</span>
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowDeleteDialog(false);
                setSelectedBackup(null);
              }}
              className="text-slate-400"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteBackup}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-500"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Delete Backup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
