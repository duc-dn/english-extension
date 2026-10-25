import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAntigravity } from './antigravity.mjs';

let testDir;
afterEach(async () => {
  vi.unstubAllGlobals();
  if (testDir) await rm(testDir, { recursive: true, force: true });
  testDir = undefined;
});

const json = (value, status = 200) => ({ ok: status < 400, status, json: async () => value });

describe('Antigravity OAuth companion', () => {
  it('checks state, exchanges the code, and stores a project with tokens', async () => {
    testDir = await mkdtemp(join(tmpdir(), 'eng-antigravity-'));
    await writeFile(join(testDir, 'oauth-client.json'), JSON.stringify({ clientId: 'test-client-id', clientSecret: 'test-client-secret' }));
    const external = vi.fn(async (url) => {
      if (url.includes('/token')) return json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 });
      if (url.includes('/userinfo')) return json({ email: 'learner@example.com' });
      if (url.includes('loadCodeAssist')) return json({ cloudaicompanionProject: { id: 'project-123' } });
      if (url.includes('onboardUser')) return json({ done: true });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', external);
    let callbackHandler;
    const callbackServer = {
      once: vi.fn(), listen: vi.fn((_port, _host, done) => done()),
      address: () => ({ port: 48765 }), close: vi.fn(),
    };
    const provider = await createAntigravity(testDir, {
      createCallbackServer: handler => { callbackHandler = handler; return callbackServer; },
    });
    const { url } = await provider.login();
    const auth = new URL(url);
    expect(auth.searchParams.get('client_id')).toBe('test-client-id');
    const callback = new URL(auth.searchParams.get('redirect_uri'));
    callback.searchParams.set('state', auth.searchParams.get('state'));
    callback.searchParams.set('code', 'test-code');

    let responseStatus;
    const response = {
      writeHead(status) { responseStatus = status; return this; },
      end() { return this; },
    };
    await callbackHandler({ method: 'GET', url: `${callback.pathname}${callback.search}`, headers: { host: '127.0.0.1:48765' } }, response);

    expect(responseStatus).toBe(200);
    expect(provider.status()).toMatchObject({ status: 'connected', email: 'learner@example.com', projectId: 'project-123' });
    const saved = JSON.parse(await readFile(join(testDir, 'antigravity.json'), 'utf8'));
    expect(saved.refreshToken).toBe('refresh');
    expect(saved.projectId).toBe('project-123');
    expect(external.mock.calls.some(([endpoint]) => String(endpoint).includes('loadCodeAssist'))).toBe(true);
    const tokenRequest = external.mock.calls.find(([endpoint]) => String(endpoint).includes('/token'));
    expect(new URLSearchParams(tokenRequest[1].body).get('client_secret')).toBe('test-client-secret');
  });

  it('explains how to configure a missing OAuth client', async () => {
    testDir = await mkdtemp(join(tmpdir(), 'eng-antigravity-'));
    const provider = await createAntigravity(testDir);
    await expect(provider.login()).rejects.toThrow('oauth-client.json');
  });

  it('wraps text and images in a direct Cloud Code request', async () => {
    testDir = await mkdtemp(join(tmpdir(), 'eng-antigravity-'));
    await writeFile(join(testDir, 'antigravity.json'), JSON.stringify({
      accessToken: 'access', refreshToken: 'refresh', expiresAt: Date.now() + 3600000,
      projectId: 'project-123', email: 'learner@example.com',
    }));
    const external = vi.fn(async (url) => {
      if (url.includes('generateContent')) return json({ response: { candidates: [{ content: { parts: [{ text: 'Bản dịch' }] } }] } });
      throw new Error(`Unexpected URL: ${url}`);
    });
    vi.stubGlobal('fetch', external);
    const provider = await createAntigravity(testDir);

    const result = await provider.response({ model: 'gemini-3.8-flash', messages: [
      { role: 'system', content: 'Translate to Vietnamese' },
      { role: 'user', content: 'Hello', imageBase64: 'data:image/png;base64,aGVsbG8=' },
    ] });

    expect(result.text).toBe('Bản dịch');
    const [endpoint, init] = external.mock.calls[0];
    const payload = JSON.parse(init.body);
    expect(endpoint).toBe('https://daily-cloudcode-pa.googleapis.com/v1internal:generateContent');
    expect(payload).toMatchObject({ project: 'project-123', model: 'gemini-3.8-flash-medium(medium)',
      request: { systemInstruction: { parts: [{ text: 'Translate to Vietnamese' }] },
        contents: [{ role: 'user', parts: [{ text: 'Hello' }, { inlineData: { mimeType: 'image/png', data: 'aGVsbG8=' } }] }] } });
    expect(payload.requestId).toMatch(/^agent\/[^/]+\/\d+\/[^/]+\/1$/);
    expect(init.headers.authorization).toBe('Bearer access');
  });
});
