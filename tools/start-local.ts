import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { readSecret, runLocalTrial } from '../src/local.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--register')) throw new Error('Only --register is supported by this initial local launcher.');
  console.log('SM local connection trial. Stats and release feeds remain disabled.');
  console.log('The local HTTP listener still needs an HTTPS connection from Discord.');
  console.log('Use Ctrl+C to stop. No token or player data is saved to disk by this launcher.');
  const publicConfig = parseEnv(readFileSync(new URL('../.env.example', import.meta.url), 'utf8'));
  await runLocalTrial(await readSecret(), args.includes('--register'), { ...process.env, ...publicConfig }, async (args, env) => {
    return new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
      child.once('error', () => reject(new Error('Could not start the local Node process.')));
      child.once('exit', (code, signal) => resolve(signal === 'SIGINT' ? 0 : code ?? 1));
    });
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Local startup failed.');
  process.exitCode = 1;
}
