import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EncryptedReceiptStore } from '../src/encrypted-store.ts';
const secrets = await import('../src/local-secrets.ts').catch(() => ({})) as any;
const local = await import('../src/local.ts').catch(() => ({})) as any;
const token = 'fictional-discord-bot-token-1234567890';

test('token replacement preserves the keys needed to read receipts and authenticate GitHub', () => {
  assert.equal(typeof secrets.generateLocalSecrets, 'function');
  const first = secrets.generateLocalSecrets(token);
  assert.match(first.receiptKey, /^[a-f0-9]{64}$/);
  assert.match(first.notificationSecret, /^[a-f0-9]{64}$/);
  assert.notEqual(first.receiptKey, first.notificationSecret);
  const updated = secrets.generateLocalSecrets(token + '-replacement', first);
  assert.equal(updated.notificationSecret, first.notificationSecret);
  assert.equal(updated.receiptKey, first.receiptKey);
  assert.equal(updated.botToken, token + '-replacement');
  assert.throws(() => secrets.generateLocalSecrets('short'), /token/i);
});

test('Windows user-protected secrets round-trip without plaintext in the saved file and reject corrupt data', () => {
  assert.equal(typeof secrets.saveLocalSecrets, 'function');
  const dir = mkdtempSync(join(tmpdir(), 'sm-dpapi-test-')), file = join(dir, 'secrets.dpapi');
  try {
    const value = secrets.generateLocalSecrets(token);
    secrets.saveLocalSecrets(file, value);
    const wrapped = readFileSync(file);
    for (const secret of [token, value.receiptKey, value.notificationSecret])
      assert.equal(wrapped.includes(Buffer.from(secret)), false);
    assert.deepEqual(secrets.loadLocalSecrets(file), value);
    assert.throws(() => secrets.unprotectLocal(Buffer.from('invalid protected blob')), /protect|secret|Windows/i);
  } finally {
    assert.equal(dirname(resolve(dir)).toLowerCase(), resolve(tmpdir()).toLowerCase());
    assert.match(basename(dir), /^sm-dpapi-test-/);
    rmSync(dir, { recursive: true, force: true });
  }
});

test('feeds launcher keeps all secrets out of arguments and runs master feeds with stats disabled', async () => {
  assert.equal(typeof local.runLocalFeeds, 'function');
  const value = secrets.generateLocalSecrets(token), original = { SM_STATS_ENABLED: 'true', SM_DEVELOPMENT_BRANCH: 'other' };
  let captured: any, source: any;
  await local.runLocalFeeds(value, original, 'C:/private/receipts.sqlite', async (args: string[], env: any) => {
    source = env; captured = { args, env: { ...env } }; return 0;
  });
  assert.deepEqual(captured.args, ['src/main.ts']);
  for (const privateValue of [token, value.receiptKey, value.notificationSecret])
    assert.equal(JSON.stringify(captured.args).includes(privateValue), false);
  assert.equal(captured.env.SM_NOTIFICATIONS_ENABLED, 'true');
  assert.equal(captured.env.SM_STATS_ENABLED, 'false');
  assert.equal(captured.env.SM_HYPIXEL_API_KEY, '');
  assert.equal(captured.env.SM_DEVELOPMENT_BRANCH, 'master');
  assert.equal(captured.env.SM_DATA_FILE, 'C:/private/receipts.sqlite');
  assert.equal(captured.env.SM_RECEIPT_KEY, value.receiptKey);
  assert.equal(captured.env.SM_NOTIFICATION_SECRET, value.notificationSecret);
  assert.equal(original.SM_STATS_ENABLED, 'true');
  for (const field of ['SM_DISCORD_BOT_TOKEN','SM_RECEIPT_KEY','SM_NOTIFICATION_SECRET']) assert.equal(source[field], '');
});

test('clipboard export passes only the signing secret through stdin and sanitizes helper errors', () => {
  assert.equal(typeof secrets.copyNotificationSecret, 'function');
  const value = 'f'.repeat(64);
  secrets.copyNotificationSecret(value, (_file: string, args: string[], options: any) => {
    assert.equal(args.some(arg => arg.includes(value)), false);
    assert.equal(Buffer.from(options.input.toString(), 'base64').toString(), value);
    assert.equal(Object.keys(options.env).some(key => key.startsWith('SM_')), false);
    return { status: 0, stdout: Buffer.from('b2s='), stderr: Buffer.alloc(0) };
  });
  assert.throws(() => secrets.copyNotificationSecret(value, () => ({ status: 1, stderr: Buffer.from(value) })), error => {
    assert.equal(String(error).includes(value), false); return true;
  });
});

test('public launcher defaults do not erase the optional private GitHub read credential', async () => {
  assert.equal(typeof local.localFeedBase, 'function');
  const privateGithub = 'fictional-github-read-token';
  const base = local.localFeedBase({ SM_GITHUB_READ_TOKEN: privateGithub, SM_APPLICATION_ID: 'unapproved' },
    { SM_GITHUB_READ_TOKEN: '', SM_APPLICATION_ID: '1568203972978679888' });
  let captured: any;
  await local.runLocalFeeds(secrets.generateLocalSecrets(token), base, 'C:/private/receipts.sqlite', async (_args: any, env: any) => {
    captured = { ...env }; return 0;
  });
  assert.equal(captured.SM_GITHUB_READ_TOKEN, privateGithub);
  assert.equal(captured.SM_APPLICATION_ID, '1568203972978679888');
  assert.equal(captured.SM_DEVELOPMENT_BRANCH, 'master');
});

test('local receipt review loads the protected key without asking the operator to reveal it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sm-dpapi-review-')), root = join(dir, 'SparklingMutualsBot');
  try {
    const value = secrets.generateLocalSecrets(token);
    secrets.saveLocalSecrets(join(root, 'secrets.dpapi'), value);
    const store = new EncryptedReceiptStore(join(root, 'receipts.sqlite'), Buffer.from(value.receiptKey, 'hex'));
    try { store.claim('public-run', '1568145030500057098', 'a'.repeat(64), 1000); } finally { store.close(); }
    const result = spawnSync(process.execPath, ['tools/local-receipts.ts'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', env: { ...process.env, LOCALAPPDATA: dir }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout)[0].state, 'pending');
    for (const privateValue of [token, value.receiptKey, value.notificationSecret])
      assert.equal((result.stdout + result.stderr).includes(privateValue), false);
  } finally {
    assert.equal(dirname(resolve(dir)).toLowerCase(), resolve(tmpdir()).toLowerCase());
    assert.match(basename(dir), /^sm-dpapi-review-/); rmSync(dir, { recursive: true, force: true });
  }
});
