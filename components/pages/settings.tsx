'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ListTree, Sparkles, CloudUpload, Database, Shield } from 'lucide-react';
import { CategoryManagement, RulesManagement, SyncManagement } from '@/components/settings';

type SettingsView = 'main' | 'categories' | 'rules' | 'sync' | 'data' | 'security';

export function SettingsPage() {
  const [currentView, setCurrentView] = useState<SettingsView>('main');

  // Render the category management page
  if (currentView === 'categories') {
    return <CategoryManagement onBack={() => setCurrentView('main')} />;
  }

  // Render the rules management page
  if (currentView === 'rules') {
    return <RulesManagement onBack={() => setCurrentView('main')} />;
  }

  // Render the sync management page
  if (currentView === 'sync') {
    return <SyncManagement onBack={() => setCurrentView('main')} />;
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">
          Manage your categories, rules, and app preferences
        </p>
      </div>

      {/* Settings sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Categories */}
        <Card 
          className="border-slate-800 bg-slate-900/50 hover:border-cyan-700 transition-colors cursor-pointer"
          onClick={() => setCurrentView('categories')}
        >
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-900/50">
                <ListTree className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-100">Categories</CardTitle>
                <CardDescription className="text-slate-400">Manage income and expense categories</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
              Manage Categories
            </Button>
          </CardContent>
        </Card>

        {/* Auto-categorization Rules */}
        <Card
          className="border-slate-800 bg-slate-900/50 hover:border-violet-700 transition-colors cursor-pointer"
          onClick={() => setCurrentView('rules')}
        >
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-violet-950/30 border border-violet-900/50">
                <Sparkles className="w-6 h-6 text-violet-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-100">Auto-Categorization</CardTitle>
                <CardDescription className="text-slate-400">Set up rules to automatically categorize transactions</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
              Manage Rules
            </Button>
          </CardContent>
        </Card>

        {/* Google Drive Sync */}
        <Card 
          className="border-slate-800 bg-slate-900/50 hover:border-emerald-700 transition-colors cursor-pointer"
          onClick={() => setCurrentView('sync')}
        >
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/50">
                <CloudUpload className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-100">Cloud Sync</CardTitle>
                <CardDescription className="text-slate-400">Backup your data to Google Drive</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
              Configure Sync
            </Button>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card className="border-slate-800 bg-slate-900/50 hover:border-amber-700 transition-colors cursor-pointer">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-900/50">
                <Database className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-slate-100">Data Management</CardTitle>
                <CardDescription className="text-slate-400">Export, import, and backup your data</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
              Manage Data
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Security section */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-950/30 border border-red-900/50">
              <Shield className="w-6 h-6 text-red-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">Security</CardTitle>
              <CardDescription className="text-slate-400">Change your password and security settings</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
            Change Password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
