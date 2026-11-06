// Bounded TTL storage with physical deletion even when no requests arrive.
export class ExpiringMap<T> {
  private entries = new Map<string, { value: T; until: number; timer: ReturnType<typeof setTimeout> }>();
  private ttl: number; private capacity: number; private now: () => number;
  constructor(ttl: number, capacity: number, now: () => number = Date.now) {
    this.ttl = ttl; this.capacity = capacity; this.now = now;
  }
  get size() { return this.entries.size; }
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.until <= this.now()) { this.delete(key); return undefined; }
    return entry.value;
  }
  has(key: string) { return this.get(key) !== undefined; }
  set(key: string, value: T) {
    this.delete(key);
    if (this.entries.size >= this.capacity) this.delete(this.entries.keys().next().value!);
    const entry = { value, until: this.now() + this.ttl, timer: undefined as unknown as ReturnType<typeof setTimeout> };
    entry.timer = setTimeout(() => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
    }, this.ttl);
    entry.timer.unref?.();
    this.entries.set(key, entry);
  }
  delete(key: string) {
    const entry = this.entries.get(key);
    if (entry) clearTimeout(entry.timer);
    this.entries.delete(key);
  }
  close() { for (const key of this.entries.keys()) this.delete(key); }
}
