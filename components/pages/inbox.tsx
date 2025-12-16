'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Inbox as InboxIcon, Tag } from 'lucide-react';

export function InboxPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Inbox</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">
          Uncategorized transactions waiting for review
        </p>
      </div>

      {/* Stats card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30">
                <InboxIcon className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Uncategorized</p>
                <p className="text-2xl font-bold">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-cyan-50 dark:bg-cyan-950/30">
                <Tag className="w-6 h-6 text-cyan-500" />
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Categorized Today</p>
                <p className="text-2xl font-bold">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30">
                <Tag className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Auto-Categorized</p>
                <p className="text-2xl font-bold">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inbox list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transactions to Review</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-16 text-slate-400 dark:text-slate-500">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <InboxIcon className="w-8 h-8 text-emerald-500" />
            </div>
            <p className="font-medium text-emerald-600 dark:text-emerald-400">Inbox zero!</p>
            <p className="text-sm mt-1">All your transactions are categorized</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

