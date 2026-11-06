import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type LocalSecrets = { version: 1; botToken: string; notificationSecret: string; receiptKey: string };
type Runner = (...args: any[]) => any;
const failed = () => new Error('Windows secret protection failed. Use the same Windows account and preserve the existing secrets file.');
const scripts = {
  protect: `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $data=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::Protect($data,[Text.Encoding]::UTF8.GetBytes('SparklingMutualsBot/v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`,
  unprotect: `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $data=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::Unprotect($data,[Text.Encoding]::UTF8.GetBytes('SparklingMutualsBot/v1'),[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`,
  clipboard: `$ErrorActionPreference='Stop'; $data=[Convert]::FromBase64String([Console]::In.ReadToEnd()); Set-Clipboard -Value ([Text.Encoding]::UTF8.GetString($data)); [Console]::Out.Write('b2s=')`
};
function windowsOperation(operation: keyof typeof scripts, value: Buffer, runner: Runner = spawnSync): Buffer {
  if (process.platform !== 'win32' || value.length > 65536) throw failed();
  const env: NodeJS.ProcessEnv = {};
  for (const name of ['SystemRoot','WINDIR','USERPROFILE','LOCALAPPDATA','TEMP','TMP']) if (process.env[name]) env[name] = process.env[name];
  const program = join(process.env.SystemRoot || 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe');
  try {
    const result = runner(program, ['-NoProfile','-NonInteractive','-STA','-Command',scripts[operation]], {
      input: Buffer.from(value.toString('base64')), windowsHide: true, timeout: 60000, maxBuffer: 131072, env
    });
    const encoded = result.stdout?.toString().trim() ?? '';
    if (result.status !== 0 || result.error || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw failed();
    return Buffer.from(encoded, 'base64');
  } catch { throw failed(); }
}
export function protectLocal(value: Buffer) { return windowsOperation('protect', value); }
export function unprotectLocal(value: Buffer) { return windowsOperation('unprotect', value); }
function validate(value: any): LocalSecrets {
  if (value?.version !== 1 || !/^[A-Za-z0-9._-]{30,300}$/.test(value.botToken ?? '') ||
      !/^[a-f0-9]{64}$/.test(value.notificationSecret ?? '') || !/^[a-f0-9]{64}$/.test(value.receiptKey ?? ''))
    throw new Error('The protected bot secrets are invalid. Preserve the existing file and review configuration.');
  return { version: 1, botToken: value.botToken, notificationSecret: value.notificationSecret, receiptKey: value.receiptKey };
}
export function generateLocalSecrets(botToken: string, previous?: LocalSecrets): LocalSecrets {
  if (!/^[A-Za-z0-9._-]{30,300}$/.test(botToken)) throw new Error('The bot token has an invalid format.');
  if (previous) return { ...validate(previous), botToken };
  return { version: 1, botToken, notificationSecret: randomBytes(32).toString('hex'), receiptKey: randomBytes(32).toString('hex') };
}
export function loadLocalSecrets(file: string): LocalSecrets {
  try {
    if (statSync(file).size > 65536) throw failed();
    const plaintext = unprotectLocal(readFileSync(file));
    try { return validate(JSON.parse(plaintext.toString('utf8'))); } finally { plaintext.fill(0); }
  } catch { throw failed(); }
}
export function saveLocalSecrets(file: string, value: LocalSecrets) {
  const plaintext = Buffer.from(JSON.stringify(validate(value)));
  let wrapped: Buffer;
  try { wrapped = protectLocal(plaintext); } finally { plaintext.fill(0); }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = file + '.' + randomBytes(8).toString('hex') + '.tmp';
  try { writeFileSync(temporary, wrapped, { flag: 'wx', mode: 0o600 }); renameSync(temporary, file); }
  catch { try { unlinkSync(temporary); } catch {} throw failed(); }
}
export function copyNotificationSecret(value: string, runner: Runner = spawnSync) {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid notification signing secret.');
  windowsOperation('clipboard', Buffer.from(value), runner);
}
export function localPaths() {
  if (!process.env.LOCALAPPDATA) throw new Error('LOCALAPPDATA is required for local bot hosting.');
  const root = join(process.env.LOCALAPPDATA, 'SparklingMutualsBot');
  return { root, vault: join(root, 'secrets.dpapi'), receipts: join(root, 'receipts.sqlite') };
}
