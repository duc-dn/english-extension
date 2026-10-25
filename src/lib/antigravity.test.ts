import { beforeEach, describe, expect, it, vi } from 'vitest';

const companionRequest = vi.hoisted(() => vi.fn());
vi.mock('./chatgptCompanion', () => ({ companionRequest }));

import { beginAntigravityLogin, callAntigravity, disconnectAntigravity, getAntigravityStatus, listAntigravityModels } from './antigravity';

describe('Antigravity companion client', () => {
  beforeEach(() => companionRequest.mockReset());

  it('uses direct OAuth companion endpoints', async () => {
    companionRequest.mockResolvedValueOnce({ url: 'https://accounts.google.com/auth' })
      .mockResolvedValueOnce({ status: 'connected', email: 'user@example.com' })
      .mockResolvedValueOnce({ models: [{ value: 'gemini-3.8-flash', label: 'Gemini' }] })
      .mockResolvedValueOnce({ ok: true });

    expect(await beginAntigravityLogin()).toContain('accounts.google.com');
    expect((await getAntigravityStatus()).status).toBe('connected');
    expect(await listAntigravityModels()).toHaveLength(1);
    await disconnectAntigravity();
    expect(companionRequest.mock.calls.map(([path]) => path)).toEqual([
      '/antigravity/login', '/antigravity/status', '/antigravity/models', '/antigravity/logout',
    ]);
  });

  it('sends the model and content to the companion without a router key', async () => {
    companionRequest.mockResolvedValue({ text: 'Xin chào' });
    expect(await callAntigravity({ antigravity_model: 'ag/gemini-3.8-flash' }, [{ role: 'user', content: 'Hello' }]))
      .toBe('Xin chào');
    expect(companionRequest).toHaveBeenCalledWith('/antigravity/response', {
      model: 'gemini-3.8-flash', messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('rejects invalid model names before sending a request', async () => {
    await expect(callAntigravity({ antigravity_model: 'https://example.com' }, [])).rejects.toThrow('không hợp lệ');
    expect(companionRequest).not.toHaveBeenCalled();
  });
});
