'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { NoteParsed } from '@/types/database';

interface NoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note?: NoteParsed | null;
  onSave: (data: { title: string; content: string; tags: string[] }) => Promise<void>;
}

export function NoteDialog({ open, onOpenChange, note, onSave }: NoteDialogProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const isEditing = !!note;

  // Reset form when dialog opens/closes or note changes
  useEffect(() => {
    if (open) {
      if (note) {
        setTitle(note.title);
        setContent(note.content || '');
        setTags(note.tags);
      } else {
        setTitle('');
        setContent('');
        setTags([]);
      }
      setTagInput('');
    }
  }, [open, note]);

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        content: content.trim(),
        tags,
      });
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="text-white">
            {isEditing ? 'Edit Note' : 'New Note'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title" className="text-slate-300">
              Title
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title..."
              className="bg-slate-800/50 border-slate-700 text-white"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="content" className="text-slate-300">
              Content
            </Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your note..."
              rows={8}
              className="bg-slate-800/50 border-slate-700 text-white resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tags" className="text-slate-300">
              Tags
            </Label>
            <div className="flex gap-2">
              <Input
                id="tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add a tag..."
                className="bg-slate-800/50 border-slate-700 text-white"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddTag}
                className="border-slate-700 hover:bg-slate-800"
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="hover:text-cyan-200"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-slate-700 hover:bg-slate-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || isSaving}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500"
            >
              {isSaving ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Note'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
