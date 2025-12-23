'use client';

import { cn } from '@/lib/utils';
import type { PageId } from './app-shell';
import {
  LayoutDashboard,
  List,
  Calendar,
  Wallet,
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const navItems: { id: PageId; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: List },
  { id: 'monthly', label: 'Monthly Budget', icon: Calendar },
  { id: 'net-worth', label: 'Net Worth', icon: Wallet },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({ currentPage, onNavigate, isOpen, onToggle }: SidebarProps) {
  return (
    <aside 
      className={cn(
        "relative flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300",
        isOpen ? "w-64" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center px-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-cyan-500/20">
            <span className="text-white font-bold text-sm">P</span>
          </div>
          {isOpen && (
            <span className="font-bold text-lg bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Puffin
            </span>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200",
                "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
                isActive && "bg-cyan-950/50 text-cyan-400 font-medium border border-cyan-900/50"
              )}
            >
              <Icon className={cn(
                "w-5 h-5 flex-shrink-0",
                isActive && "text-cyan-400"
              )} />
              {isOpen && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* Collapse button */}
      <div className="absolute -right-3 top-20">
        <Button
          variant="outline"
          size="icon"
          className="w-6 h-6 rounded-full bg-slate-900 border-slate-700 shadow-sm hover:bg-slate-800"
          onClick={onToggle}
        >
          {isOpen ? (
            <ChevronLeft className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </Button>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800">
        {isOpen && (
          <p className="text-xs text-slate-500">
            Local-first finance
          </p>
        )}
      </div>
    </aside>
  );
}
