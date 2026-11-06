import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { ReceiptStore } from './store.ts';
import type { ReceiptStorage } from './store.ts';
import { BotError } from './profile.ts';

type Notice = { key: string; channel: string; digest: string; state: 'pending' | 'sent' | 'uncertain' | 'retryable';
  message: string | null; retry_at: number };
const unavailable = () => new BotError('storage', 'Encrypted receipt storage is unavailable. Preserve the database and review the receipt key.');

export class EncryptedReceiptStore implements ReceiptStorage {
  private db: DatabaseSync;
  private key: Buffer;
  private interactions: ReceiptStore;
  private closed = false;
  constructor(file: string, key: Buffer, now: () => number = Date.now) {
    if (file === ':memory:' || key.length !== 32) throw new Error('Encrypted receipts require a persistent file and a 32-byte key.');
    this.key = Buffer.from(key);
    this.db = new DatabaseSync(file);
    try {
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;');
      if (this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('notices','interactions')").get())
        throw unavailable();
      this.db.exec('CREATE TABLE IF NOT EXISTS receipt_metadata (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS encrypted_notices (key_hash TEXT PRIMARY KEY, payload TEXT NOT NULL);');
      this.transaction(() => {
        const existing = this.db.prepare('SELECT payload FROM receipt_metadata WHERE id=1').get() as any;
        if (existing) {
          if (this.open(existing.payload, 'metadata')?.format !== 'SM receipts 1') throw unavailable();
        } else {
          if (this.db.prepare('SELECT key_hash FROM encrypted_notices LIMIT 1').get()) throw unavailable();
          this.db.prepare('INSERT INTO receipt_metadata (id,payload) VALUES (1,?)').run(this.seal({ format: 'SM receipts 1' }, 'metadata'));
        }
      });
      this.interactions = new ReceiptStore(':memory:', now);
    } catch {
      this.db.close(); this.key.fill(0); throw unavailable();
    }
  }
  private seal(value: unknown, context: string): string {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from('sm-receipts-v1:' + context));
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
  }
  private open(payload: string, context: string): any {
    try {
      if (typeof payload !== 'string' || payload.length > 16384) throw unavailable();
      const envelope = JSON.parse(payload), iv = Buffer.from(envelope.iv, 'base64'), tag = Buffer.from(envelope.tag, 'base64');
      if (envelope.v !== 1 || iv.length !== 12 || tag.length !== 16 || typeof envelope.data !== 'string') throw unavailable();
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(Buffer.from('sm-receipts-v1:' + context)); decipher.setAuthTag(tag);
      return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]).toString('utf8'));
    } catch { throw unavailable(); }
  }
  private transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = work(); this.db.exec('COMMIT'); return value; }
    catch { this.db.exec('ROLLBACK'); throw unavailable(); }
  }
  private hash(key: string) { return createHash('sha256').update(key).digest('hex'); }
  private read(key: string): Notice | undefined {
    const hash = this.hash(key), row = this.db.prepare('SELECT payload FROM encrypted_notices WHERE key_hash=?').get(hash) as any;
    if (!row) return undefined;
    const record = this.open(row.payload, hash);
    if (record?.key !== key || !['pending','sent','uncertain','retryable'].includes(record.state)) throw unavailable();
    return record;
  }
  private save(record: Notice) {
    const hash = this.hash(record.key);
    this.db.prepare('INSERT INTO encrypted_notices (key_hash,payload) VALUES (?,?) ON CONFLICT(key_hash) DO UPDATE SET payload=excluded.payload')
      .run(hash, this.seal(record, hash));
  }
  claimInteraction(id: string, now?: number) { return this.interactions.claimInteraction(id, now); }
  claim(key: string, channel: string, digest: string, now: number): 'new' | 'duplicate' | 'needs_review' | 'waiting' {
    return this.transaction(() => {
      const record = this.read(key);
      if (!record) { this.save({ key, channel, digest, state: 'pending', message: null, retry_at: 0 }); return 'new'; }
      if (record.channel !== channel || record.digest !== digest) return 'needs_review';
      if (record.state === 'sent') return 'duplicate';
      if (record.state !== 'retryable') return 'needs_review';
      if (now < record.retry_at) return 'waiting';
      record.state = 'pending'; this.save(record); return 'new';
    });
  }
  sent(key: string, message: string) {
    if (!/^\d{17,22}$/.test(message)) throw new BotError('invalid', 'Invalid message receipt.');
    this.transaction(() => {
      const record = this.read(key);
      if (!record || !['pending','uncertain'].includes(record.state)) throw unavailable();
      record.state = 'sent'; record.message = message; this.save(record);
    });
  }
  uncertain(key: string) { this.transaction(() => {
    const record = this.read(key);
    if (record?.state === 'pending') { record.state = 'uncertain'; this.save(record); }
  }); }
  retryable(key: string, at: number) { this.transaction(() => {
    const record = this.read(key);
    if (record?.state === 'pending') { record.state = 'retryable'; record.retry_at = at; this.save(record); }
  }); }
  list() {
    return this.db.prepare('SELECT key_hash,payload FROM encrypted_notices ORDER BY key_hash').all().map((row: any) => {
      const record = this.open(row.payload, row.key_hash) as Notice;
      if (this.hash(record.key) !== row.key_hash) throw unavailable();
      return { key: record.key, channel: record.channel, state: record.state, message: record.message };
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true; this.interactions.close(); this.db.close(); this.key.fill(0);
  }
}
