import { hasRuntimeError, isExtensionContextValid } from './extensionContext';

export interface Settings {
  ai_provider: 'gemini' | 'openai' | 'deepseek' | 'chatgpt_web' | 'ollama' | 'antigravity' | 'none';
  antigravity_model?: string;
  gemini_api_key?: string;
  gemini_model?: string;
  openai_api_key?: string;
  openai_model?: string;
  openai_auth_type?: 'chatgpt_web' | 'api_key';
  chatgpt_access_token?: string;
  chatgpt_model?: string;
  deepseek_api_key?: string;
  deepseek_model?: string;
  deepseek_auth_type?: 'api_key' | 'web_token' | 'local_proxy';
  deepseek_web_token?: string;
  deepseek_proxy_url?: string;
  ollama_url?: string;
  github_repo?: string;
  github_token?: string;
  theme: 'light' | 'dark' | 'system';
  language?: 'vi' | 'en';
  show_trigger_icon?: boolean;
  daily_review_goal?: number;
  previous_ai_provider?: Settings['ai_provider'];
  enable_passive_highlight?: boolean;
  enable_writing_assistant?: boolean;
  enable_todo_reminders?: boolean;
  todo_reminder_interval?: number; // in minutes
  show_todo_badge?: boolean;
  enable_auto_github_sync?: boolean;
  auto_github_sync_interval_hours?: number; // in hours, default 12
}

const DEFAULT_SETTINGS: Settings = {
  ai_provider: 'none',
  previous_ai_provider: 'none',
  antigravity_model: 'gemini-3.8-flash',
  gemini_api_key: '',
  gemini_model: 'gemini-2.5-flash-lite',
  openai_api_key: '',
  openai_model: 'gpt-4o-mini',
  openai_auth_type: 'chatgpt_web',
  chatgpt_access_token: '',
  chatgpt_model: 'gpt-6.1-sol',
  deepseek_api_key: '',
  deepseek_model: 'deepseek-chat',
  deepseek_auth_type: 'api_key',
  deepseek_web_token: '',
  deepseek_proxy_url: 'http://127.0.0.1:9655',
  ollama_url: 'http://localhost:11434',
  github_repo: '',
  github_token: '',
  theme: 'system',
  language: 'vi',
  show_trigger_icon: true,
  daily_review_goal: 10,
  enable_passive_highlight: true,
  enable_writing_assistant: true,
  enable_todo_reminders: true,
  todo_reminder_interval: 15,
  show_todo_badge: true,
  enable_auto_github_sync: false,
  auto_github_sync_interval_hours: 12,
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
    if (!isExtensionContextValid()) return;
    if (areaName === 'sync') {
      notifyListeners();
    }
  });
}

export async function getSettings(): Promise<Settings> {
  if (isChromeExtension) {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) return resolve(DEFAULT_SETTINGS);
      try {
        chrome.storage.sync.get(DEFAULT_SETTINGS as any, (items) => {
          resolve(hasRuntimeError() ? DEFAULT_SETTINGS : items as unknown as Settings);
        });
      } catch {
        resolve(DEFAULT_SETTINGS);
      }
    });
  } else {
    // Return mock/localStorage for local dev / tests
    return { ...DEFAULT_SETTINGS, ...mockStorage };
  }
}

export async function saveSettings(settings: Partial<Settings>): Promise<void> {
  if (isChromeExtension) {
    return new Promise((resolve) => {
      if (!isExtensionContextValid()) return resolve();
      try {
        chrome.storage.sync.set(settings, () => {
          if (!hasRuntimeError()) notifyListeners();
          resolve();
        });
      } catch {
        resolve();
      }
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

// Check if AI is configured and ready to use based on provider
export function isAIConfigured(settings?: Partial<Settings> | null): boolean {
  if (!settings || !settings.ai_provider || settings.ai_provider === 'none') {
    return false;
  }

  switch (settings.ai_provider) {
    case 'gemini':
      return Boolean(settings.gemini_api_key && settings.gemini_api_key.trim().length > 0);

    case 'antigravity':
      return true;

    case 'deepseek': {
      const authType = settings.deepseek_auth_type || (settings.deepseek_api_key ? 'api_key' : 'local_proxy');
      if (authType === 'local_proxy') {
        return Boolean(settings.deepseek_proxy_url && settings.deepseek_proxy_url.trim().length > 0);
      }
      if (authType === 'web_token') {
        return Boolean(settings.deepseek_web_token && settings.deepseek_web_token.trim().length > 0);
      }
      return Boolean(settings.deepseek_api_key && settings.deepseek_api_key.trim().length > 0);
    }

    case 'openai': {
      const authType = settings.openai_auth_type || (settings.openai_api_key ? 'api_key' : 'chatgpt_web');
      if (authType === 'chatgpt_web') {
        return true;
      }
      return Boolean(settings.openai_api_key && settings.openai_api_key.trim().length > 0);
    }

    case 'chatgpt_web':
      return true;

    case 'ollama':
      return Boolean(settings.ollama_url && settings.ollama_url.trim().length > 0);

    default:
      return false;
  }
}

// Human readable AI provider and model label
export function getAIProviderLabel(settings?: Partial<Settings> | null, lang: 'vi' | 'en' = 'vi'): string {
  if (!settings || !settings.ai_provider || settings.ai_provider === 'none') {
    return lang === 'en' ? 'AI Disconnected' : 'Chưa kết nối AI';
  }
  switch (settings.ai_provider) {
    case 'gemini': {
      const model = settings.gemini_model || 'gemini-2.5-flash-lite';
      const cleanModel = model.replace('gemini-', '');
      return `Gemini (${cleanModel})`;
    }
    case 'antigravity':
      return `Antigravity (${settings.antigravity_model || 'gemini-3.8-flash'})`;
    case 'deepseek': {
      const authType = settings.deepseek_auth_type || (settings.deepseek_api_key ? 'api_key' : 'local_proxy');
      if (authType === 'local_proxy') return 'DeepSeek (Local Proxy)';
      if (authType === 'web_token') return 'DeepSeek (Web)';
      return `DeepSeek (${settings.deepseek_model || 'chat'})`;
    }
    case 'openai': {
      const authType = settings.openai_auth_type || (settings.openai_api_key ? 'api_key' : 'chatgpt_web');
      if (authType === 'chatgpt_web') return `ChatGPT (${settings.chatgpt_model || 'sol'})`;
      return `OpenAI (${settings.openai_model || 'gpt-4o-mini'})`;
    }
    case 'chatgpt_web':
      return `ChatGPT (${settings.chatgpt_model || 'sol'})`;
    case 'ollama':
      return 'Ollama';
    default:
      return settings.ai_provider;
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

