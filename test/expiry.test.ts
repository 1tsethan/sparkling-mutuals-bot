import test from 'node:test';
import assert from 'node:assert/strict';
import { ReceiptStore } from '../src/store.ts';
const mod = await import('../src/expiry.ts').catch(() => ({})) as any;
test('idle cache entries physically expire and replacing an entry cancels its old expiry', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  assert.equal(typeof mod.ExpiringMap, 'function');
  const cache = new mod.ExpiringMap(60000, 2);
  try {
    cache.set('profile', { value: 1 });
    t.mock.timers.tick(30000); cache.set('profile', { value: 2 });
    t.mock.timers.tick(30000); assert.deepEqual(cache.get('profile'), { value: 2 });
    t.mock.timers.tick(30000); assert.equal(cache.size, 0);
    cache.set('a', 1); cache.set('b', 2); cache.set('c', 3);
    assert.equal(cache.get('a'), undefined); assert.equal(cache.size, 2);
    cache.close(); assert.equal(cache.size, 0);
  } finally { cache.close(); }
});
test('idle SQLite interaction receipts are purged on their deadline without another request', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const store = new ReceiptStore(':memory:');
  try {
    assert.equal(store.claimInteraction('123456789012345678'), true);
    t.mock.timers.tick(900000);
    const rows = (store as any).db.prepare('SELECT count(*) AS n FROM interactions').get();
    assert.equal(rows.n, 0);
  } finally { store.close(); }
});
