import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../src/discord.ts').catch(() => ({})) as any;
test('Discord transport refuses a destination outside SM without creating a message', async () => {
  assert.equal(typeof mod.DiscordClient, 'function');
  const requests: any[] = [];
  const client = new mod.DiscordClient({ token: 'fixture-token', applicationId: '123456789012345678',
    guildId: '1567856303341051905', allowedChannels: ['1568145030500057098'],
    fetcher: async (url: string, init: any) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ id: '1568145030500057098', guild_id: '999999999999999999', type: 0 }));
    } });
  await assert.rejects(client.sendMessage('1568145030500057098', { content: 'test' }), /destination/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].init.method, 'GET');
  await assert.rejects(client.sendMessage('999999999999999998', { content: 'test' }), /destination/);
  assert.equal(requests.length, 1);
});
test('creates a constrained message with nonce enforcement and disables all pings', async () => {
  assert.equal(typeof mod.DiscordClient, 'function');
  let posted: any;
  const client = new mod.DiscordClient({ token: 'fixture-token', applicationId: '123456789012345678',
    guildId: '1567856303341051905', allowedChannels: ['1568145030500057098'],
    fetcher: async (url: string, init: any) => {
      if (init.method === 'GET') return new Response(JSON.stringify({ id: '1568145030500057098', guild_id: '1567856303341051905', type: 0 }));
      posted = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: '123456789012345679' }));
    } });
  assert.equal(await client.sendMessage('1568145030500057098', { content: '@everyone', allowed_mentions: { parse: ['everyone'] } }, 'abc'), '123456789012345679');
  assert.deepEqual(posted.allowed_mentions, { parse: [] });
  assert.equal(posted.nonce, 'abc'); assert.equal(posted.enforce_nonce, true);
});
