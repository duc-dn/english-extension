export interface Settings {
  ai_provider: 'gemini' | 'openai' | 'ollama' | 'none';
  gemini_api_key?: string;
  gemini_model?: string;
  openai_api_key?: string;
  ollama_url?: string;
  github_repo?: string;
  github_token?: string;
  theme: 'light' | 'dark' | 'system';
  language?: 'vi' | 'en';
  show_trigger_icon?: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  ai_provider: 'none',
  gemini_api_key: '',
  gemini_model: 'gemini-2.5-flash-lite',
  openai_api_key: '',
  ollama_url: 'http://localhost:11434',
  github_repo: '',
  github_token: '',
  theme: 'system',
  language: 'vi',
  show_trigger_icon: true,
};

// Mock fallback for tests/local web dev
let mockStorage: Partial<Settings> = {};
try {
  if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
    const saved = window.localStorage.getItem('eng_ext_settings');
    if (saved) {
      mockStorage = JSON.parse(saved);
    }
  }
} catch (e) {
  // Silent fallback in test environments
}

type SettingsListener = (settings: Settings) => void;
const listeners: Set<SettingsListener> = new Set();

function notifyListeners() {
  getSettings().then(settings => {
    listeners.forEach(listener => listener(settings));
  });
}

// Subscribe to settings changes
export function subscribeToSettings(listener: SettingsListener) {
  listeners.add(listener);
  // Initial call
  getSettings().then(listener);
  return () => listeners.delete(listener);
}

export const isChromeExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

// Listen to Chrome storage changes
if (isChromeExtension) {
  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName === 'sync') {
      notifyListeners();
    }
  });
}

export async function getSettings(): Promise<Settings> {
  if (isChromeExtension) {
    return new Promise((resolve) => {
      chrome.storage.sync.get(DEFAULT_SETTINGS as any, (items) => {
        resolve(items as unknown as Settings);
      });
    });
  } else {
    // Return mock/localStorage for local dev / tests
    return { ...DEFAULT_SETTINGS, ...mockStorage };
  }
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  if (isChromeExtension) {
    return new Promise((resolve) => {
      chrome.storage.sync.set(settings, () => {
        // notifyListeners will be triggered by chrome.storage.onChanged
        resolve();
      });
    });
  } else {
    mockStorage = { ...mockStorage, ...settings };
    try {
      if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.setItem === 'function') {
        window.localStorage.setItem('eng_ext_settings', JSON.stringify(mockStorage));
      }
    } catch (e) {
      // Silent fallback in test environments
    }
    notifyListeners();
    return Promise.resolve();
  }
}

// For testing purposes only
export function clearMockStorage() {
  mockStorage = {};
}

import { useState, useEffect } from 'react';

// React hook to get and subscribe to Settings
export function useSettings(): Settings {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const unsubscribe = subscribeToSettings((newSettings) => {
      setSettings(newSettings);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return settings;
}
