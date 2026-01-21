'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/services';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Plus, Search, Edit2, Trash2, FileText, X,
} from 'lucide-react';
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
import { NoteDialog } from '@/components/notes/note-dialog';
import type { NoteParsed } from '@/types/database';
import { cn } from '@/lib/utils';

// URL pattern for detecting links in note content
const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+/;
const URL_SPLIT_PATTERN = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;

/**
 * Open a URL in the default browser
 */
function openUrl(url: string): void {
  import('@tauri-apps/plugin-shell')
    .then(({ open }) => open(url))
    .catch(() => {
      // Fallback to window.open if shell plugin not available
      window.open(url, '_blank');
    });
}

/**
 * Check if a string is a URL
 */
function isUrl(text: string): boolean {
  return URL_PATTERN.test(text) && text.match(URL_PATTERN)?.[0] === text;
}

/**
 * Render text content with clickable links
 */
function ContentWithLinks({ content }: { content: string }) {
  // Split by URL pattern, keeping the URLs in the result
  const parts = content.split(URL_SPLIT_PATTERN);

  return (
    <>
      {parts.map((part, index) => {
        if (isUrl(part)) {
          return (
            <a
              key={index}
              href={part}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openUrl(part);
              }}
              className="text-cyan-400 hover:text-cyan-300 underline break-all"
            >
              {part}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

export function NotesPage() {
  const [notes, setNotes] = useState<NoteParsed[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteParsed | null>(null);
  const [deletingNote, setDeletingNote] = useState<NoteParsed | null>(null);

  // Debounce ref
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotes = useCallback(async (search?: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);

      const result = await api.get<{ notes: NoteParsed[] }>(`/api/notes?${params}`);
      if (result.data) {
        setNotes(result.data.notes);
      }
    } catch (error) {
      console.error('Failed to fetch notes:', error);
      toast.error('Failed to load notes');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchTags = useCallback(async () => {
    try {
      const result = await api.get<{ tags: string[] }>('/api/notes?tagsOnly=true');
      if (result.data) {
        setAllTags(result.data.tags);
      }
    } catch (error) {
      console.error('Failed to fetch tags:', error);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
    fetchTags();
  }, [fetchNotes, fetchTags]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = setTimeout(() => {
      fetchNotes(value);
    }, 300);
  };

  const handleCreateNote = () => {
    setEditingNote(null);
    setDialogOpen(true);
  };

  const handleEditNote = (note: NoteParsed) => {
    setEditingNote(note);
    setDialogOpen(true);
  };

  const handleSaveNote = async (data: { title: string; content: string; tags: string[] }) => {
    try {
      if (editingNote) {
        // Update existing
        const result = await api.patch<{ note: NoteParsed }>(`/api/notes/${editingNote.id}`, data);
        if (result.error) throw new Error(result.error);
        toast.success('Note updated');
      } else {
        // Create new
        const result = await api.post<{ note: NoteParsed }>('/api/notes', data);
        if (result.error) throw new Error(result.error);
        toast.success('Note created');
      }
      fetchNotes(searchQuery);
      fetchTags();
    } catch (error) {
      console.error('Failed to save note:', error);
      toast.error('Failed to save note');
      throw error;
    }
  };

  const handleDeleteNote = async () => {
    if (!deletingNote) return;

    try {
      const result = await api.delete(`/api/notes/${deletingNote.id}`);
      if (result.error) throw new Error(result.error);
      toast.success('Note deleted');
      fetchNotes(searchQuery);
      fetchTags();
    } catch (error) {
      console.error('Failed to delete note:', error);
      toast.error('Failed to delete note');
    } finally {
      setDeletingNote(null);
    }
  };

  // Filter notes by selected tag
  const filteredNotes = selectedTag
    ? notes.filter(note => note.tags.includes(selectedTag))
    : notes;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notes</h1>
          <p className="text-sm text-slate-400">
            Financial planning notes and reminders
          </p>
        </div>
        <Button
          onClick={handleCreateNote}
          className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Note
        </Button>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-10 bg-slate-800/50 border-slate-700 text-white"
          />
        </div>

        {/* Tag filters */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-slate-400">Tags:</span>
            {selectedTag && (
              <button
                onClick={() => setSelectedTag(null)}
                className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-slate-700 text-slate-300 hover:bg-slate-600"
              >
                Clear
                <X className="h-3 w-3" />
              </button>
            )}
            {allTags.map((tag) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={cn(
                  'px-2 py-1 text-xs rounded-full border transition-colors',
                  selectedTag === tag
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-600'
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notes List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-cyan-500"></div>
        </div>
      ) : filteredNotes.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="w-12 h-12 text-slate-600 mb-4" />
            <h3 className="text-lg font-medium text-slate-300 mb-2">
              {searchQuery || selectedTag ? 'No notes found' : 'No notes yet'}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              {searchQuery || selectedTag
                ? 'Try adjusting your search or filters'
                : 'Create your first note to get started'}
            </p>
            {!searchQuery && !selectedTag && (
              <Button
                onClick={handleCreateNote}
                variant="outline"
                className="border-slate-700 hover:bg-slate-800"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Note
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredNotes.map((note) => (
            <Card
              key={note.id}
              className="border-slate-800 bg-slate-900/50 hover:bg-slate-900/70 transition-colors"
            >
              <CardHeader className="pb-2">
                <div className="flex items-start gap-2 overflow-hidden">
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <CardTitle className="text-base font-medium text-white truncate">
                      {note.title}
                    </CardTitle>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditNote(note)}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-800"
                      aria-label="Edit note"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingNote(note)}
                      className="h-8 w-8 p-0 text-slate-400 hover:text-red-400 hover:bg-slate-800"
                      aria-label="Delete note"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {note.content && (
                  <p className="text-sm text-slate-400 line-clamp-3 mb-3">
                    <ContentWithLinks content={note.content} />
                  </p>
                )}
                {note.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {note.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 text-[10px] rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  Updated {formatDate(note.updated_at)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Note Dialog */}
      <NoteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        note={editingNote}
        onSave={handleSaveNote}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingNote} onOpenChange={(open) => !open && setDeletingNote(null)}>
        <AlertDialogContent className="bg-slate-900 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Delete Note</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Are you sure you want to delete &ldquo;{deletingNote?.title}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-700 hover:bg-slate-800">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteNote}
              className="bg-red-600 hover:bg-red-500"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
