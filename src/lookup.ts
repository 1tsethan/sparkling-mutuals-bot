import { BotError, parseProfile } from './profile.ts';
import type { SafariCard } from './profile.ts';
import { getJson, HttpError, retryAt } from './http.ts';
import { ExpiringMap } from './expiry.ts';
export type LookupResult = { uuid: string; name: string; fetchedAt: number; card: SafariCard };
type Options = { apiKey: string; fetcher?: typeof fetch; now?: () => number; perMinute?: number };
export class LookupService {
  private apiKey: string; private fetcher: typeof fetch; private now: () => number; private perMinute: number;
  private names: ExpiringMap<{ uuid: string; name: string }>;
  private cards: ExpiringMap<LookupResult>;
  private nameJobs = new Map<string, Promise<{ uuid: string; name: string }>>();
  private cardJobs = new Map<string, Promise<LookupResult>>();
  private requests: number[] = []; private nameRequests: number[] = [];
  private active = 0; private pausedUntil = 0; private namePausedUntil = 0;
  private remaining = Infinity; private resetsAt = 0;
  constructor(options: Options) {
    this.apiKey = options.apiKey; this.fetcher = options.fetcher ?? fetch;
    this.now = options.now ?? Date.now; this.perMinute = options.perMinute ?? 20;
    this.names = new ExpiringMap(3600000, 1000, this.now);
    this.cards = new ExpiringMap(60000, 1000, this.now);
    if (!Number.isInteger(this.perMinute) || this.perMinute < 1 || this.perMinute > 20)
      throw new Error('Profile budget must be between 1 and 20 per minute.');
  }
  close() { this.names.close(); this.cards.close(); }
  private resolve(name: string): Promise<{ uuid: string; name: string }> {
    const key = name.toLowerCase();
    const cached = this.names.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = this.nameJobs.get(key);
    if (pending) return pending;
    const task = (async () => {
      const now = this.now();
      this.nameRequests = this.nameRequests.filter(at => at > now - 60000);
      if (now < this.namePausedUntil || this.nameRequests.length >= 20)
        throw new BotError('rate_limit', 'Player lookups are busy. Please try again shortly.');
      this.nameRequests.push(now);
      try {
        const { data } = await getJson('https://api.mojang.com/users/profiles/minecraft/' + encodeURIComponent(name), this.fetcher);
        if (!/^[0-9a-f]{32}$/i.test(data?.id ?? '') || !/^[A-Za-z0-9_]{1,16}$/.test(data?.name ?? ''))
          throw new BotError('malformed', 'Malformed player identity.');
        const result = { uuid: data.id.toLowerCase(), name: data.name };
        this.names.set(key, result);
        return result;
      } catch (error) {
        if (error instanceof HttpError && [204, 404].includes(error.status))
          throw new BotError('player', 'Minecraft player not found. Check the spelling.');
        if (error instanceof HttpError && error.status === 429) {
          this.namePausedUntil = retryAt(error.headers, this.now());
          throw new BotError('rate_limit', 'Player lookups are busy. Please try again shortly.');
        }
        throw error;
      }
    })().finally(() => this.nameJobs.delete(key));
    this.nameJobs.set(key, task); return task;
  }
  async lookup(name: string): Promise<LookupResult> {
    if (!/^[A-Za-z0-9_]{1,16}$/.test(name)) throw new BotError('player', 'Enter a valid Minecraft player name.');
    if (!this.apiKey) throw new BotError('credentials', 'Stats are temporarily unavailable.');
    if (this.now() < this.pausedUntil) throw new BotError('rate_limit', 'The API is busy. Please try again shortly.');
    const identity = await this.resolve(name);
    const cached = this.cards.get(identity.uuid);
    if (cached) return cached;
    const pending = this.cardJobs.get(identity.uuid);
    if (pending) return pending;
    const task = this.load(identity).finally(() => this.cardJobs.delete(identity.uuid));
    this.cardJobs.set(identity.uuid, task); return task;
  }
  private async load(identity: { uuid: string; name: string }): Promise<LookupResult> {
    const now = this.now();
    if (this.active >= 2) throw new BotError('busy', 'The bot is handling other lookups. Please try again shortly.');
    this.requests = this.requests.filter(at => at > now - 60000);
    if (now >= this.resetsAt) this.remaining = Infinity;
    if (now < this.pausedUntil || this.requests.length >= this.perMinute || this.remaining <= 0)
      throw new BotError('rate_limit', 'The API is busy. Please try again shortly.');
    this.requests.push(now); this.remaining--; this.active++;
    try {
      const { data, headers } = await getJson('https://api.hypixel.net/v2/skyblock/profiles?uuid=' + identity.uuid,
        this.fetcher, { 'API-Key': this.apiKey });
      const remaining = Number(headers.get('ratelimit-remaining'));
      const reset = Number(headers.get('ratelimit-reset'));
      if (headers.has('ratelimit-remaining') && Number.isFinite(remaining) && remaining >= 0) {
        this.remaining = Math.min(this.remaining, remaining);
        this.resetsAt = this.now() + (Number.isFinite(reset) && reset > 0 ? reset * 1000 : 60000);
      }
      const result = { ...identity, fetchedAt: this.now(), card: parseProfile(data, identity.uuid) };
      this.cards.set(identity.uuid, result);
      return result;
    } catch (error) {
      if (error instanceof HttpError && error.status === 429) {
        this.pausedUntil = retryAt(error.headers, this.now());
        throw new BotError('rate_limit', 'The API is busy. Please try again shortly.');
      }
      if (error instanceof HttpError && [401, 403].includes(error.status))
        throw new BotError('credentials', 'Stats are temporarily unavailable. Please contact the SM operators.');
      throw error;
    } finally { this.active--; }
  }
}
