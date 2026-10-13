import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDeepSeekProxyActive, pingDeepSeekProxy, toggleDeepSeekProxy } from './deepseekProxy';
import { saveSettings, getSettings, clearMockStorage } from './settings';

globalThis.fetch = vi.fn();

describe('deepseekProxy utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearMockStorage();
  });

  it('should detect when proxy is active', async () => {
    const s1 = await getSettings();
    expect(isDeepSeekProxyActive(s1)).toBe(false);

    await saveSettings({ ai_provider: 'deepseek', deepseek_auth_type: 'local_proxy' });
    const s2 = await getSettings();
    expect(isDeepSeekProxyActive(s2)).toBe(true);
  });

  it('should toggle proxy on and off correctly', async () => {
    await saveSettings({ ai_provider: 'gemini' });

    // Toggle on
    const enabled = await toggleDeepSeekProxy(true);
    expect(enabled.ai_provider).toBe('deepseek');
    expect(enabled.deepseek_auth_type).toBe('local_proxy');
    expect(enabled.previous_ai_provider).toBe('gemini');

    // Toggle off
    const disabled = await toggleDeepSeekProxy(false);
    expect(disabled.ai_provider).toBe('gemini');
  });

  it('should ping local proxy endpoint and report health', async () => {
    (globalThis.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'ok',
        service: 'FreeDeepseekAPI',
        models: ['deepseek-chat', 'deepseek-reasoner']
      })
    });

    const health = await pingDeepSeekProxy('http://127.0.0.1:9655');
    expect(health.online).toBe(true);
    expect(health.service).toBe('FreeDeepseekAPI');
    expect(health.models).toContain('deepseek-chat');
  });

  it('should handle ping failure gracefully', async () => {
    (globalThis.fetch as any).mockRejectedValue(new Error('ECONNREFUSED'));

    const health = await pingDeepSeekProxy('http://127.0.0.1:9655');
    expect(health.online).toBe(false);
    expect(health.error).toBeDefined();
  });
});
