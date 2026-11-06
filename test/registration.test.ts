import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const privateFixture = 'fictional-private-token-do-not-print-12345';
function runRegistration(fetchBody: string) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', `
    process.env.SM_APPLICATION_ID = '1568203972978679888';
    process.env.SM_GUILD_ID = '1567856303341051905';
    process.env.SM_DISCORD_BOT_TOKEN = '${privateFixture}';
    process.argv.push('--apply');
    globalThis.fetch = async (url, options) => { ${fetchBody} };
    await import('./tools/register.ts');
  `], { cwd: root, encoding: 'utf8' });
}

test('registration reports HTTP failure categories without leaking private response content', () => {
  for (const [status, hint] of [[400, /command data/i], [401, /token.*reject/i],
    [403, /access/i], [404, /application.*server/i], [429, /wait/i], [503, /unavailable/i]] as const) {
    const result = runRegistration(`return new Response('${privateFixture}', { status: ${status} });`);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp('HTTP ' + status));
    assert.match(result.stderr, hint);
    assert.equal((result.stdout + result.stderr).includes(privateFixture), false);
  }
});

test('registration sanitizes transport and malformed success errors', () => {
  for (const fetchBody of [`throw new Error('${privateFixture}');`,
    `return new Response('${privateFixture}', { status: 200 });`]) {
    const result = runRegistration(fetchBody);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /connection|response/i);
    assert.equal((result.stdout + result.stderr).includes(privateFixture), false);
    assert.doesNotMatch(result.stderr, /at file:|at async/);
  }
});

test('registration sends the four commands only to the SM guild and reports success', () => {
  const result = runRegistration(`
    if (url !== 'https://discord.com/api/v10/applications/1568203972978679888/guilds/1567856303341051905/commands'
      || options.method !== 'PUT' || options.headers.Authorization !== 'Bot ${privateFixture}'
      || JSON.parse(options.body).length !== 4) throw new Error('Unexpected request');
    return Response.json([{id:'1'}, {id:'2'}, {id:'3'}, {id:'4'}]);
  `);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Registered 4 guild commands in SM/);
  assert.equal((result.stdout + result.stderr).includes(privateFixture), false);
});
