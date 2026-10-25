import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The callback stays in this local companion; Google tokens never enter extension storage.
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CLOUD_CODE = 'https://cloudcode-pa.googleapis.com';
const ANTIGRAVITY_API = 'https://daily-cloudcode-pa.googleapis.com';
const USER_AGENT = 'antigravity/ide/2.22.0 darwin/arm64';
const SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
].join(' ');
const METADATA = { ideType: 9, platform: process.platform === 'darwin' ? (process.arch === 'arm64' ? 2 : 1) : process.platform === 'win32' ? 5 : 3, pluginType: 2 };
const FALLBACK_MODELS = [
  'gemini-3.8-flash', 'gemini-3.8-flash-low', 'gemini-3.1-pro-high',
  'claude-sonnet-4-6', 'claude-opus-4-6-thinking',
];
const MODEL_ALIASES = {
  'gemini-3.8-flash': 'gemini-3.8-flash-medium(medium)',
  'gemini-3.8-flash-low': 'gemini-3.8-flash-low(low)',
  'gemini-3.1-pro-high': 'gemini-pro-agent',
};

function readError(body, status) {
  return body?.error?.message || body?.error_description || body?.error || `Google HTTP ${status}`;
}

async function jsonRequest(url, init = {}, timeout = 30000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeout) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(readError(body, response.status));
  return body;
}

