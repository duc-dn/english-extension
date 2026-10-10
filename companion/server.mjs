import { createHash, createPublicKey, randomBytes, randomUUID, timingSafeEqual, verify } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPE = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const CALLBACK_PATH = '/auth/callback';
const PORT = Number(process.env.ENGLISH_EXTENSION_COMPANION_PORT || 39671);
const DATA_DIR = process.env.ENGLISH_EXTENSION_DATA_DIR || join(homedir(), '.config', 'english-extension');
const DATA_FILE = join(DATA_DIR, 'chatgpt.json');
const random = () => randomBytes(32).toString('base64url');
let saved;
let pending;
let loginError = '';
let loginGeneration = 0;

async function persist() {
  await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
  const temp = `${DATA_FILE}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(saved), { mode: 0o600 });
  await rename(temp, DATA_FILE);
}

async function load() {
  try { saved = JSON.parse(await readFile(DATA_FILE, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    saved = { hostId: `urn:uuid:${randomUUID()}`, pairingToken: random() };
    await persist();
  }
  if (!saved.hostId || !saved.pairingToken) throw new Error('Invalid companion state');
}

function send(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': res.origin || '',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    vary: 'Origin',
  });
  res.end(JSON.stringify(data));
}

async function requestJson(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error_description || body.error?.message || body.error || `HTTP ${response.status}`);
  return body;
}

async function discovery() {
  const doc = await requestJson(`${ISSUER}/.well-known/openid-configuration`);
  if (doc.issuer !== ISSUER || new URL(doc.jwks_uri).origin !== ISSUER || new URL(doc.token_endpoint).origin !== ISSUER) {
    throw new Error('Invalid OpenAI identity configuration');
  }
  return doc;
}

async function verifyIdToken(token, clientId, nonce, previousSubject) {
  const [headerPart, payloadPart, signaturePart] = token.split('.');
  if (!headerPart || !payloadPart || !signaturePart) throw new Error('Invalid ID token');
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());
  const claims = JSON.parse(Buffer.from(payloadPart, 'base64url').toString());
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Unsupported ID token signature');
  const doc = await discovery();
  const jwks = await requestJson(doc.jwks_uri);
  const key = jwks.keys?.find((candidate) => candidate.kid === header.kid && candidate.kty === 'RSA' && (!candidate.use || candidate.use === 'sig'));
  if (!key || !verify('RSA-SHA256', Buffer.from(`${headerPart}.${payloadPart}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(signaturePart, 'base64url'))) {
    throw new Error('ID token signature could not be verified');
  }
  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== ISSUER || !(claims.aud === clientId || (Array.isArray(claims.aud) && claims.aud.includes(clientId) && claims.azp === clientId)) ||
      !claims.sub || claims.exp <= now || claims.iat > now + 60 ||
      (nonce && claims.nonce !== nonce) || (previousSubject && claims.sub !== previousSubject) ||
      (claims.azp && claims.azp !== clientId)) throw new Error('ID token identity does not match');
  return { subject: claims.sub, email: typeof claims.email === 'string' ? claims.email : '', name: typeof claims.name === 'string' ? claims.name : '' };
}

async function exchange(form) {
  const doc = await discovery();
  return requestJson(doc.token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form),
  });
}

async function saveTokens(tokens, clientId, nonce, previousSubject = saved.subject) {
  if (!tokens.id_token || !tokens.access_token || tokens.token_type?.toLowerCase() !== 'bearer' ||
      !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 || !tokens.refresh_token || !tokens.scope) {
    throw new Error('Incomplete OAuth token response');
  }
  const identity = await verifyIdToken(tokens.id_token, clientId, nonce, previousSubject);
  if (!tokens.scope.split(/\s+/).includes('chatgpt.tokens.use.direct')) throw new Error('ChatGPT plan usage permission was not granted');
  saved = {
    ...saved, clientId, ...identity, idToken: tokens.id_token,
    accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000, scope: tokens.scope,
    earliestRefreshAt: tokens.earliest_refresh_at,
  };
  await persist();
}

