import { describe, it, expect, beforeEach } from 'vitest';
import { getSettings, saveSettings, clearMockStorage, type Settings } from './settings';

describe('English Extension Settings (chrome.storage mock)', () => {
  beforeEach(() => {
    // Clear mock storage before each test
    clearMockStorage();
  });

  it('should return default settings if nothing is saved', async () => {
    const settings = await getSettings();
    expect(settings.ai_provider).toBe('none');
    expect(settings.theme).toBe('system');
  });

  it('should save and retrieve settings correctly', async () => {
    const newSettings: Partial<Settings> = {
      ai_provider: 'gemini',
      gemini_api_key: 'test_key_123',
      theme: 'dark'
    };

    await saveSettings(newSettings);

    const settings = await getSettings();
    expect(settings.ai_provider).toBe('gemini');
    expect(settings.gemini_api_key).toBe('test_key_123');
    expect(settings.theme).toBe('dark');
  });

  it('should merge partial updates with existing settings', async () => {
    await saveSettings({ ai_provider: 'ollama', ollama_url: 'http://localhost:11434' });
    
    // Now update just the theme
    await saveSettings({ theme: 'light' });

    const settings = await getSettings();
    
    // Previous settings should remain
    expect(settings.ai_provider).toBe('ollama');
    expect(settings.ollama_url).toBe('http://localhost:11434');
    
    // New settings should be applied
    expect(settings.theme).toBe('light');
  });
});
