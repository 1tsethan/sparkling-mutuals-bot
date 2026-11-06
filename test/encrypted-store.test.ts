import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const storage = await import('../src/encrypted-store.ts').catch(() => ({})) as any;
const key = Buffer.alloc(32, 7), notice = 'official-run:76543210';
const channel = '1568145030500057098', message = '1568234511756558346', digest = 'b'.repeat(64);
function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'sm-encrypted-receipts-'));
  return { dir, file: join(dir, 'receipts.sqlite'), clean() {
    assert.equal(dirname(resolve(dir)).toLowerCase(), resolve(tmpdir()).toLowerCase());
    assert.match(basename(dir), /^sm-encrypted-receipts-/);
    rmSync(dir, { recursive: true, force: true });
  } };
}
function open(file: string, encryptionKey = key) {
  assert.equal(typeof storage.EncryptedReceiptStore, 'function', 'encrypted receipt storage must exist');
  return new storage.EncryptedReceiptStore(file, encryptionKey);
}

test('encrypted receipts preserve confirmed and uncertain sends across restart without plaintext in database or WAL', () => {
  const s = sandbox(); let store: any;
  try {
    store = open(s.file);
    assert.equal(store.claim(notice, channel, digest, 1000), 'new');
    store.sent(notice, message);
    assert.equal(store.claim('uncertain-run', channel, digest, 1000), 'new');
    store.uncertain('uncertain-run');
    for (const file of readdirSync(s.dir)) {
      const raw = readFileSync(join(s.dir, file));
      for (const identifier of [notice, 'uncertain-run', channel, message, digest])
        assert.equal(raw.includes(Buffer.from(identifier)), false, 'plaintext receipt leaked into ' + file);
    }
    store.close(); store = open(s.file);
    assert.equal(store.claim(notice, channel, digest, 2000), 'duplicate');
    assert.equal(store.claim('uncertain-run', channel, digest, 2000), 'needs_review');
    assert.equal(store.list().find((row: any) => row.key === notice).message, message);
  } finally { store?.close(); s.clean(); }
});

test('two SQLite connections cannot both claim an encrypted notice and retry deadlines survive reopening', () => {
  const s = sandbox(); let first: any, second: any;
  try {
    first = open(s.file); second = open(s.file);
    assert.equal(first.claim(notice, channel, digest, 1000), 'new');
    assert.equal(second.claim(notice, channel, digest, 1000), 'needs_review');
    assert.equal(second.claim(notice, '123456789012345678', digest, 1000), 'needs_review');
    first.retryable(notice, 3000);
    first.close(); first = undefined;
    assert.equal(second.claim(notice, channel, digest, 2999), 'waiting');
    assert.equal(second.claim(notice, channel, digest, 3000), 'new');
    second.close(); second = open(s.file);
    assert.equal(second.claim(notice, channel, digest, 4000), 'needs_review');
  } finally { first?.close(); second?.close(); s.clean(); }
});

test('wrong receipt key and altered ciphertext fail closed without discarding durable receipts', () => {
  const s = sandbox(); let store: any, db: DatabaseSync | undefined;
  try {
    store = open(s.file); store.claim(notice, channel, digest, 1000); store.close(); store = undefined;
    assert.throws(() => open(s.file, Buffer.alloc(32, 8)), /receipt|decrypt|key|storage/i);
    store = open(s.file);
    assert.equal(store.claim(notice, channel, digest, 1000), 'needs_review');
    store.close(); store = undefined;
    db = new DatabaseSync(s.file);
    const row = db.prepare('SELECT key_hash, payload FROM encrypted_notices LIMIT 1').get() as any;
    const envelope = JSON.parse(row.payload);
    const cipher = Buffer.from(envelope.data, 'base64'); cipher[0] ^= 1;
    envelope.data = cipher.toString('base64');
    db.prepare('UPDATE encrypted_notices SET payload = ? WHERE key_hash = ?').run(JSON.stringify(envelope), row.key_hash);
    db.close(); db = undefined;
    store = open(s.file);
    assert.throws(() => store.claim(notice, channel, digest, 1000), /receipt|decrypt|storage/i);
    assert.equal(store.list === undefined, false);
  } finally { db?.close(); store?.close(); s.clean(); }
});

test('operator receipt listing reads the encrypted database without creating plaintext receipt tables', () => {
  const s = sandbox(); let store: any;
  try {
    store = open(s.file); store.claim(notice, channel, digest, 1000); store.sent(notice, message); store.close(); store = undefined;
    const result = spawnSync(process.execPath, ['tools/receipts.ts'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8',
      env: { ...process.env, SM_DATA_FILE: s.file, SM_RECEIPT_KEY: key.toString('hex') }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout)[0].message, message);
    store = open(s.file);
    assert.equal(store.claim(notice, channel, digest, 2000), 'duplicate');
  } finally { store?.close(); s.clean(); }
});
