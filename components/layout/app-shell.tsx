'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { SyncProvider, useSyncContext } from '@/hooks/use-sync-context';
import { PageStateProvider } from '@/hooks/use-page-state';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { Dashboard } from '@/components/pages/dashboard';
import { TransactionsPage } from '@/components/pages/transactions';
import { MonthlyBudgetPage } from '@/components/pages/monthly-budget';
import { NetWorthPage } from '@/components/pages/net-worth';
import { NotesPage } from '@/components/pages/notes';
import { SettingsPage } from '@/components/pages/settings';
import { SyncConflictDialog } from '@/components/sync-conflict-dialog';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

export type PageId = 'dashboard' | 'transactions' | 'monthly' | 'net-worth' | 'notes' | 'settings';

/**
 * Get initial page from URL params (for OAuth callback navigation).
 * Pure function — does NOT mutate history. URL cleanup happens in a useEffect
 * inside AppShellContent so it runs as a side effect, not during render.
 */
function getInitialPage(): PageId {
  if (typeof window === 'undefined') return 'dashboard';

  const params = new URLSearchParams(window.location.search);
  const syncAuth = params.get('sync_auth');
  const page = params.get('page');

  if (syncAuth === 'success' || page === 'settings') {
    return 'settings';
  }

  return 'dashboard';
}

function AppShellContent() {
  const [currentPage, setCurrentPage] = useState<PageId>(getInitialPage);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { logout } = useAuth();
  const { syncStatus, needsResolution, isLoading, refetch } = useSyncContext();

  // Strip the URL hint params after we've consumed them (mounting-side effect,
  // not during render — calling replaceState in the useState initializer trips
  // React 19's "setState during render" warning via the Next.js Router).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('sync_auth') === 'success' || params.get('page') === 'settings') {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'transactions':
        return <TransactionsPage />;
      case 'monthly':
        return <MonthlyBudgetPage />;
      case 'net-worth':
        return <NetWorthPage />;
      case 'notes':
        return <NotesPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sync Conflict Dialog - shows when resolution needed */}
      <SyncConflictDialog 
        isOpen={needsResolution && !isLoading} 
        syncStatus={syncStatus}
        onResolved={refetch}
      />
      
      {/* Sidebar */}
      <Sidebar 
        currentPage={currentPage} 
        onNavigate={setCurrentPage}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      
      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onLogout={logout}
          syncStatus={syncStatus}
          onSyncComplete={refetch}
        />
        
        <main className="flex-1 overflow-auto p-6 bg-slate-950">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <SyncProvider>
      <TooltipProvider>
        <PageStateProvider>
          <AppShellContent />
          <Toaster position="bottom-right" />
        </PageStateProvider>
      </TooltipProvider>
    </SyncProvider>
  );
}
