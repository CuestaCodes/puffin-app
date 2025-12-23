'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Simplified type declarations
interface PickerResult {
  id: string;
  name: string;
}

interface UseGooglePickerOptions {
  clientId: string;
  apiKey: string;
  onSelect: (folder: PickerResult) => void;
  onError?: (error: string) => void;
}

// Track script loading globally
let gapiLoaded = false;
let gapiLoading = false;
let pickerLoaded = false;

export function useGooglePicker({ clientId, apiKey, onSelect, onError }: UseGooglePickerOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const onSelectRef = useRef(onSelect);
  const onErrorRef = useRef(onError);

  // Keep refs updated
  useEffect(() => {
    onSelectRef.current = onSelect;
    onErrorRef.current = onError;
  }, [onSelect, onError]);

  const openPicker = useCallback(async () => {
    console.log('[Picker] Opening picker, clientId:', clientId?.slice(0, 10) + '...', 'apiKey:', apiKey?.slice(0, 10) + '...');
    
    if (!clientId || !apiKey) {
      onErrorRef.current?.('Missing API credentials');
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Get access token from backend
      console.log('[Picker] Fetching access token...');
      const tokenResponse = await fetch('/api/sync/token');
      
      if (!tokenResponse.ok) {
        const err = await tokenResponse.json();
        throw new Error(err.error || 'Failed to get access token');
      }
      
      const { accessToken } = await tokenResponse.json();
      console.log('[Picker] Got access token');

      if (!accessToken) {
        throw new Error('No access token available. Please sign in first.');
      }

      // Step 2: Load Google API if not loaded
      if (!gapiLoaded) {
        console.log('[Picker] Loading Google API...');
        await loadGoogleApi();
        gapiLoaded = true;
      }

      // Step 3: Load Picker API if not loaded
      if (!pickerLoaded) {
        console.log('[Picker] Loading Picker API...');
        await loadPickerApi();
        pickerLoaded = true;
      }

      // Step 4: Create and show picker
      console.log('[Picker] Creating picker...');
      const google = (window as unknown as { google: { picker: GooglePickerNamespace } }).google;
      
      const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS);
      view.setIncludeFolders(true);
      view.setSelectFolderEnabled(true);
      view.setMimeTypes('application/vnd.google-apps.folder');

      const picker = new google.picker.PickerBuilder()
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .addView(view)
        .setTitle('Select a folder for Puffin backups')
        .setCallback((data: PickerCallbackData) => {
          console.log('[Picker] Callback:', data.action);
          if (data.action === 'picked' && data.docs?.[0]) {
            const folder = data.docs[0];
            onSelectRef.current({ id: folder.id, name: folder.name });
          }
          setIsLoading(false);
        })
        .build();

      picker.setVisible(true);
      console.log('[Picker] Picker shown');
    } catch (error) {
      console.error('[Picker] Error:', error);
      onErrorRef.current?.(error instanceof Error ? error.message : 'Failed to open folder picker');
      setIsLoading(false);
    }
  }, [clientId, apiKey]);

  return {
    openPicker,
    isLoading,
  };
}

// Helper to load Google API script
function loadGoogleApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (gapiLoading) {
      // Wait for existing load
      const checkInterval = setInterval(() => {
        if (gapiLoaded) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      return;
    }

    gapiLoading = true;
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google API'));
    document.body.appendChild(script);
  });
}

// Helper to load Picker API
function loadPickerApi(): Promise<void> {
  return new Promise((resolve, reject) => {
    const gapi = (window as unknown as { gapi: GapiType }).gapi;
    if (!gapi) {
      reject(new Error('Google API not loaded'));
      return;
    }
    gapi.load('picker', {
      callback: () => resolve(),
      onerror: () => reject(new Error('Failed to load Picker API')),
    });
  });
}

// Type definitions for Google Picker
interface GapiType {
  load: (api: string, config: { callback: () => void; onerror: () => void }) => void;
}

interface GooglePickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  ViewId: { FOLDERS: string };
  DocsView: new (viewId: string) => DocsView;
}

interface PickerBuilder {
  setOAuthToken(token: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  addView(view: DocsView): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(callback: (data: PickerCallbackData) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void };
}

interface DocsView {
  setIncludeFolders(include: boolean): DocsView;
  setSelectFolderEnabled(enabled: boolean): DocsView;
  setMimeTypes(mimeTypes: string): DocsView;
}

interface PickerCallbackData {
  action: string;
  docs?: Array<{ id: string; name: string }>;
}

