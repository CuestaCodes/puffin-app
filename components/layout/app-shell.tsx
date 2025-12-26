'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { SyncProvider, useSyncContext } from '@/hooks/use-sync-context';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { Dashboard } from '@/components/pages/dashboard';
import { TransactionsPage } from '@/components/pages/transactions';
import { MonthlyBudgetPage } from '@/components/pages/monthly-budget';
import { NetWorthPage } from '@/components/pages/net-worth';
import { SettingsPage } from '@/components/pages/settings';
import { SyncConflictDialog } from '@/components/sync-conflict-dialog';

export type PageId = 'dashboard' | 'transactions' | 'monthly' | 'net-worth' | 'settings';

/**
 * Get initial page from URL params (for OAuth callback navigation)
 */
function getInitialPage(): PageId {
  if (typeof window === 'undefined') return 'dashboard';

  const params = new URLSearchParams(window.location.search);
  const syncAuth = params.get('sync_auth');
  const page = params.get('page');

  if (syncAuth === 'success' || page === 'settings') {
    // Clean up the URL
    window.history.replaceState({}, '', window.location.pathname);
    return 'settings';
  }

  return 'dashboard';
}

function AppShellContent() {
  const [currentPage, setCurrentPage] = useState<PageId>(getInitialPage);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { logout } = useAuth();
  const { syncStatus, needsResolution, isLoading, refetch } = useSyncContext();

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
      <AppShellContent />
    </SyncProvider>
  );
}
