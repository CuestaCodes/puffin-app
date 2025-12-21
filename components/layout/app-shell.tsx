'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { Dashboard } from '@/components/pages/dashboard';
import { TransactionsPage } from '@/components/pages/transactions';
import { MonthlyBudgetPage } from '@/components/pages/monthly-budget';
import { SettingsPage } from '@/components/pages/settings';

export type PageId = 'dashboard' | 'transactions' | 'monthly' | 'settings';

export function AppShell() {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { logout } = useAuth();

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'transactions':
        return <TransactionsPage />;
      case 'monthly':
        return <MonthlyBudgetPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-950">
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
