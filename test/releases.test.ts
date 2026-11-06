import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
const releases = await import('../src/releases.ts').catch(() => ({})) as any;
const stores = await import('../src/store.ts').catch(() => ({})) as any;
const repo = 'johnceoskyblock/sparkling-mutuals', sha = 'a'.repeat(40), secret = 's'.repeat(32);
const channels = { stable: '1568145030500057098', beta: '123456789012345681', action: '1568145100683485184' };
const targets = ['26.1.2', '26.2', '26.3'];
function removeTestDirectory(dir: string) {
  const target = resolve(dir);
  assert.equal(dirname(target).toLowerCase(), resolve(tmpdir()).toLowerCase());
  assert.match(basename(target), /^sm-bot-(receipts|interactions)-/);
  rmSync(target, { recursive: true, force: true });
}
function signBody(body: Buffer, stamp = '1000') {
  return { 'x-sm-timestamp': stamp, 'x-sm-signature': 'sha256=' + createHmac('sha256', secret).update(stamp + '.').update(body).digest('hex') };
}
function fixture(kind = 'release', beta = false) {
  const tag = beta ? 'v4.3.0-beta.1' : 'v4.3.0';
  const run = { id: 10, path: '.github/workflows/' + (kind === 'action' ? 'build' : 'release') + '.yml',
    status: 'completed', conclusion: 'success', event: 'push', head_branch: kind === 'action' ? 'master' : tag,
    head_sha: sha, repository: { full_name: repo, id: 100 }, head_repository: { full_name: repo, id: 100 } };
  const release = { id: 20, tag_name: tag, target_commitish: sha, draft: false, prerelease: beta,
    published_at: '2026-11-01T00:00:00Z', body: 'Changes @everyone\nBug fixes',
    assets: targets.map((mc, i) => ({ id: 30 + i, name: 'sparkling-mutuals-' + tag.slice(1) + '+mc' + mc + '.jar',
      size: 100, digest: 'sha256:' + 'b'.repeat(64), state: 'uploaded' })) };
  const artifacts = { artifacts: targets.map((mc, i) => ({ id: 40 + i, name: 'jar-mc' + mc,
    size_in_bytes: 100, expired: false, expires_at: '2027-02-01T00:00:00Z',
    workflow_run: { id: 10, head_sha: sha, repository_id: 100, head_repository_id: 100 } })) };
  return { tag, run, release, artifacts };
}
function setup(f = fixture(), file = ':memory:', sender?: (...args: any[]) => Promise<string>) {
  assert.equal(typeof stores.ReceiptStore, 'function', 'durable receipt storage must exist');
  assert.equal(typeof releases.ReleaseNotifier, 'function', 'release verifier must exist');
  const store = new stores.ReceiptStore(file), posts: any[] = [], reads: string[] = [];
  const notifier = new releases.ReleaseNotifier({ secret, developmentBranch: 'master', channels, store,
    now: () => 1000000, fetcher: async (url: string) => {
      reads.push(url);
      let body: any;
      if (url.endsWith('/actions/runs/10/artifacts?per_page=100')) body = f.artifacts;
      else if (url.endsWith('/actions/runs/10')) body = f.run;
      else if (url.includes('/releases/tags/')) body = f.release;
      else if (url.includes('/git/ref/tags/')) body = { object: { type: 'commit', sha } };
      else throw new Error('Unexpected GitHub request: ' + url);
      return new Response(JSON.stringify(body));
    }, discord: { sendMessage: async (...args: any[]) => {
      posts.push(args); return sender ? sender(...args) : '123456789012345690';
    } } });
  async function notify(kind = 'release', overrides = {}) {
    const body = Buffer.from(JSON.stringify({ kind, runId: '10', repository: repo, ...overrides }));
    return notifier.notify(signBody(body), body);
  }
  return { store, posts, reads, notifier, notify };
}
test('signed stable release routes one complete announcement with all targets and no mentions', async () => {
  const s = setup();
  try {
    assert.equal((await s.notify()).status, 'sent');
    assert.equal(s.posts.length, 1); assert.equal(s.posts[0][0], channels.stable);
    assert.deepEqual(s.posts[0][1].allowed_mentions, { parse: [] });
    const serialized = JSON.stringify(s.posts[0][1]);
    targets.forEach(mc => assert.ok(serialized.includes(mc)));
    assert.equal((await s.notify()).status, 'duplicate');
    assert.equal(s.posts.length, 1);
  } finally { s.store.close(); }
});
test('beta flag and beta tag must agree and valid beta uses its own channel', async () => {
  const s = setup(fixture('release', true));
  try {
    await s.notify(); assert.equal(s.posts[0][0], channels.beta);
    assert.ok(s.posts[0][1].embeds[0].fields.some((f: any) => f.name === 'Known issues' && f.value.includes('Not supplied')));
    assert.ok(JSON.stringify(s.posts[0][1]).includes('https://discord.com/channels/1567856303341051905/1567860529777610822'));
  }
  finally { s.store.close(); }
  const f = fixture('release', true); f.release.prerelease = false;
  const bad = setup(f);
  try { await assert.rejects(bad.notify(), { code: 'invalid' }); assert.equal(bad.posts.length, 0); }
  finally { bad.store.close(); }
});
test('beta known issues remain visible independently of a long release-note summary', async () => {
  const f = fixture('release', true);
  f.release.body = 'Changes\n' + 'Long notes. '.repeat(200) + '\n## Known issues\nSettings may reset.\n## Installation\nInstall normally.';
  const s = setup(f);
  try {
    await s.notify();
    const known = s.posts[0][1].embeds[0].fields.find((f: any) => f.name === 'Known issues');
    assert.ok(known?.value.includes('Settings may reset.'));
    assert.equal(known.value.includes('Install normally'), false);
  } finally { s.store.close(); }
});
test('failed, PR, fork and foreign-repository notifications cannot post', async () => {
  for (const change of [
    { conclusion: 'failure' }, { event: 'pull_request' },
    { head_repository: { full_name: 'someone/fork', id: 101 } },
    { repository: { full_name: 'someone/fork', id: 101 } }
  ]) {
    const f = fixture(); Object.assign(f.run, change);
    const s = setup(f);
    try { await assert.rejects(s.notify(), { code: 'invalid' }); assert.equal(s.posts.length, 0); }
    finally { s.store.close(); }
  }
  const s = setup();
  try { await assert.rejects(s.notify('release', { repository: 'someone/fork' }), { code: 'invalid' }); assert.equal(s.reads.length, 0); }
  finally { s.store.close(); }
});
test('action builds require all target artifacts, valid expiry and the approved branch', async () => {
  const s = setup(fixture('action'));
  try { await s.notify('action'); assert.equal(s.posts[0][0], channels.action); assert.ok(JSON.stringify(s.posts[0][1]).includes('GitHub login')); }
  finally { s.store.close(); }
  for (const mutate of [
    (f: any) => f.artifacts.artifacts.pop(),
    (f: any) => { f.artifacts.artifacts[0].expired = true; },
    (f: any) => { f.run.head_branch = 'feature'; }
  ]) {
    const f = fixture('action'); mutate(f);
    const bad = setup(f);
    try { await assert.rejects(bad.notify('action'), { code: 'invalid' }); assert.equal(bad.posts.length, 0); }
    finally { bad.store.close(); }
  }
});
test('forged or stale signed notifications make no GitHub request', async () => {
  const s = setup(), body = Buffer.from(JSON.stringify({ kind: 'release', runId: '10', repository: repo }));
  try {
    await assert.rejects(s.notifier.notify({ ...signBody(body), 'x-sm-signature': 'sha256=' + '0'.repeat(64) }, body), { code: 'auth' });
    await assert.rejects(s.notifier.notify(signBody(body, '1'), body), { code: 'auth' });
    assert.equal(s.reads.length, 0);
  } finally { s.store.close(); }
});
test('unknown send outcome persists over restart and cannot blindly resend', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sm-bot-receipts-')), file = join(dir, 'receipts.sqlite');
  const first = setup(fixture(), file, async () => { throw new Error('network lost after send'); });
  try {
    await assert.rejects(first.notify(), { code: 'uncertain' });
    assert.equal(first.posts.length, 1); first.store.close();
    const second = setup(fixture(), file);
    try { assert.equal((await second.notify()).status, 'needs_review'); assert.equal(second.posts.length, 0); }
    finally { second.store.close(); }
  } finally { try { first.store.close(); } catch {} removeTestDirectory(dir); }
});
test('interaction duplicate receipts expire and survive reopening the durable store', () => {
  assert.equal(typeof stores.ReceiptStore, 'function');
  const dir = mkdtempSync(join(tmpdir(), 'sm-bot-interactions-')), file = join(dir, 'receipts.sqlite');
  try {
    let now = 1000;
    let store = new stores.ReceiptStore(file, () => now);
    assert.equal(store.claimInteraction('123456789012345678'), true); store.close();
    now = 1001;
    store = new stores.ReceiptStore(file, () => now);
    try {
      assert.equal(store.claimInteraction('123456789012345678'), false);
      now = 901000;
      assert.equal(store.claimInteraction('123456789012345678'), true);
    } finally { store.close(); }
  } finally { removeTestDirectory(dir); }
});
