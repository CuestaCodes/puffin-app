'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Lock, AlertTriangle } from 'lucide-react';

export function LoginForm() {
  const { login, isLoading, error } = useAuth();
  const [pin, setPin] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPin(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (pin.length !== 6) {
      setLocalError('Please enter your 6-digit PIN');
      return;
    }

    const success = await login(pin);
    if (!success) {
      setLocalError('Invalid PIN');
    }
  };

  const handleReset = async () => {
    if (resetConfirmText !== 'RESET') return;

    setIsResetting(true);
    try {
      const response = await fetch('/api/auth/reset', {
        method: 'POST',
      });

      if (response.ok) {
        window.location.reload();
      } else {
        const data = await response.json();
        setLocalError(data.error || 'Failed to reset app');
        setShowResetDialog(false);
      }
    } catch {
      setLocalError('Failed to reset app');
      setShowResetDialog(false);
    } finally {
      setIsResetting(false);
      setResetConfirmText('');
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
            Enter your PIN to access Puffin
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="pin" className="text-slate-300">
              PIN
            </Label>
            <Input
              id="pin"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={pin}
              onChange={handlePinChange}
              placeholder="Enter 6-digit PIN"
              disabled={isLoading}
              className="h-12 bg-slate-900/50 border-slate-700 text-slate-100 text-center text-2xl tracking-[0.5em] placeholder:text-slate-500 placeholder:text-base placeholder:tracking-normal focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
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
            disabled={isLoading || pin.length !== 6}
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

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setShowResetDialog(true)}
              className="text-sm text-slate-500 hover:text-slate-400 transition-colors"
            >
              Forgot PIN?
            </button>
          </div>
        </form>
      </CardContent>

      {/* Reset App Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Reset App
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              <span className="block mb-2 text-red-400 font-medium">
                Warning: This action cannot be undone!
              </span>
              If you&apos;ve forgotten your PIN, you&apos;ll need to reset the app. This will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Delete all your transactions and data</li>
                <li>Remove all categories and rules</li>
                <li>Disconnect Google Drive sync</li>
                <li>Delete all local backups</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="reset-confirm" className="text-slate-300">
              Type <span className="font-mono text-red-400">RESET</span> to confirm
            </Label>
            <Input
              id="reset-confirm"
              value={resetConfirmText}
              onChange={(e) => setResetConfirmText(e.target.value)}
              className="mt-2 bg-slate-800 border-slate-700 text-slate-100"
              placeholder="RESET"
              disabled={isResetting}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setShowResetDialog(false);
                setResetConfirmText('');
              }}
              className="text-slate-400"
              disabled={isResetting}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReset}
              disabled={resetConfirmText !== 'RESET' || isResetting}
              className="bg-red-600 hover:bg-red-500"
            >
              {isResetting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Reset App
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
