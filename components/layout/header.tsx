'use client';

import { Button } from '@/components/ui/button';
import { Menu, LogOut, Cloud, CloudOff } from 'lucide-react';

interface HeaderProps {
  onToggleSidebar: () => void;
  onLogout: () => void;
}

export function Header({ onToggleSidebar, onLogout }: HeaderProps) {
  // TODO: Implement last synced state from sync feature
  const lastSynced: Date | null = null;
  
  return (
    <header className="h-16 flex items-center justify-between px-6 bg-slate-900 border-b border-slate-800">
      {/* Left side */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="md:hidden text-slate-400 hover:text-slate-200"
        >
          <Menu className="w-5 h-5" />
        </Button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-4">
        {/* Sync status */}
        <div className="flex items-center gap-2 text-sm text-slate-400">
          {lastSynced ? (
            <>
              <Cloud className="w-4 h-4 text-emerald-400" />
              <span>Synced {formatRelativeTime(lastSynced)}</span>
            </>
          ) : (
            <>
              <CloudOff className="w-4 h-4 text-slate-500" />
              <span>Not synced</span>
            </>
          )}
        </div>

        {/* Logout button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogout}
          className="text-slate-400 hover:text-slate-200 hover:bg-slate-800"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Lock
        </Button>
      </div>
    </header>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
