'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Inbox as InboxIcon, Tag } from 'lucide-react';

export function InboxPage() {
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Inbox</h1>
        <p className="text-slate-400 mt-1">
          Uncategorized transactions waiting for review
        </p>
      </div>

      {/* Stats card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-900/50">
                <InboxIcon className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Uncategorized</p>
                <p className="text-2xl font-bold text-white">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-900/50">
                <Tag className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Categorized Today</p>
                <p className="text-2xl font-bold text-white">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-900/50">
                <Tag className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Auto-Categorized</p>
                <p className="text-2xl font-bold text-white">0</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Inbox list */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100">Transactions to Review</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-16 text-slate-500">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-950/30 border border-emerald-900/50 flex items-center justify-center">
              <InboxIcon className="w-8 h-8 text-emerald-400" />
            </div>
            <p className="font-medium text-emerald-400">Inbox zero!</p>
            <p className="text-sm mt-1 text-slate-500">All your transactions are categorized</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
