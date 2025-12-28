'use client';

import { useState } from 'react';
import { api } from '@/lib/services';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Key, ExternalLink, Loader2, CheckCircle2, AlertTriangle,
  ChevronRight, Copy, Check
} from 'lucide-react';

interface CredentialsSetupProps {
  onComplete: () => void;
  onCancel?: () => void;
  isDialog?: boolean;
}

export function CredentialsSetup({ onComplete, onCancel, isDialog = false }: CredentialsSetupProps) {
  const [step, setStep] = useState(1);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleSave = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      setError('Client ID and Client Secret are required');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await api.post<{ success: boolean; error?: string }>('/api/sync/credentials', {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        apiKey: apiKey.trim(),
      });

      if (result.data?.success) {
        onComplete();
      } else {
        setError(result.data?.error || result.error || 'Failed to save credentials');
      }
    } catch (err) {
      console.error('Save error:', err);
      setError('Failed to save credentials');
    } finally {
      setIsSaving(false);
    }
  };

  const content = (
    <div className="space-y-6">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`w-3 h-3 rounded-full transition-colors ${
              s === step ? 'bg-emerald-500' : s < step ? 'bg-emerald-500/50' : 'bg-slate-700'
            }`}
          />
        ))}
      </div>

      {/* Step 1: Introduction */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Key className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold text-slate-100 mb-2">Set Up Google Drive Sync</h3>
            <p className="text-slate-400 max-w-md mx-auto">
              To sync your data with Google Drive, you&apos;ll need to set up Google Cloud credentials.
              This is a one-time setup that takes about 5 minutes.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <h4 className="font-medium text-slate-200 mb-3">What you&apos;ll need:</h4>
            <ol className="space-y-2 text-sm text-slate-400">
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-medium">1.</span>
                A Google account
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-medium">2.</span>
                Access to Google Cloud Console (free)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-400 font-medium">3.</span>
                About 5 minutes to complete the setup
              </li>
            </ol>
          </div>

          <Button
            onClick={() => setStep(2)}
            className="w-full bg-emerald-600 hover:bg-emerald-500"
            size="lg"
          >
            Get Started
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Step 2: Instructions */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-100">Create Google Cloud Credentials</h3>
          
          <div className="space-y-4 text-sm">
            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <h4 className="font-medium text-slate-200 mb-2">Step 1: Create a Project</h4>
              <ol className="space-y-1 text-slate-400 list-decimal list-inside">
                <li>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">Google Cloud Console <ExternalLink className="w-3 h-3 inline" /></a></li>
                <li>Click &quot;Select a project&quot; → &quot;New Project&quot;</li>
                <li>Name it &quot;Puffin Sync&quot; and click Create</li>
              </ol>
            </div>

            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <h4 className="font-medium text-slate-200 mb-2">Step 2: Enable APIs</h4>
              <ol className="space-y-1 text-slate-400 list-decimal list-inside">
                <li>Go to &quot;APIs &amp; Services&quot; → &quot;Library&quot;</li>
                <li>Search and enable: <strong>Google Drive API</strong></li>
                <li>Search and enable: <strong>Google Picker API</strong></li>
              </ol>
            </div>

            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <h4 className="font-medium text-slate-200 mb-2">Step 3: Configure OAuth Consent</h4>
              <ol className="space-y-1 text-slate-400 list-decimal list-inside">
                <li>Go to &quot;APIs &amp; Services&quot; → &quot;OAuth consent screen&quot;</li>
                <li>Select &quot;External&quot; and click Create</li>
                <li>Fill in app name: &quot;Puffin&quot;</li>
                <li>Add your email for support contact</li>
                <li>Click &quot;Save and Continue&quot; through all steps</li>
                <li>Add yourself as a Test User (and any other users)</li>
              </ol>
            </div>

            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <h4 className="font-medium text-slate-200 mb-2">Step 4: Create OAuth Client ID</h4>
              <ol className="space-y-1 text-slate-400 list-decimal list-inside">
                <li>Go to &quot;Credentials&quot; → &quot;Create Credentials&quot; → &quot;OAuth client ID&quot;</li>
                <li>Application type: <strong>Desktop app</strong></li>
                <li>Name: &quot;Puffin Desktop&quot;</li>
                <li>Click Create</li>
              </ol>
              <p className="text-xs text-slate-500 mt-2">
                Copy your <strong>Client ID</strong> and <strong>Client Secret</strong>
              </p>
              <div className="mt-3 p-2 rounded bg-blue-500/10 border border-blue-500/20">
                <p className="text-xs text-blue-300">
                  <strong>Note:</strong> Desktop apps use a secure loopback address (127.0.0.1) for OAuth.
                  No redirect URI configuration is needed.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
              <h4 className="font-medium text-slate-200 mb-2">Step 5: Create API Key</h4>
              <ol className="space-y-1 text-slate-400 list-decimal list-inside">
                <li>Go to &quot;Credentials&quot; → &quot;Create Credentials&quot; → &quot;API key&quot;</li>
                <li>Copy the API key</li>
                <li>(Optional) Restrict it to &quot;Google Picker API&quot; for security</li>
              </ol>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => setStep(1)}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500"
            >
              I have my credentials
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Enter Credentials */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-100">Enter Your Credentials</h3>
          <p className="text-sm text-slate-400">
            Paste the credentials you copied from Google Cloud Console. These are stored securely and encrypted on your device.
          </p>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/50 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="client-id" className="text-slate-300">
                Client ID <span className="text-red-400">*</span>
              </Label>
              <Input
                id="client-id"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxx.apps.googleusercontent.com"
                className="bg-slate-800/50 border-slate-700 text-slate-100 font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client-secret" className="text-slate-300">
                Client Secret <span className="text-red-400">*</span>
              </Label>
              <Input
                id="client-secret"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="GOCSPX-xxxxxxxxxxxx"
                className="bg-slate-800/50 border-slate-700 text-slate-100 font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key" className="text-slate-300">
                API Key <span className="text-slate-500">(for folder picker)</span>
              </Label>
              <Input
                id="api-key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSyxxxxxxxxxxxxxxxxx"
                className="bg-slate-800/50 border-slate-700 text-slate-100 font-mono text-sm"
              />
            </div>
          </div>

          <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-400">
                <strong className="text-emerald-400">Secure:</strong> Your credentials are encrypted 
                and stored only on this device. They are never sent to any server except Google.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => setStep(2)}
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Back
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !clientId.trim() || !clientSecret.trim()}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Save & Continue
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  if (isDialog) {
    return (
      <Dialog open={true} onOpenChange={() => onCancel?.()}>
        <DialogContent className="sm:max-w-[550px] bg-slate-900 border-slate-700 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-100">Google Cloud Setup</DialogTitle>
            <DialogDescription className="text-slate-400">
              Configure your Google Cloud credentials for sync
            </DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Card className="border-slate-800 bg-slate-900/50">
      <CardHeader>
        <CardTitle className="text-lg text-slate-100">Set Up Cloud Sync</CardTitle>
        <CardDescription className="text-slate-400">
          Configure your Google Cloud credentials
        </CardDescription>
      </CardHeader>
      <CardContent>
        {content}
      </CardContent>
    </Card>
  );
}



