import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
const configs = await import('../src/config.ts').catch(() => ({})) as any;
const servers = await import('../src/server.ts').catch(() => ({})) as any;
const env = { SM_APPLICATION_ID: '123456789012345678', SM_PUBLIC_KEY: 'a'.repeat(64), SM_COMMAND_CHANNEL_ID: '123456789012345679' };
test('configuration defaults all live features off and rejects foreign guilds and missing enabled credentials', () => {
  assert.equal(typeof configs.loadConfig, 'function');
  const c = configs.loadConfig(env);
  assert.equal(c.statsEnabled, false); assert.equal(c.notificationsEnabled, false);
  assert.equal(c.host, '127.0.0.1'); assert.equal(c.guildId, '1567856303341051905');
  assert.throws(() => configs.loadConfig({ ...env, SM_GUILD_ID: '999999999999999999' }), /SM/);
  assert.throws(() => configs.loadConfig({ ...env, SM_STATS_ENABLED: 'true' }), /TOKEN|KEY/);
  assert.throws(() => configs.loadConfig({ ...env, SM_NOTIFICATIONS_ENABLED: 'true' }), /TOKEN|SECRET|BRANCH|CHANNEL/);
});
test('enabled notifications require encrypted persistent receipts and a valid key', () => {
  const feeds = { ...env, SM_DISCORD_BOT_TOKEN: 'fixture-token', SM_NOTIFICATIONS_ENABLED: 'true',
    SM_NOTIFICATION_SECRET: 's'.repeat(64), SM_DEVELOPMENT_BRANCH: 'master', SM_BETA_CHANNEL_ID: '1568234962619072532',
    SM_DATA_FILE: 'encrypted.sqlite' };
  assert.throws(() => configs.loadConfig(feeds), /RECEIPT_KEY/);
  assert.throws(() => configs.loadConfig({ ...feeds, SM_RECEIPT_KEY: 'bad' }), /RECEIPT_KEY/);
  assert.throws(() => configs.loadConfig({ ...feeds, SM_RECEIPT_KEY: 'a'.repeat(64), SM_DATA_FILE: ':memory:' }), /persistent|durable/i);
  assert.equal(configs.loadConfig({ ...feeds, SM_RECEIPT_KEY: 'a'.repeat(64) }).receiptKey, 'a'.repeat(64));
});

test('the HTTP request handler preserves signed raw bytes, rejects methods and limits request bodies', async () => {
  assert.equal(typeof servers.createRequestHandler, 'function');
  let calls = 0, completed = 0;
  const handle = servers.createRequestHandler(async (path: string, headers: any, raw: Buffer) => {
    calls++; assert.equal(path, '/interactions'); assert.equal(headers['x-test'], 'value');
    assert.equal(raw.toString('utf8'), '{"type":1}');
    return { status: 200, body: { type: 1 }, after: async () => { completed++; } };
  });
  async function request(method: string, url: string, body = '') {
    const req = Object.assign(Readable.from([Buffer.from(body)]), { method, url, headers: { 'x-test': 'value' } });
    let status = 0, json: any;
    const res = { writableEnded: false, setHeader() {}, writeHead(code: number) { status = code; },
      end(value: string) { this.writableEnded = true; json = JSON.parse(value); } };
    await handle(req, res);
    return { status, json };
  }
  assert.deepEqual((await request('POST', '/interactions', '{"type":1}')).json, { type: 1 });
  assert.equal(completed, 1);
  assert.equal((await request('GET', '/interactions')).status, 405);
  assert.equal((await request('GET', '/health')).status, 200);
  assert.equal((await request('POST', '/interactions', 'a'.repeat(65537))).status, 413);
  assert.equal(calls, 1);
});
