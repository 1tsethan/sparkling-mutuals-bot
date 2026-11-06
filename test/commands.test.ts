import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { parseProfile } from '../src/profile.ts';
const commands = await import('../src/commands.ts').catch(() => ({})) as any;
const app = await import('../src/app.ts').catch(() => ({})) as any;
const guild = '1567856303341051905', channel = '1568145030500057098';
const uuid = 'a'.repeat(32);
const result = { name: 'Example', uuid, fetchedAt: 1000000, card: parseProfile({
  success: true, profiles: [{ selected: true, profile_id: 'p', cute_name: 'Apple', members: {
    [uuid]: { safari: { tickets: { basic: 2 }, discovered_sparkling_critters: ['BLUEBIRD'], total_captured_sparkling_critters: 7 } }
  } }]
}, uuid) };
test('renders ticket balances and separate discovery/catch measures without mention pings', () => {
  assert.equal(typeof commands.renderCard, 'function');
  const tickets = commands.renderCard('tickets', result);
  assert.ok(tickets.embeds[0].fields.some((f: any) => f.name === 'Total' && f.value === '2'));
  const sparkle = commands.renderCard('sparkling', result);
  assert.ok(sparkle.embeds[0].fields.some((f: any) => f.name === 'Unique species' && f.value === '1 / 37'));
  assert.ok(sparkle.embeds[0].fields.some((f: any) => f.name === 'Total catches' && f.value === '7'));
  assert.deepEqual(sparkle.allowed_mentions, { parse: [] });
  assert.ok(sparkle.embeds[0].fields.some((f: any) => f.name.includes('Forest') && f.value.includes('Macaw')));
  assert.ok(JSON.stringify(commands.helpMessage).includes('https://discord.com/channels/' + guild + '/1567859199491186749'));
});
const keys = generateKeyPairSync('ed25519');
const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
function signed(value: any, seconds = '1000') {
  const body = Buffer.from(JSON.stringify(value));
  const signature = sign(null, Buffer.concat([Buffer.from(seconds), body]), keys.privateKey).toString('hex');
  return { body, headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': seconds } };
}
function setup() {
  assert.equal(typeof app.createApp, 'function', 'interaction endpoint must exist');
  const edits: any[] = [], sends: any[] = [], reads: any[] = [], seen = new Set();
  const handler = app.createApp({ applicationId: '123456789012345678', publicKey, commandChannelId: channel,
    guildId: guild, now: () => 1000000,
    lookup: { lookup: async (name: string) => { reads.push(name); return result; } },
    discord: { editResponse: async (...args: any[]) => { edits.push(args); },
      sendMessage: async (...args: any[]) => { sends.push(args); return '123456789012345679'; } },
    claimInteraction: (id: string) => { if (seen.has(id)) return false; seen.add(id); return true; },
    notify: async () => ({ status: 'disabled' })
  });
  return { handler, edits, sends, reads };
}
function interaction(extra = {}) {
  return { type: 2, application_id: '123456789012345678', id: '123456789012345670',
    guild_id: guild, channel_id: channel, token: 'test-interaction-token', member: { user: { id: '123456789012345671' } },
    data: { name: 'tickets', options: [{ name: 'player', type: 3, value: 'Example' }] }, ...extra };
}
test('rejects forged and stale signatures before any lookup or post', async () => {
  const s = setup(), request = signed(interaction());
  const forged = await s.handler('/interactions', { ...request.headers, 'x-signature-ed25519': '0'.repeat(128) }, request.body);
  assert.equal(forged.status, 401);
  const stale = signed(interaction(), '1');
  assert.equal((await s.handler('/interactions', stale.headers, stale.body)).status, 401);
  assert.equal(s.reads.length, 0); assert.equal(s.sends.length, 0);
});
test('valid signed ping works but wrong guild or channel never triggers a lookup', async () => {
  const s = setup(), ping = signed({ type: 1 });
  assert.deepEqual((await s.handler('/interactions', ping.headers, ping.body)).body, { type: 1 });
  for (const extra of [{ guild_id: '999999999999999999' }, { channel_id: '999999999999999998' }, { guild_id: undefined }]) {
    const r = signed(interaction(extra)); const response = await s.handler('/interactions', r.headers, r.body);
    assert.equal(response.body.data.flags, 64); assert.equal(response.after, undefined);
  }
  assert.equal(s.reads.length, 0);
});
test('defers privately before lookup, edits that response, and duplicate deliveries do no work', async () => {
  const s = setup(), r = signed(interaction());
  const response = await s.handler('/interactions', r.headers, r.body);
  assert.equal(response.body.type, 5); assert.equal(response.body.data.flags, 64); assert.equal(s.reads.length, 0);
  await response.after();
  assert.deepEqual(s.reads, ['Example']); assert.equal(s.edits.length, 1); assert.equal(s.sends.length, 0);
  const duplicate = await s.handler('/interactions', r.headers, r.body);
  assert.equal(duplicate.after, undefined);
});
test('explicit sharing sends only into the configured command channel while errors remain private', async () => {
  const s = setup(), r = signed(interaction({ data: { name: 'safari', options: [
    { name: 'player', type: 3, value: 'Example' }, { name: 'share', type: 5, value: true }
  ] } }));
  const response = await s.handler('/interactions', r.headers, r.body);
  assert.equal(response.body.data.flags, 64);
  await response.after();
  assert.equal(s.sends[0][0], channel);
  assert.deepEqual(s.sends[0][1].allowed_mentions, { parse: [] });
});
