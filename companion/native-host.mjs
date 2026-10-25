import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGIN = process.argv[2];
const REQUEST_ORIGIN = ORIGIN?.replace(/\/$/, '');
const PORT = Number(process.env.ENGLISH_EXTENSION_COMPANION_PORT || 39671);
const STATE_PATH = join(process.env.ENGLISH_EXTENSION_DATA_DIR || join(homedir(), '.config', 'english-extension'), 'chatgpt.json');
const SERVER_PATH = join(dirname(fileURLToPath(import.meta.url)), 'server.mjs');

function send(value) {
  const payload = Buffer.from(JSON.stringify(value));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(payload.length);
  process.stdout.write(Buffer.concat([length, payload]));
}

async function readMessage() {
  return new Promise((resolve, reject) => {
    let data = Buffer.alloc(0);
    const timer = setTimeout(() => finish(new Error('Native message timed out')), 10000);
    const finish = (error, value) => {
      clearTimeout(timer);
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.pause();
      if (error) reject(error); else resolve(value);
    };
    const onEnd = () => finish(new Error('Missing native message'));
    const onData = (chunk) => {
      data = Buffer.concat([data, chunk]);
      if (data.length < 4) return;
      const length = data.readUInt32LE(0);
      if (length < 1 || length > 1024 * 1024) { finish(new Error('Invalid native message')); return; }
      if (data.length >= length + 4) {
        try { finish(null, JSON.parse(data.subarray(4, length + 4).toString('utf8'))); }
        catch (error) { finish(error); }
      }
    };
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
  });
}

async function currentToken() {
  try {
    const state = JSON.parse(await readFile(STATE_PATH, 'utf8'));
    return typeof state.pairingToken === 'string' ? state.pairingToken : '';
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

async function serverReady(token) {
  if (!token) return false;
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/antigravity/status`, {
      headers: { origin: REQUEST_ORIGIN, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(500),
    });
    return response.ok;
  } catch { return false; }
}

try {
  if (!/^chrome-extension:\/\/[a-p]{32}\/?$/.test(ORIGIN || '')) throw new Error('Unauthorized extension origin');
  const message = await readMessage();
  if (message?.action !== 'start') throw new Error('Unsupported native message');
  let token = await currentToken();
  if (!(await serverReady(token))) {
    const child = spawn(process.execPath, [SERVER_PATH], { detached: true, stdio: 'ignore' });
    child.unref();
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      token = await currentToken();
      if (await serverReady(token)) { ready = true; break; }
    }
    if (!ready) throw new Error('AI companion could not start. An older companion may still be using port 39671; stop it and retry.');
  }
  send({ ok: true, pairingToken: token });
} catch (error) {
  send({ ok: false, error: error.message || 'Native host failed' });
}
