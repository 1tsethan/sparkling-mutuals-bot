import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
const local = await import('../src/local.ts').catch(() => ({})) as any;
const token = 'fictional-local-test-token-1234567890';

test('local startup keeps secrets out of arguments and disables unapproved live features and disk receipts', async () => {
  assert.equal(typeof local.runLocalTrial, 'function');
  const calls: any[] = [];
  const original = { SM_STATS_ENABLED: 'true', SM_NOTIFICATIONS_ENABLED: 'true', SM_DATA_FILE: 'disk.sqlite' };
  await local.runLocalTrial(token, true, original, async (args: string[], env: any) => { calls.push({ args, env: { ...env }, source: env }); return 0; });
  assert.equal(calls.length, 2);
  assert.ok(calls[0].args.includes('tools/register.ts'));
  assert.ok(calls[1].args.includes('src/main.ts'));
  for (const c of calls) {
    assert.equal(c.env.SM_DISCORD_BOT_TOKEN, token);
    assert.equal(c.args.some((arg: string) => arg.includes(token)), false);
    assert.equal(c.env.SM_STATS_ENABLED, 'false');
    assert.equal(c.env.SM_NOTIFICATIONS_ENABLED, 'false');
    assert.equal(c.env.SM_DATA_FILE, ':memory:');
  }
  assert.equal(original.SM_STATS_ENABLED, 'true');
  assert.equal(calls[0].source.SM_DISCORD_BOT_TOKEN, '');
});

test('failed registration prevents the local service from starting', async () => {
  assert.equal(typeof local.runLocalTrial, 'function');
  let calls = 0, childEnv: any;
  await assert.rejects(local.runLocalTrial(token, true, {}, async (_args: string[], env: any) => { calls++; childEnv = env; return 1; }), /registration failed/i);
  assert.equal(calls, 1);
  assert.equal(childEnv.SM_DISCORD_BOT_TOKEN, '');
});

test('masked token input never writes the token and restores terminal mode after entry or cancellation', async () => {
  assert.equal(typeof local.readSecret, 'function');
  for (const cancelled of [false, true]) {
    const input = new PassThrough() as any, output = new PassThrough();
    let printed = '', raw = false;
    input.isTTY = true; input.isRaw = false; input.setRawMode = (value: boolean) => { raw = value; };
    output.on('data', data => { printed += data; });
    const pending = local.readSecret(input, output);
    input.write(cancelled ? '\u0003' : token + '\r');
    if (cancelled) await assert.rejects(pending, /cancelled/i);
    else assert.equal(await pending, token);
    assert.equal(raw, false);
    assert.equal(printed.includes(token), false);
    assert.equal(input.listenerCount('data'), 0);
  }
});