async function accessToken() {
  if (!saved.accessToken) throw new Error('Please sign in with ChatGPT');
  if (saved.expiresAt > Date.now() + 60000) return saved.accessToken;
  if (!saved.refreshToken) throw new Error('Please sign in with ChatGPT again');
  const earliest = typeof saved.earliestRefreshAt === 'number' ? saved.earliestRefreshAt * 1000 : Date.parse(saved.earliestRefreshAt || '');
  if (Number.isFinite(earliest) && earliest > Date.now()) throw new Error('ChatGPT token is not ready to refresh. Try again shortly.');
  const tokens = await exchange({ grant_type: 'refresh_token', client_id: saved.clientId, refresh_token: saved.refreshToken, resource: RESOURCE });
  const scope = tokens.scope || saved.scope;
  if (!tokens.access_token || !tokens.refresh_token || tokens.token_type?.toLowerCase() !== 'bearer' ||
      !Number.isFinite(tokens.expires_in) || tokens.expires_in <= 0 || !scope?.split(/\s+/).includes('chatgpt.tokens.use.direct')) {
    throw new Error('Incomplete ChatGPT token refresh');
  }
  const identity = tokens.id_token ? await verifyIdToken(tokens.id_token, saved.clientId, undefined, saved.subject) : {};
  saved = { ...saved, ...identity, accessToken: tokens.access_token, refreshToken: tokens.refresh_token,
    idToken: tokens.id_token || saved.idToken, expiresAt: Date.now() + tokens.expires_in * 1000,
    scope, earliestRefreshAt: tokens.earliest_refresh_at };
  await persist();
  return saved.accessToken;
}

async function startLogin({ newAccount = false } = {}) {
  if (pending && !newAccount) throw new Error('Sign-in is already in progress');
  if (pending) pending.cancel();
  const generation = ++loginGeneration;
  const previousClientId = newAccount ? undefined : saved.clientId;
  const previousSubject = newAccount ? null : saved.subject;
  const previousIdToken = newAccount ? undefined : saved.idToken;
  const state = random();
  const nonce = random();
  const verifier = random();
  const callback = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    if (req.method !== 'GET' || url.pathname !== CALLBACK_PATH || req.headers.host !== `127.0.0.1:${callback.address().port}`) {
      res.writeHead(404).end(); return;
    }
    const actual = Buffer.from(url.searchParams.get('state') || '');
    const expected = Buffer.from(state);
    if (!pending || url.searchParams.getAll('state').length !== 1 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) { res.writeHead(400).end('Invalid state'); return; }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
    res.end('You can return to English Extension.');
    clearTimeout(pending.timer);
    callback.close();
    pending = undefined;
    try {
      if (url.searchParams.has('error')) throw new Error(url.searchParams.get('error_description') || url.searchParams.get('error'));
      const clientId = previousClientId || url.searchParams.get('client_id');
      if (!clientId || clientId === 'dynamic_agent_client' || (previousClientId && url.searchParams.has('client_id') && clientId !== url.searchParams.get('client_id'))) throw new Error('ChatGPT client registration failed');
      const code = url.searchParams.get('code');
      if (!code) throw new Error('Authorization code missing');
      const tokens = await exchange({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: verifier, redirect_uri: redirectUri, resource: RESOURCE });
      if (generation !== loginGeneration) return;
      await saveTokens(tokens, clientId, nonce, previousSubject);
      loginError = '';
    } catch (error) { if (generation === loginGeneration) loginError = error.message; }
  });
  await new Promise((resolve, reject) => { callback.once('error', reject); callback.listen(0, '127.0.0.1', resolve); });
  const redirectUri = `http://127.0.0.1:${callback.address().port}${CALLBACK_PATH}`;
  const params = new URLSearchParams({
    client_id: previousClientId || 'dynamic_agent_client', ext_agent_host_id: saved.hostId,
    response_type: 'code', redirect_uri: redirectUri, scope: SCOPE, resource: RESOURCE,
    state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  });
  if (!previousClientId) params.set('agent_name_hint', 'English Extension');
  if (previousIdToken) params.set('id_token_hint', previousIdToken);
  loginError = '';
  const attempt = {
    timer: setTimeout(() => { callback.close(); if (pending === attempt) pending = undefined; loginError = 'Sign-in timed out'; }, 300000),
    cancel: () => { clearTimeout(attempt.timer); callback.close(); if (pending === attempt) pending = undefined; },
  };
  pending = attempt;
  return `${ISSUER}/api/accounts/authorize?${params}`;
}

