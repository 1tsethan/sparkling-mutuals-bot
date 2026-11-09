import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { BotError } from './profile.ts';

export interface ReceiptSql {
  exec(sql:string):void;
  all(sql:string,...values:(string|number|null)[]):any[];
  run(sql:string,...values:(string|number|null)[]):void;
  transaction<T>(work:()=>T):T;
}
export type ReceiptSnapshot={version:1;metadata:string;rows:{key_hash:string;payload:string}[]};
export const snapshotDigest=(s:ReceiptSnapshot)=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
type Notice = { key: string; channel: string; digest: string; state: 'pending' | 'sent' | 'uncertain' | 'retryable';
  message: string | null; retry_at: number };
const unavailable = () => new BotError('storage', 'Encrypted receipt storage is unavailable. Preserve the database and review the receipt key.');

export class EncryptedReceiptLedger {
  private db: ReceiptSql;
  private key: Buffer;
  constructor(db: ReceiptSql, key: Buffer) {
    if (key.length !== 32) throw unavailable();
    this.key = Buffer.from(key); this.db = db;
    try {
      if (this.db.all("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('notices','interactions')")[0])
        throw unavailable();
      this.db.exec('CREATE TABLE IF NOT EXISTS receipt_metadata (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL)');
      this.db.exec('CREATE TABLE IF NOT EXISTS encrypted_notices (key_hash TEXT PRIMARY KEY, payload TEXT NOT NULL)');
      this.transaction(() => {
        const existing = this.db.all('SELECT payload FROM receipt_metadata WHERE id=1')[0] as any;
        if (existing) {
          if (this.open(existing.payload, 'metadata')?.format !== 'SM receipts 1') throw unavailable();
        } else {
          if (this.db.all('SELECT key_hash FROM encrypted_notices LIMIT 1')[0]) throw unavailable();
          this.db.run('INSERT INTO receipt_metadata (id,payload) VALUES (1,?)', this.seal({ format: 'SM receipts 1' }, 'metadata'));
        }
      });
    } catch {
      this.key.fill(0); throw unavailable();
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
      const envelope = JSON.parse(payload);
      const decode = (value: unknown) => {
        if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw unavailable();
        return Buffer.from(value, 'base64');
      };
      const iv = decode(envelope.iv), tag = decode(envelope.tag);
      if (envelope.v !== 1 || iv.length !== 12 || tag.length !== 16 || typeof envelope.data !== 'string') throw unavailable();
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAAD(Buffer.from('sm-receipts-v1:' + context)); decipher.setAuthTag(tag);
      return JSON.parse(Buffer.concat([decipher.update(decode(envelope.data)), decipher.final()]).toString('utf8'));
    } catch { throw unavailable(); }
  }
  private transaction<T>(work: () => T): T {
    try { return this.db.transaction(work); } catch { throw unavailable(); }
  }
  private hash(key: string) { return createHash('sha256').update(key).digest('hex'); }
  private read(key: string): Notice | undefined {
    const hash = this.hash(key), row = this.db.all('SELECT payload FROM encrypted_notices WHERE key_hash=?', hash)[0] as any;
    if (!row) return undefined;
    const record = this.decodeRow({key_hash:hash,payload:row.payload});
    if (record?.key !== key || !['pending','sent','uncertain','retryable'].includes(record.state)) throw unavailable();
    return record;
  }
  private save(record: Notice) {
    const hash = this.hash(record.key);
    this.db.run('INSERT INTO encrypted_notices (key_hash,payload) VALUES (?,?) ON CONFLICT(key_hash) DO UPDATE SET payload=excluded.payload', hash, this.seal(record, hash));
  }
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
  retryable(key: string, at: number) {
    if (!Number.isFinite(at) || at < 0 || at > Number.MAX_SAFE_INTEGER) throw unavailable();
    this.transaction(() => {
    const record = this.read(key);
    if (record?.state === 'pending') { record.state = 'retryable'; record.retry_at = Math.ceil(at); this.save(record); }
  }); }
  list() {
    return this.db.all('SELECT key_hash,payload FROM encrypted_notices ORDER BY key_hash').map((row: any) => {
      const record = this.decodeRow(row);
      if (this.hash(record.key) !== row.key_hash) throw unavailable();
      return { key: record.key, channel: record.channel, state: record.state, message: record.message };
    });
  }
  exportSnapshot(): ReceiptSnapshot {
    return this.transaction(()=>this.exportSnapshotWithoutTransaction());
  }
  importSnapshot(input: unknown): {count:number;digest:string} {
    const s=input as ReceiptSnapshot;
    if(s?.version!==1 || !Array.isArray(s.rows) || s.rows.length>2000 || Buffer.byteLength(JSON.stringify(s))>2097152 ||
        this.open(s.metadata,'metadata')?.format!=='SM receipts 1') throw unavailable();
    let previous='';
    const rows=s.rows.map(row=>{
      this.decodeRow(row);
      if(row.key_hash<=previous) throw unavailable();previous=row.key_hash;
      return {key_hash:row.key_hash,payload:row.payload};
    });
    const snapshot:ReceiptSnapshot={version:1,metadata:s.metadata,rows},digest=snapshotDigest(snapshot);
    return this.transaction(()=>{
      const current=this.exportSnapshotWithoutTransaction();
      if(snapshotDigest(current)===digest) return {count:rows.length,digest};
      if(current.rows.length) throw unavailable();
      this.db.run('UPDATE receipt_metadata SET payload=? WHERE id=1',snapshot.metadata);
      for(const row of rows) this.db.run('INSERT INTO encrypted_notices (key_hash,payload) VALUES (?,?)',row.key_hash,row.payload);
      return {count:rows.length,digest};
    });
  }
  private exportSnapshotWithoutTransaction():ReceiptSnapshot {
    const metadata=this.db.all('SELECT payload FROM receipt_metadata WHERE id=1')[0]?.payload;
    if(this.open(metadata,'metadata')?.format!=='SM receipts 1') throw unavailable();
    const rows=this.db.all('SELECT key_hash,payload FROM encrypted_notices ORDER BY key_hash');
    rows.forEach(row=>this.decodeRow(row));
    return {version:1,metadata,rows};
  }
  private decodeRow(row:{key_hash:string;payload:string}):Notice {
    if(!/^[a-f0-9]{64}$/.test(row?.key_hash)) throw unavailable();
    const r=this.open(row.payload,row.key_hash);
    if(typeof r?.key!=='string' || !r.key.length || r.key.length>512 || this.hash(r.key)!==row.key_hash ||
      typeof r.channel!=='string' || !/^\d{17,22}$/.test(r.channel) || typeof r.digest!=='string' || !/^[a-f0-9]{64}$/.test(r.digest) ||
      !['pending','sent','uncertain','retryable'].includes(r.state) || typeof r.retry_at!=='number' || !Number.isFinite(r.retry_at) || r.retry_at<0 || r.retry_at>Number.MAX_SAFE_INTEGER ||
      (r.state==='sent' ? typeof r.message!=='string' || !/^\d{17,22}$/.test(r.message) : r.message!==null)) throw unavailable();
    return r;
  }
  close() {this.key.fill(0);}
}
