'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tag, ListTree, Sparkles, CloudUpload, Database, Shield } from 'lucide-react';

export function SettingsPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Manage your categories, rules, and app preferences
        </p>
      </div>

      {/* Settings sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Categories */}
        <Card className="hover:border-cyan-300 dark:hover:border-cyan-700 transition-colors cursor-pointer">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/30">
                <ListTree className="w-6 h-6 text-cyan-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Categories</CardTitle>
                <CardDescription>Manage income and expense categories</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Manage Categories
            </Button>
          </CardContent>
        </Card>

        {/* Auto-categorization Rules */}
        <Card className="hover:border-violet-300 dark:hover:border-violet-700 transition-colors cursor-pointer">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30">
                <Sparkles className="w-6 h-6 text-violet-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Auto-Categorization</CardTitle>
                <CardDescription>Set up rules to automatically categorize transactions</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Manage Rules
            </Button>
          </CardContent>
        </Card>

        {/* Google Drive Sync */}
        <Card className="hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors cursor-pointer">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
                <CloudUpload className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Cloud Sync</CardTitle>
                <CardDescription>Backup your data to Google Drive</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Configure Sync
            </Button>
          </CardContent>
        </Card>

        {/* Data Management */}
        <Card className="hover:border-amber-300 dark:hover:border-amber-700 transition-colors cursor-pointer">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30">
                <Database className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <CardTitle className="text-lg">Data Management</CardTitle>
                <CardDescription>Export, import, and backup your data</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full">
              Manage Data
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Security section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30">
              <Shield className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <CardTitle className="text-lg">Security</CardTitle>
              <CardDescription>Change your password and security settings</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline">
            Change Password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

