'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Upload, Search, Filter } from 'lucide-react';

export function TransactionsPage() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-slate-400 mt-1">
            View and manage all your transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
            <Upload className="w-4 h-4" />
            Import CSV
          </Button>
          <Button className="gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20">
            <Plus className="w-4 h-4" />
            Add Transaction
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search transactions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-800/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-cyan-500"
              />
            </div>
            <Button variant="outline" className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white">
              <Filter className="w-4 h-4" />
              Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transactions list */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <CardTitle className="text-lg text-slate-100">All Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-16 text-slate-500">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <Upload className="w-8 h-8 text-slate-500" />
            </div>
            <p className="font-medium text-slate-400">No transactions yet</p>
            <p className="text-sm mt-1">Import a CSV file or add transactions manually to get started</p>
            <div className="flex justify-center gap-2 mt-4">
              <Button variant="outline" className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800">
                <Upload className="w-4 h-4" />
                Import CSV
              </Button>
              <Button className="gap-2 bg-cyan-600 hover:bg-cyan-500">
                <Plus className="w-4 h-4" />
                Add Transaction
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
