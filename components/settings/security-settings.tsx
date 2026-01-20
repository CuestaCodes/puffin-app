'use client';

import { useState } from 'react';
import { api } from '@/lib/services';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Shield, Loader2, Eye, EyeOff, Check } from 'lucide-react';
import { sanitizePinInput } from '@/lib/utils';

interface SecuritySettingsProps {
  onBack: () => void;
}

export function SecuritySettings({ onBack }: SecuritySettingsProps) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>, setter: (value: string) => void) => {
    setter(sanitizePinInput(e.target.value));
  };

  const pinsMatch = newPin === confirmPin && confirmPin.length === 6;
  const canSubmit =
    currentPin.length === 6 &&
    newPin.length === 6 &&
    pinsMatch &&
    !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const result = await api.post<{ success: boolean }>('/api/auth/change-password', {
        currentPin,
        newPin,
      });

      if (result.data?.success) {
        setSuccess(true);
        // Redirect to login after a short delay
        // Use window.location for reliable navigation in both dev and Tauri modes
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      } else {
        setError(result.error || 'Failed to change PIN');
      }
    } catch {
      setError('Failed to change PIN');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-6">
        <Card className="border-green-900/50 bg-slate-900/50">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 bg-green-950/50 border border-green-900/50 rounded-full flex items-center justify-center">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-green-400">PIN Changed</h2>
              <p className="text-slate-400">
                Your PIN has been updated successfully. Redirecting to login...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-white">Security Settings</h1>
          <p className="text-slate-400 mt-1">Change your PIN</p>
        </div>
      </div>

      {/* Change PIN Form */}
      <Card className="border-slate-800 bg-slate-900/50">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-950/50 border border-red-900/50">
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-slate-100">Change PIN</CardTitle>
              <CardDescription className="text-slate-400">
                Update your 6-digit PIN to keep your account secure
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Current PIN */}
            <div className="space-y-2">
              <Label htmlFor="current-pin" className="text-slate-300">
                Current PIN
              </Label>
              <div className="relative">
                <Input
                  id="current-pin"
                  type={showCurrentPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={currentPin}
                  onChange={(e) => handlePinChange(e, setCurrentPin)}
                  className="bg-slate-800 border-slate-700 text-slate-100 text-center text-xl tracking-[0.5em] pr-10"
                  placeholder="••••••"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPin(!showCurrentPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  {showCurrentPin ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* New PIN */}
            <div className="space-y-2">
              <Label htmlFor="new-pin" className="text-slate-300">
                New PIN
              </Label>
              <div className="relative">
                <Input
                  id="new-pin"
                  type={showNewPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={newPin}
                  onChange={(e) => handlePinChange(e, setNewPin)}
                  className="bg-slate-800 border-slate-700 text-slate-100 text-center text-xl tracking-[0.5em] pr-10"
                  placeholder="••••••"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPin(!showNewPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  {showNewPin ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm PIN */}
            <div className="space-y-2">
              <Label htmlFor="confirm-pin" className="text-slate-300">
                Confirm New PIN
              </Label>
              <div className="relative">
                <Input
                  id="confirm-pin"
                  type={showConfirmPin ? 'text' : 'password'}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={confirmPin}
                  onChange={(e) => handlePinChange(e, setConfirmPin)}
                  className={`bg-slate-800 border-slate-700 text-slate-100 text-center text-xl tracking-[0.5em] pr-10 ${
                    confirmPin.length === 6 && !pinsMatch
                      ? 'border-red-500 focus:ring-red-500'
                      : ''
                  }`}
                  placeholder="••••••"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPin(!showConfirmPin)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                >
                  {showConfirmPin ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              {confirmPin.length === 6 && !pinsMatch && (
                <p className="text-sm text-red-400">PINs do not match</p>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <p className="text-sm text-red-400 bg-red-950/50 border border-red-900/50 px-4 py-2 rounded-lg">
                {error}
              </p>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Changing PIN...
                </>
              ) : (
                'Change PIN'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
