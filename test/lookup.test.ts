import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../src/lookup.ts').catch(() => ({})) as any;
function service(options: any) {
  assert.equal(typeof mod.LookupService, 'function', 'lookup service must exist');
  return new mod.LookupService({ apiKey: 'test-fixture-key', ...options });
}
const uuid = 'a'.repeat(32);
const profile = { success: true, profiles: [{ profile_id: 'p', selected: true, members: { [uuid]: {} } }] };
const json = (value: any, status = 200, headers: any = {}) => new Response(JSON.stringify(value), { status, headers });
test('parallel commands share name/profile requests and cached derived cards expire at sixty seconds', async () => {
  let now = 0, names = 0, profiles = 0;
  const lookup = service({ now: () => now, fetcher: async (url: string, init: any) => {
    if (url.startsWith('https://api.mojang.com/')) { names++; return json({ id: uuid, name: 'Example' }); }
    profiles++;
    assert.equal(new Headers(init.headers).get('API-Key'), 'test-fixture-key');
    assert.equal(new URL(url).searchParams.get('uuid'), uuid);
    return json(profile);
  } });
  const [a, b] = await Promise.all([lookup.lookup('Example'), lookup.lookup('EXAMPLE')]);
  assert.equal(a.card.totalCaptured, 0);
  assert.deepEqual(a, b);
  assert.equal(names, 1); assert.equal(profiles, 1);
  now = 59999; await lookup.lookup('Example'); assert.equal(profiles, 1);
  now = 60000; await lookup.lookup('Example'); assert.equal(profiles, 2);
  assert.equal(names, 1);
});
test('rate limiting pauses the provider across different players and recovers without caching failures', async () => {
  let now = 0, calls = 0;
  const lookup = service({ now: () => now, fetcher: async (url: string) => {
    if (url.includes('mojang.com')) return json({ id: uuid, name: 'Example' });
    calls++;
    return calls === 1 ? json({}, 429, { 'Retry-After': '30' }) : json(profile);
  } });
  await assert.rejects(lookup.lookup('Example'), { code: 'rate_limit' });
  now = 29999; await assert.rejects(lookup.lookup('Other'), { code: 'rate_limit' }); assert.equal(calls, 1);
  now = 30000; assert.equal((await lookup.lookup('Example')).card.totalCaptured, 0); assert.equal(calls, 2);
});
test('invalid names and missing credentials never contact an upstream', async () => {
  let calls = 0;
  const lookup = service({ apiKey: '', fetcher: async () => { calls++; return json({}); } });
  await assert.rejects(lookup.lookup('../secrets'), { code: 'player' });
  await assert.rejects(lookup.lookup('Example'), { code: 'credentials' });
  assert.equal(calls, 0);
});
test('two simultaneous profile reads prevent a third from entering the upstream', async () => {
  let release!: () => void, entered = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const lookup = service({ fetcher: async (url: string) => {
    if (url.includes('mojang.com')) {
      const name = new URL(url).pathname.split('/').at(-1)!;
      return json({ id: name === 'A' ? 'a'.repeat(32) : name === 'B' ? 'b'.repeat(32) : 'c'.repeat(32), name });
    }
    entered++; await gate;
    const id = new URL(url).searchParams.get('uuid')!;
    return json({ success: true, profiles: [{ selected: true, profile_id: 'p', members: { [id]: {} } }] });
  } });
  const a = lookup.lookup('A'), b = lookup.lookup('B');
  for (let i = 0; i < 20 && entered < 2; i++) await new Promise(resolve => setImmediate(resolve));
  try { await assert.rejects(lookup.lookup('C'), { code: 'busy' }); assert.equal(entered, 2); }
  finally { release(); await Promise.all([a, b]); }
});
test('profile request budget is shared across users and opens at the minute boundary', async () => {
  let now = 0, calls = 0;
  const lookup = service({ now: () => now, perMinute: 2, fetcher: async (url: string) => {
    if (url.includes('mojang.com')) return json({ id: new URL(url).pathname.split('/').at(-1)!.toLowerCase().repeat(32), name: 'Player' });
    calls++;
    const id = new URL(url).searchParams.get('uuid')!;
    return json({ success: true, profiles: [{ selected: true, profile_id: 'p', members: { [id]: {} } }] });
  } });
  await lookup.lookup('A'); await lookup.lookup('B');
  await assert.rejects(lookup.lookup('C'), { code: 'rate_limit' });
  assert.equal(calls, 2);
  now = 60000; await lookup.lookup('C'); assert.equal(calls, 3);
});
test('Mojang retry window begins when a delayed 429 response arrives', async () => {
  let now = 0, calls = 0;
  const lookup = service({ now: () => now, fetcher: async (url: string) => {
    if (url.includes('mojang.com')) {
      calls++;
      if (calls === 1) { now = 9000; return json({}, 429, { 'Retry-After': '30' }); }
      return json({ id: uuid, name: 'Example' });
    }
    return json(profile);
  } });
  await assert.rejects(lookup.lookup('Example'), { code: 'rate_limit' });
  now = 30000; await assert.rejects(lookup.lookup('Other'), { code: 'rate_limit' }); assert.equal(calls, 1);
  now = 39000; await lookup.lookup('Example'); assert.equal(calls, 2);
});
test('an empty Mojang identity response is player-not-found rather than malformed statistics', async () => {
  const lookup = service({ fetcher: async () => new Response(null, { status: 204 }) });
  await assert.rejects(lookup.lookup('Missing'), { code: 'player' });
});
