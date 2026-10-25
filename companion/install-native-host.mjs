import { mkdir, writeFile, chmod, copyFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionId = process.argv[2];
if (!/^[a-p]{32}$/.test(extensionId || '')) {
  console.error('Usage: npm run ai:install-host -- <32-character Chrome extension ID>');
  process.exit(1);
}
if (process.platform !== 'darwin') {
  console.error('This installer currently supports macOS Chrome.');
  process.exit(1);
}

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const sourceDir = dirname(fileURLToPath(import.meta.url));
const hostDir = join(homedir(), '.config', 'english-extension');
const installedHost = join(hostDir, 'native-host.mjs');
const installedServer = join(hostDir, 'server.mjs');
const installedAntigravity = join(hostDir, 'antigravity.mjs');
const wrapper = join(hostDir, 'native-host.sh');
const manifestDir = join(homedir(), 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts');
const manifestPath = join(manifestDir, 'com.english_extension.chatgpt.json');

await mkdir(hostDir, { recursive: true, mode: 0o700 });
await mkdir(manifestDir, { recursive: true });
await copyFile(join(sourceDir, 'native-host.mjs'), installedHost);
await copyFile(join(sourceDir, 'server.mjs'), installedServer);
await copyFile(join(sourceDir, 'antigravity.mjs'), installedAntigravity);
await chmod(installedHost, 0o600);
await chmod(installedServer, 0o600);
await chmod(installedAntigravity, 0o600);
await writeFile(wrapper, `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(installedHost)} "$@"\n`, { mode: 0o700 });
await chmod(wrapper, 0o700);
await writeFile(manifestPath, JSON.stringify({
  name: 'com.english_extension.chatgpt',
  description: 'English Extension local AI sign-in helper',
  path: wrapper,
  type: 'stdio',
  allowed_origins: [`chrome-extension://${extensionId}/`],
}, null, 2), { mode: 0o600 });
console.log(`Native host installed for extension ${extensionId}. Reload the extension in Chrome.`);
