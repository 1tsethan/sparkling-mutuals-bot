import { DatabaseSync } from 'node:sqlite';
import { BotError } from './profile.ts';
export interface ReceiptStorage {
  claimInteraction(id: string, now?: number): boolean;
  claim(key: string, channel: string, digest: string, now: number): 'new' | 'duplicate' | 'needs_review' | 'waiting';
  sent(key: string, message: string): void;
  uncertain(key: string): void;
  retryable(key: string, at: number): void;
  list(): any[];
  close(): void;
}
export class ReceiptStore {
  private db: DatabaseSync;
  private now: () => number;
  private cleanupTimer?: ReturnType<typeof setTimeout>;
  constructor(file: string, now: () => number = Date.now) {
    this.now = now;
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS notices (key TEXT PRIMARY KEY, channel TEXT NOT NULL, digest TEXT NOT NULL, state TEXT NOT NULL, message TEXT, retry_at INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS interactions (id TEXT PRIMARY KEY, expires INTEGER NOT NULL);");
    this.sweepInteractions();
  }
  private sweepInteractions() {
    if (this.cleanupTimer) clearTimeout(this.cleanupTimer);
    this.cleanupTimer = undefined;
    this.db.prepare('DELETE FROM interactions WHERE expires <= ?').run(this.now());
    const row = this.db.prepare('SELECT MIN(expires) AS next FROM interactions').get() as any;
    if (row.next !== null) {
      this.cleanupTimer = setTimeout(() => this.sweepInteractions(), Math.max(1, row.next - this.now()));
      this.cleanupTimer.unref?.();
    }
  }
  claimInteraction(id: string, now = this.now()): boolean {
    this.db.prepare('DELETE FROM interactions WHERE expires <= ?').run(now);
    const count = this.db.prepare('SELECT count(*) AS count FROM interactions').get() as any;
    if (count.count >= 10000) return false;
    const inserted = this.db.prepare('INSERT OR IGNORE INTO interactions (id, expires) VALUES (?, ?)').run(id, now + 900000).changes === 1;
    this.sweepInteractions();
    return inserted;
  }
  claim(key: string, channel: string, digest: string, now: number): 'new' | 'duplicate' | 'needs_review' | 'waiting' {
    const inserted = this.db.prepare("INSERT OR IGNORE INTO notices (key, channel, digest, state) VALUES (?, ?, ?, 'pending')").run(key, channel, digest);
    if (inserted.changes === 1) return 'new';
    const row = this.db.prepare('SELECT * FROM notices WHERE key = ?').get(key) as any;
    if (row.channel !== channel || row.digest !== digest) return 'needs_review';
    if (row.state === 'sent') return 'duplicate';
    if (row.state === 'retryable') {
      if (now < row.retry_at) return 'waiting';
      const result = this.db.prepare("UPDATE notices SET state = 'pending' WHERE key = ? AND state = 'retryable'").run(key);
      return result.changes === 1 ? 'new' : 'needs_review';
    }
    return 'needs_review';
  }
  sent(key: string, message: string) {
    if (!/^\d{17,22}$/.test(message)) throw new BotError('invalid', 'Invalid message receipt.');
    const result = this.db.prepare("UPDATE notices SET state = 'sent', message = ? WHERE key = ? AND state IN ('pending', 'uncertain')").run(message, key);
    if (result.changes !== 1) throw new BotError('uncertain', 'Notification receipt needs operator review.');
  }
  uncertain(key: string) { this.db.prepare("UPDATE notices SET state = 'uncertain' WHERE key = ? AND state = 'pending'").run(key); }
  retryable(key: string, at: number) { this.db.prepare("UPDATE notices SET state = 'retryable', retry_at = ? WHERE key = ? AND state = 'pending'").run(at, key); }
  list() { return this.db.prepare('SELECT key, channel, state, message FROM notices ORDER BY key').all(); }
  close() { if (this.cleanupTimer) clearTimeout(this.cleanupTimer); this.db.close(); }
}
