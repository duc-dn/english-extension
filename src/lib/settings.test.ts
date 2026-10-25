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
    expect(settings.daily_review_goal).toBe(10);
  });

  it('should save and retrieve settings correctly', async () => {
    const newSettings: Partial<Settings> = {
      ai_provider: 'gemini',
      gemini_api_key: 'test_key_123',
      theme: 'dark',
      daily_review_goal: 15
    };

    await saveSettings(newSettings);

    const settings = await getSettings();
    expect(settings.ai_provider).toBe('gemini');
    expect(settings.gemini_api_key).toBe('test_key_123');
    expect(settings.theme).toBe('dark');
    expect(settings.daily_review_goal).toBe(15);
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

  it('should correctly evaluate isAIConfigured for various providers', async () => {
    const { isAIConfigured } = await import('./settings');
    expect(isAIConfigured(null)).toBe(false);
    expect(isAIConfigured({ ai_provider: 'none' })).toBe(false);

    // Gemini
    expect(isAIConfigured({ ai_provider: 'gemini', gemini_api_key: '' })).toBe(false);
    expect(isAIConfigured({ ai_provider: 'gemini', gemini_api_key: '   ' })).toBe(false);
    expect(isAIConfigured({ ai_provider: 'gemini', gemini_api_key: 'AIzaSy123' })).toBe(true);

    // Antigravity sign-in is checked by the local companion when a request is made.
    expect(isAIConfigured({ ai_provider: 'antigravity' })).toBe(true);

    // DeepSeek
    expect(isAIConfigured({ ai_provider: 'deepseek', deepseek_auth_type: 'local_proxy', deepseek_proxy_url: 'http://127.0.0.1:9655' })).toBe(true);
    expect(isAIConfigured({ ai_provider: 'deepseek', deepseek_auth_type: 'api_key', deepseek_api_key: 'sk-123' })).toBe(true);
    expect(isAIConfigured({ ai_provider: 'deepseek', deepseek_auth_type: 'api_key', deepseek_api_key: '' })).toBe(false);
    expect(isAIConfigured({ ai_provider: 'deepseek', deepseek_auth_type: 'web_token', deepseek_web_token: 'token123' })).toBe(true);

    // OpenAI
    expect(isAIConfigured({ ai_provider: 'openai', openai_auth_type: 'chatgpt_web' })).toBe(true);
    expect(isAIConfigured({ ai_provider: 'openai', openai_auth_type: 'api_key', openai_api_key: 'sk-proj123' })).toBe(true);
    expect(isAIConfigured({ ai_provider: 'openai', openai_auth_type: 'api_key', openai_api_key: '' })).toBe(false);

    // ChatGPT Web
    expect(isAIConfigured({ ai_provider: 'chatgpt_web' })).toBe(true);

    // Ollama
    expect(isAIConfigured({ ai_provider: 'ollama', ollama_url: 'http://localhost:11434' })).toBe(true);
    expect(isAIConfigured({ ai_provider: 'ollama', ollama_url: '' })).toBe(false);
  });
});

