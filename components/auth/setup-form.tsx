'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldCheck } from 'lucide-react';

export function SetupForm() {
  const { setup, isLoading, error } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!password) {
      setLocalError('Password is required');
      return;
    }

    if (password.length < 4) {
      setLocalError('Password must be at least 4 characters');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    await setup(password, confirmPassword);
  };

  const displayError = localError || error;

  return (
    <Card className="w-full max-w-md border-slate-800 shadow-2xl shadow-emerald-500/10 bg-gradient-to-b from-slate-900 to-slate-950">
      <CardHeader className="space-y-4 text-center pb-8">
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-emerald-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
          <ShieldCheck className="w-8 h-8 text-white" />
        </div>
        <div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            Welcome to Puffin
          </CardTitle>
          <CardDescription className="text-slate-400 mt-2">
            Create a password to secure your financial data
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
              disabled={isLoading}
              className="h-12 bg-slate-900/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-slate-300">
              Confirm Password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              disabled={isLoading}
              className="h-12 bg-slate-900/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          {displayError && (
            <p className="text-sm text-red-400 bg-red-950/50 border border-red-900/50 px-4 py-2 rounded-lg">
              {displayError}
            </p>
          )}

          <Button 
            type="submit" 
            className="w-full h-12 bg-gradient-to-r from-emerald-500 to-cyan-600 hover:from-emerald-400 hover:to-cyan-500 text-white font-medium shadow-lg shadow-emerald-500/25"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Setting up...
              </>
            ) : (
              'Get Started'
            )}
          </Button>

          <p className="text-xs text-center text-slate-500 mt-4">
            Your data is stored locally and secured with your password
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
