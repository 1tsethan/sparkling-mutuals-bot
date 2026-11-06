import { createPublicKey, verify } from 'node:crypto';
import { BotError, ROSTER } from './profile.ts';
import { renderCard, helpMessage } from './commands.ts';
import type { Message } from './commands.ts';
import type { LookupResult } from './lookup.ts';
import { ExpiringMap } from './expiry.ts';
export type Reply = { status: number; body: any; after?: () => Promise<void> };
type Options = {
  applicationId: string; publicKey: string; commandChannelId: string; guildId: string;
  lookup: { lookup(name: string): Promise<LookupResult> };
  discord: { editResponse(token: string, message: Message): Promise<void>; sendMessage(channel: string, message: Message, nonce?: string): Promise<string> };
  claimInteraction: (id: string) => boolean;
  notify: (headers: Record<string, string>, body: Buffer) => Promise<any>;
  now?: () => number; log?: (code: string) => void;
};
const privateReply = (content: string): Reply => ({ status: 200, body: { type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } } });
export function createApp(options: Options) {
  const now = options.now ?? Date.now;
  const publicKey = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(options.publicKey, 'hex')]), format: 'der', type: 'spki' });
  const cooldowns = new ExpiringMap<number>(10000, 1000, now);
  const handle = async (path: string, headers: Record<string, string>, body: Buffer): Promise<Reply> => {
    if (body.length > 65536) return { status: 413, body: { error: 'Request too large' } };
    if (path === '/notifications') {
      try { return { status: 200, body: await options.notify(headers, body) }; }
      catch (error) {
        const code = error instanceof BotError ? error.code : 'unavailable';
        options.log?.(code);
        return { status: code === 'auth' ? 401 : code === 'invalid' ? 400 : 503, body: { error: code } };
      }
    }
    if (path !== '/interactions') return { status: 404, body: { error: 'Not found' } };
    const stamp = headers['x-signature-timestamp'] ?? '', signature = headers['x-signature-ed25519'] ?? '';
    let valid = false;
    if (/^\d{1,12}$/.test(stamp) && /^[a-f0-9]{128}$/i.test(signature) && Math.abs(now() - Number(stamp) * 1000) <= 300000) {
      try { valid = verify(null, Buffer.concat([Buffer.from(stamp), body]), publicKey, Buffer.from(signature, 'hex')); } catch {}
    }
    if (!valid) return { status: 401, body: { error: 'Invalid signature' } };
    let interaction: any;
    try { interaction = JSON.parse(body.toString('utf8')); } catch { return { status: 400, body: { error: 'Invalid JSON' } }; }
    if (interaction?.type === 1) return { status: 200, body: { type: 1 } };
    if (interaction?.type !== 2 || interaction.application_id !== options.applicationId)
      return privateReply('This interaction is not supported.');
    if (interaction.guild_id !== options.guildId || interaction.channel_id !== options.commandChannelId)
      return privateReply('Use this command in the SM bot-commands channel.');
    const name = interaction.data?.name;
    if (name === 'help') return { status: 200, body: { type: 4, data: { ...helpMessage, flags: 64 } } };
    if (!['tickets', 'sparkling', 'safari'].includes(name)) return privateReply('Unknown SM command.');
    const user = interaction.member?.user?.id;
    if (!/^\d{17,22}$/.test(user ?? '') || !/^\d{17,22}$/.test(interaction.id ?? '') ||
        typeof interaction.token !== 'string' || interaction.token.length > 300)
      return privateReply('Invalid command request.');
    const values = interaction.data?.options;
    if (!Array.isArray(values) || values.some((v: any) => !v || !['player', 'share', 'biome'].includes(v.name)) ||
        new Set(values.map((v: any) => v.name)).size !== values.length)
      return privateReply('Invalid command options.');
    const player = values.find((v: any) => v.name === 'player');
    const share = values.find((v: any) => v.name === 'share');
    const biome = values.find((v: any) => v.name === 'biome');
    if (player?.type !== 3 || typeof player.value !== 'string' || !/^[A-Za-z0-9_]{1,16}$/.test(player.value) ||
        (share && (share.type !== 5 || typeof share.value !== 'boolean')) ||
        (biome && (name !== 'sparkling' || biome.type !== 3 || !Object.hasOwn(ROSTER, biome.value))))
      return privateReply('Enter a valid Minecraft username and command options.');
    if (!options.claimInteraction(interaction.id)) return privateReply('This command was already received.');
    if (cooldowns.has(user)) return privateReply('Please wait a few seconds before another lookup.');
    if (cooldowns.size >= 1000) return privateReply('The bot is busy. Please try again shortly.');
    cooldowns.set(user, now());
    let started = false;
    return { status: 200, body: { type: 5, data: { flags: 64 } }, after: async () => {
      if (started) return;
      started = true;
      try {
        const result = await options.lookup.lookup(player.value);
        const message = renderCard(name, result, biome?.value);
        if (share?.value === true) {
          await options.discord.sendMessage(options.commandChannelId, message, interaction.id);
          await options.discord.editResponse(interaction.token, { content: 'Shared your Safari result in this channel.' });
        } else await options.discord.editResponse(interaction.token, message);
      } catch (error) {
        const code = error instanceof BotError ? error.code : 'unavailable';
        options.log?.(code);
        const content = error instanceof BotError ? error.message : 'Stats are temporarily unavailable. Please try again shortly.';
        try { await options.discord.editResponse(interaction.token, { content }); }
        catch { options.log?.('discord_response_failed'); }
      }
    } };
  };
  return Object.assign(handle, { close: () => cooldowns.close() });
}
