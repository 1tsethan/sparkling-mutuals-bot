import { BotError } from './profile.ts';
import { HttpError, requestJson, retryAt } from './http.ts';
import type { Message } from './commands.ts';
type Options = { token: string; applicationId: string; guildId: string; allowedChannels: string[]; fetcher?: typeof fetch };
export class DiscordClient {
  private token: string; private applicationId: string; private guildId: string;
  private allowed: Set<string>; private fetcher: typeof fetch;
  private pausedUntil = 0;
  constructor(options: Options) {
    this.token = options.token; this.applicationId = options.applicationId; this.guildId = options.guildId;
    this.allowed = new Set(options.allowedChannels); this.fetcher = options.fetcher ?? fetch;
  }
  private async request(path: string, method: string, body?: any, authorization = true): Promise<any> {
    if (Date.now() < this.pausedUntil) throw new BotError('rate_limit', 'Discord is temporarily busy.');
    try {
      const response = await requestJson('https://discord.com/api/v10' + path, this.fetcher, {
        method, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: 'Bot ' + this.token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      return response.data;
    } catch (error) {
      if (error instanceof HttpError && error.status === 429) this.pausedUntil = retryAt(error.headers, Date.now());
      if (error instanceof BotError) throw error;
      throw new BotError('discord', 'Discord request outcome is unknown.');
    }
  }
  async sendMessage(channelId: string, message: Message, nonce?: string): Promise<string> {
    if (!this.allowed.has(channelId)) throw new BotError('destination', 'Unapproved Discord destination.');
    const channel = await this.request('/channels/' + channelId, 'GET');
    if (channel.guild_id !== this.guildId || ![0, 5].includes(channel.type))
      throw new BotError('destination', 'Unapproved Discord destination.');
    const result = await this.request('/channels/' + channelId + '/messages', 'POST', {
      ...message, allowed_mentions: { parse: [] }, ...(nonce ? { nonce, enforce_nonce: true } : {})
    });
    if (!/^\d{17,22}$/.test(result?.id ?? '')) throw new BotError('discord', 'Discord request outcome is unknown.');
    return result.id;
  }
  async editResponse(token: string, message: Message): Promise<void> {
    await this.request('/webhooks/' + this.applicationId + '/' + encodeURIComponent(token) + '/messages/@original',
      'PATCH', { ...message, allowed_mentions: { parse: [] } }, false);
  }
}
