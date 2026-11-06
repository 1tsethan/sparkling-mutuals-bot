import type { ReadStream } from 'node:tty';
import type { Writable } from 'node:stream';
import { SM_GUILD } from './config.ts';

export function readSecret(input: ReadStream = process.stdin, output: Writable = process.stderr): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== 'function')
    return Promise.reject(new Error('Open the local launcher in an interactive terminal for masked token entry.'));
  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw;
    let value = '', done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      input.removeListener('data', onData);
      input.removeListener('end', onEnd);
      input.removeListener('error', onError);
      input.setRawMode(wasRaw);
      input.pause();
      output.write('\n');
      if (error) reject(error); else resolve(value.trim());
      value = '';
    };
    const onEnd = () => finish(new Error('Token entry ended.'));
    const onError = () => finish(new Error('Token entry failed.'));
    const onData = (data: Buffer | string) => {
      for (const char of data.toString()) {
        if (char === '\u0003') { finish(new Error('Token entry cancelled.')); return; }
        if (char === '\r' || char === '\n') { finish(); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
        if (value.length > 300) { finish(new Error('Token entry was too long.')); return; }
      }
    };
    output.write('Discord bot token (hidden; held in memory only): ');
    input.setRawMode(true);
    input.on('data', onData); input.once('end', onEnd); input.once('error', onError);
    input.resume();
  });
}

type ChildRunner = (args: string[], env: NodeJS.ProcessEnv) => Promise<number>;
export async function runLocalTrial(token: string, register: boolean, baseEnv: NodeJS.ProcessEnv, run: ChildRunner) {
  if (!/^[A-Za-z0-9._-]{30,300}$/.test(token)) throw new Error('The bot token is missing or has an invalid format.');
  const env = { ...baseEnv, SM_GUILD_ID: SM_GUILD, HOST: '127.0.0.1', PORT: '3000',
    SM_DISCORD_BOT_TOKEN: token, SM_HYPIXEL_API_KEY: '', SM_NOTIFICATION_SECRET: '',
    SM_STATS_ENABLED: 'false', SM_NOTIFICATIONS_ENABLED: 'false', SM_DATA_FILE: ':memory:' };
  try {
    if (register && await run(['tools/register.ts', '--apply'], env) !== 0)
      throw new Error('Command registration failed; the local service was not started.');
    if (await run(['src/main.ts'], env) !== 0) throw new Error('The local service stopped with an error.');
  } finally { env.SM_DISCORD_BOT_TOKEN = ''; }
}