export async function createAntigravity(dataDir, { createCallbackServer = createServer } = {}) {
  const file = join(dataDir, 'antigravity.json');
  const oauthFile = join(dataDir, 'oauth-client.json');
  let saved = {};
  try { saved = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let pending;
  let loginError = '';
  let refreshPromise;

  async function persist() {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(saved), { mode: 0o600 });
    await rename(temp, file);
  }

  async function credentials() {
    let config = {};
    try { config = JSON.parse(await readFile(oauthFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const clientId = process.env.ENGLISH_EXTENSION_GOOGLE_CLIENT_ID || config.clientId;
    const clientSecret = process.env.ENGLISH_EXTENSION_GOOGLE_CLIENT_SECRET || config.clientSecret;
    if (!clientId || !clientSecret) {
      throw new Error('Thiếu Google OAuth client. Hãy cấu hình oauth-client.json theo README.');
    }
    return { clientId, clientSecret };
  }

  async function exchange(form) {
    const { clientId, clientSecret } = await credentials();
    return jsonRequest(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...form }),
    });
  }

  async function refresh() {
    if (!saved.refreshToken) throw new Error('Hãy đăng nhập Antigravity lại.');
    if (!refreshPromise) {
      refreshPromise = (async () => {
        const tokens = await exchange({ grant_type: 'refresh_token', refresh_token: saved.refreshToken });
        if (!tokens.access_token || !Number.isFinite(tokens.expires_in)) throw new Error('Google không trả về access token hợp lệ.');
        saved = { ...saved, accessToken: tokens.access_token, refreshToken: tokens.refresh_token || saved.refreshToken,
          expiresAt: Date.now() + tokens.expires_in * 1000 };
        await persist();
        return saved.accessToken;
      })().finally(() => { refreshPromise = undefined; });
    }
    return refreshPromise;
  }

  async function accessToken() {
    if (!saved.refreshToken) throw new Error('Hãy kết nối tài khoản Google Antigravity trong Settings.');
    if (saved.accessToken && saved.expiresAt > Date.now() + 300000) return saved.accessToken;
    return refresh();
  }

  async function googleRequest(url, body, retry = true, timeout = 30000) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${await accessToken()}`, 'content-type': 'application/json', 'user-agent': USER_AGENT, 'x-request-source': 'local' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    if (response.status === 401 && retry) {
      saved.expiresAt = 0;
      await refresh();
      return googleRequest(url, body, false, timeout);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(readError(result, response.status));
    return result;
  }

  async function finishLogin(tokens) {
    if (!tokens.access_token || !tokens.refresh_token || !Number.isFinite(tokens.expires_in)) {
      throw new Error('Google không trả về refresh token. Hãy thu hồi quyền ứng dụng rồi đăng nhập lại.');
    }
    saved = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
    const userInfo = await jsonRequest('https://www.googleapis.com/oauth2/v1/userinfo?alt=json', {
      headers: { authorization: `Bearer ${saved.accessToken}` },
    }).catch(() => ({}));
    saved.email = userInfo.email || '';
    const project = await googleRequest(`${CLOUD_CODE}/v1internal:loadCodeAssist`, { metadata: METADATA });
    saved.projectId = project.cloudaicompanionProject?.id || project.cloudaicompanionProject || '';
    if (!saved.projectId) throw new Error('Google không trả về Cloud Code project cho tài khoản này.');
    await persist();
    const tierId = project.allowedTiers?.find(tier => tier.isDefault)?.id || 'legacy-tier';
    googleRequest(`${CLOUD_CODE}/v1internal:onboardUser`, { tierId, metadata: METADATA }).catch(() => {});
  }

  async function login() {
    if (pending) throw new Error('Đang chờ hoàn tất đăng nhập Antigravity.');
    const { clientId } = await credentials();
    const state = randomBytes(32).toString('hex');
    const callback = createCallbackServer(async (req, res) => {
      const address = callback.address();
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      if (req.method !== 'GET' || url.pathname !== '/antigravity/callback' || req.headers.host !== `127.0.0.1:${address.port}`) {
        res.writeHead(404).end(); return;
      }
      if (url.searchParams.getAll('state').length !== 1 || url.searchParams.get('state') !== state) {
        res.writeHead(400).end('Invalid OAuth state'); return;
      }
      clearTimeout(pending.timer);
      pending = undefined;
      callback.close();
      try {
        if (url.searchParams.has('error')) throw new Error(url.searchParams.get('error_description') || url.searchParams.get('error'));
        const code = url.searchParams.get('code');
        if (!code) throw new Error('Google không trả về authorization code.');
        const tokens = await exchange({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
        await finishLogin(tokens);
        loginError = '';
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end('Antigravity connected. Return to English Extension.');
      } catch (error) {
        loginError = error.message;
        res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end(`Antigravity sign-in failed: ${loginError}`);
      }
    });
    await new Promise((resolve, reject) => { callback.once('error', reject); callback.listen(0, '127.0.0.1', resolve); });
    const redirectUri = `http://127.0.0.1:${callback.address().port}/antigravity/callback`;
    const timer = setTimeout(() => { callback.close(); pending = undefined; loginError = 'Đăng nhập Antigravity đã hết thời gian.'; }, 300000);
    pending = { timer, cancel: () => { clearTimeout(timer); callback.close(); } };
    loginError = '';
    const params = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri,
      scope: SCOPE, state, access_type: 'offline', prompt: 'consent' });
    return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` };
  }

  function status() {
    return { status: pending ? 'connecting' : saved.refreshToken && saved.projectId ? 'connected' : 'disconnected',
      email: saved.email || '', projectId: saved.projectId || '', error: loginError };
  }

  async function logout() {
    if (pending) { pending.cancel(); pending = undefined; }
    saved = {};
    await persist();
    loginError = '';
    return { ok: true };
  }

  async function models() {
    const result = await googleRequest(`${ANTIGRAVITY_API}/v1internal:fetchAvailableModels`, { project: saved.projectId });
    const names = Object.keys(result.models || {}).filter(name => /^[a-zA-Z0-9._-]+$/.test(name));
    return { models: (names.length ? names : FALLBACK_MODELS).map(value => ({ value, label: value })) };
  }

  function convertMessage(message) {
    const parts = [];
    if (message.content) parts.push({ text: message.content });
    if (message.imageBase64) {
      const match = /^data:(image\/[a-zA-Z0-9.+_-]+);base64,(.+)$/.exec(message.imageBase64);
      parts.push({ inlineData: { mimeType: match?.[1] || 'image/jpeg', data: match?.[2] || message.imageBase64 } });
    }
    return { role: message.role === 'assistant' ? 'model' : 'user', parts };
  }

  async function response({ model, messages }) {
    if (typeof model !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(model) || !Array.isArray(messages) || messages.length > 30 ||
        !messages.every(message => ['system', 'user', 'assistant'].includes(message.role) && typeof message.content === 'string' &&
          (!message.imageBase64 || typeof message.imageBase64 === 'string'))) throw new Error('Yêu cầu Antigravity không hợp lệ.');
    if (!saved.projectId) throw new Error('Hãy kết nối tài khoản Google Antigravity trong Settings.');
    const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n\n');
    const contents = messages.filter(message => message.role !== 'system').map(convertMessage);
    const request = { contents, sessionId: (BigInt(`0x${randomBytes(8).toString('hex')}`) & ((1n << 63n) - 1n)).toString(),
      generationConfig: { maxOutputTokens: 8192 },
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}) };
    const payload = { project: saved.projectId, model: MODEL_ALIASES[model] || model, userAgent: 'antigravity',
      requestId: `agent/${randomUUID()}/${Date.now()}/${randomUUID()}/${Math.max(1, contents.length * 2 - 1)}`, request };
    const result = await googleRequest(`${ANTIGRAVITY_API}/v1internal:generateContent`, payload, true, 120000);
    const output = result.response || result;
    const text = (output.candidates?.[0]?.content?.parts || []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('');
    if (!text.trim()) throw new Error(output.promptFeedback?.blockReason || 'Antigravity không trả về nội dung.');
    return { text };
  }

  return { login, status, logout, models, response };
}
