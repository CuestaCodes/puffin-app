'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Plus, Edit2, Trash2, Loader2, AlertTriangle, Wallet 
} from 'lucide-react';
import type { Source } from '@/types/database';

interface SourceManagementProps {
  className?: string;
}

export function SourceManagement({ className }: SourceManagementProps) {
  // Data
  const [sources, setSources] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Editing state
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [editingName, setEditingName] = useState('');
  
  // New source state
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [newName, setNewName] = useState('');
  
  // Delete state
  const [deletingSource, setDeletingSource] = useState<Source | null>(null);
  
  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSources = useCallback(async () => {
    try {
      const response = await fetch('/api/sources');
      if (response.ok) {
        const data = await response.json();
        setSources(data.sources || []);
      }
    } catch (err) {
      console.error('Failed to fetch sources:', err);
      setError('Failed to load sources');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  // Edit source
  const handleEditSource = (source: Source) => {
    setEditingSource(source);
    setEditingName(source.name);
  };

  const handleSaveSourceName = async () => {
    if (!editingSource || !editingName.trim()) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/sources/${editingSource.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingName.trim() }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update source');
      }
      
      setEditingSource(null);
      fetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update source');
    } finally {
      setIsSaving(false);
    }
  };

  // New source
  const handleCreateSource = async () => {
    if (!newName.trim()) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      const response = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create source');
      }
      
      setShowNewDialog(false);
      setNewName('');
      fetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create source');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete source
  const handleDeleteSource = async () => {
    if (!deletingSource) return;
    
    setIsSaving(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/sources/${deletingSource.id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete source');
      }
      
      setDeletingSource(null);
      fetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete source');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className={`border-slate-800 bg-slate-900/50 ${className}`}>
        <CardHeader className="py-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-800 rounded animate-pulse" />
            <div className="h-5 w-32 bg-slate-800 rounded animate-pulse" />
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <div className="space-y-2">
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-10 bg-slate-800/30 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={`border-slate-800 bg-slate-900/50 ${className}`}>
        <CardHeader className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10 border border-violet-500/20">
                <Wallet className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-100">Sources</CardTitle>
                <CardDescription className="text-slate-400">
                  Track where your transactions come from (e.g., Bank Account, Credit Card)
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNewDialog(true)}
              className="text-violet-400 hover:text-violet-300"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Source
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="pt-0 pb-4">
          {/* Error display */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/50 p-3 flex items-center gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                className="ml-auto text-red-400 hover:text-red-300"
              >
                Dismiss
              </Button>
            </div>
          )}

          {sources.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Wallet className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-sm">No sources yet.</p>
              <p className="text-xs mt-1">Add sources like "Bendigo Bank", "Credit Card", "PayPal"</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewDialog(true)}
                className="mt-4 gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Your First Source
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800/50 group"
                >
                  <span className="text-slate-200">{source.name}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleEditSource(source)}
                      className="text-slate-400 hover:text-slate-200"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeletingSource(source)}
                      className="text-slate-400 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Source Dialog */}
      <Dialog open={!!editingSource} onOpenChange={(open) => !open && setEditingSource(null)}>
        <DialogContent className="sm:max-w-[400px] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Rename Source</DialogTitle>
            <DialogDescription className="text-slate-400">
              Update the name for this source.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="source-name" className="text-slate-300">Name</Label>
            <Input
              id="source-name"
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              className="mt-2 bg-slate-800/50 border-slate-700 text-slate-100"
              placeholder="Source name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveSourceName();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingSource(null)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveSourceName}
              disabled={isSaving || !editingName.trim()}
              className="bg-violet-600 hover:bg-violet-500"
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Source Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-[400px] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Add Source</DialogTitle>
            <DialogDescription className="text-slate-400">
              Create a new source to track where transactions come from.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="new-source-name" className="text-slate-300">Name</Label>
            <Input
              id="new-source-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-2 bg-slate-800/50 border-slate-700 text-slate-100"
              placeholder="e.g., Bendigo Bank, Credit Card"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSource();
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNewDialog(false);
                setNewName('');
              }}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateSource}
              disabled={isSaving || !newName.trim()}
              className="bg-violet-600 hover:bg-violet-500"
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Source Dialog */}
      <Dialog open={!!deletingSource} onOpenChange={(open) => !open && setDeletingSource(null)}>
        <DialogContent className="sm:max-w-[400px] bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
              Delete Source
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to delete <strong className="text-slate-200">{deletingSource?.name}</strong>?
              <br /><br />
              Transactions using this source will have their source set to "None".
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingSource(null)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteSource}
              disabled={isSaving}
              variant="destructive"
              className="bg-red-600 hover:bg-red-500"
            >
              {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

