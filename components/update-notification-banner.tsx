'use client';

import { useTauri } from './tauri-provider';
import { Button } from '@/components/ui/button';
import { Download, X, Sparkles } from 'lucide-react';

export function UpdateNotificationBanner() {
  const { updateAvailable, dismissUpdate, isTauri } = useTauri();

  // Only show in Tauri mode with an update available
  if (!isTauri || !updateAvailable) {
    return null;
  }

  const handleDownload = () => {
    // Open the release page in the default browser
    window.open(updateAvailable.url, '_blank');
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-cyan-600 to-emerald-600 text-white px-4 py-2 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">
            Version {updateAvailable.version} is available
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleDownload}
            size="sm"
            variant="secondary"
            className="bg-white/20 hover:bg-white/30 text-white border-0"
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
          <Button
            onClick={dismissUpdate}
            size="sm"
            variant="ghost"
            className="text-white/80 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