async function aiRequest(path, init) {
  let response = await fetch(`${RESOURCE}${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(120000) });
  if (response.status === 401 && saved.refreshToken) {
    saved.expiresAt = 0;
    response = await fetch(`${RESOURCE}${path}`, { ...init, headers: { ...init.headers, authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(120000) });
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message || body.error || `OpenAI HTTP ${response.status}`);
  }
  return response;
}

async function readBody(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 100000) throw new Error('Request too large');
  }
  return JSON.parse(text || '{}');
}

async function respond(req, res) {
  const origin = req.headers.origin || '';
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) { res.writeHead(403).end(); return; }
  res.origin = origin;
  if (req.method === 'OPTIONS') { send(res, 204, {}); return; }
  if (req.headers.authorization !== `Bearer ${saved.pairingToken}`) { send(res, 401, { error: 'Invalid pairing code' }); return; }
  try {
    if (req.method === 'GET' && req.url === '/status') {
      send(res, 200, { status: pending ? 'connecting' : saved.accessToken ? 'connected' : 'disconnected', email: saved.email, name: saved.name, sharing: !!saved.accessToken, error: loginError });
    } else if (req.method === 'POST' && req.url === '/login') {
      const { newAccount } = await readBody(req);
      send(res, 200, { url: await startLogin({ newAccount: newAccount === true }) });
    } else if (req.method === 'POST' && req.url === '/logout') {
      for (const key of ['accessToken', 'refreshToken', 'idToken', 'expiresAt', 'scope', 'earliestRefreshAt']) delete saved[key];
      await persist(); send(res, 200, { ok: true });
    } else if (req.method === 'GET' && req.url === '/models') {
      const result = await (await aiRequest('/models', { method: 'GET' })).json();
      send(res, 200, { models: (result.models || []).filter((m) => m.visibility === 'list').map((m) => ({ value: m.slug, label: m.display_name || m.slug })) });
    } else if (req.method === 'POST' && req.url === '/response') {
      const { model, messages } = await readBody(req);
      if (typeof model !== 'string' || !model || !Array.isArray(messages) || messages.length > 30 || !messages.every((m) => ['user', 'assistant', 'developer'].includes(m.role) && typeof m.content === 'string')) throw new Error('Invalid AI request');
      const response = await aiRequest('/responses', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, input: messages, store: false, stream: true }),
      });
      let buffer = ''; let text = ''; let completed = false;
      const decoder = new TextDecoder();
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split(/\r?\n\r?\n/); buffer = events.pop() || '';
        for (const event of events) {
          const data = event.split('\n').find((line) => line.startsWith('data: '))?.slice(6);
          if (!data || data === '[DONE]') continue;
          const parsed = JSON.parse(data);
          if (parsed.type === 'response.output_text.delta') text += parsed.delta || '';
          if (parsed.type === 'response.failed' || parsed.type === 'response.incomplete') throw new Error(parsed.response?.error?.message || parsed.type);
          if (parsed.type === 'response.completed') completed = true;
        }
      }
      if (!completed) throw new Error('ChatGPT response ended before completion');
      send(res, 200, { text });
    } else send(res, 404, { error: 'Not found' });
  } catch (error) { send(res, 400, { error: error.message }); }
}

await load();
createServer((req, res) => { void respond(req, res); }).listen(PORT, '127.0.0.1', () => {
  console.log(`English Extension ChatGPT companion: http://127.0.0.1:${PORT}`);
  console.log(`Pairing code: ${saved.pairingToken}`);
});
