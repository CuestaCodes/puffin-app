'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Lock } from 'lucide-react';

export function LoginForm() {
  const { login, isLoading, error } = useAuth();
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!password) {
      setLocalError('Password is required');
      return;
    }

    const success = await login(password);
    if (!success) {
      setLocalError('Invalid password');
    }
  };

  const displayError = localError || error;

  return (
    <Card className="w-full max-w-md border-slate-800 shadow-2xl shadow-cyan-500/10 bg-gradient-to-b from-slate-900 to-slate-950">
      <CardHeader className="space-y-4 text-center pb-8">
        <div className="mx-auto w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/30">
          <Lock className="w-8 h-8 text-white" />
        </div>
        <div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
            Welcome Back
          </CardTitle>
          <CardDescription className="text-slate-400 mt-2">
            Enter your password to access Puffin
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              disabled={isLoading}
              className="h-12 bg-slate-900/50 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              autoFocus
            />
          </div>

          {displayError && (
            <p className="text-sm text-red-400 bg-red-950/50 border border-red-900/50 px-4 py-2 rounded-lg">
              {displayError}
            </p>
          )}

          <Button 
            type="submit" 
            className="w-full h-12 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium shadow-lg shadow-cyan-500/25"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Unlocking...
              </>
            ) : (
              'Unlock'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
