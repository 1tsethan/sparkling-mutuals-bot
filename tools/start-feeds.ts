import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { localFeedBase, runLocalFeeds } from '../src/local.ts';
import { loadLocalSecrets, localPaths } from '../src/local-secrets.ts';
try {
  if (process.argv.length > 2) throw new Error('The local feeds launcher accepts no arguments.');
  const paths = localPaths(), secrets = loadLocalSecrets(paths.vault);
  const publicConfig = parseEnv(readFileSync(new URL('../.env.example', import.meta.url), 'utf8'));
  console.log('SM release feeds: master action builds, stable releases and verified beta releases. Stats remain disabled.');
  console.log('Keep this window and the tunnel open. Use Ctrl+C to stop. Receipt payloads are encrypted on disk.');
  try {
    await runLocalFeeds(secrets, localFeedBase(process.env, publicConfig), paths.receipts, (args, env) => new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: fileURLToPath(new URL('../', import.meta.url)), env, stdio: 'inherit', windowsHide: true });
      child.once('error', () => reject(new Error('Could not start the local Node process.')));
      child.once('exit', (code, signal) => resolve(signal === 'SIGINT' ? 0 : code ?? 1));
    }));
  } finally { secrets.botToken = ''; secrets.notificationSecret = ''; secrets.receiptKey = ''; }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local feed startup failed.');
  process.exitCode = 1;
}
