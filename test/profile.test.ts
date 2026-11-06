import test from 'node:test';
import assert from 'node:assert/strict';
const mod = await import('../src/profile.ts').catch(() => ({})) as any;
const parse = (...args: any[]) => mod.parseProfile?.(...args);
const uuid = 'a'.repeat(32);
function body(member: any) {
  return { success: true, profiles: [
    { profile_id: 'wrong', selected: false, members: { [uuid]: { safari: { tickets: { basic: 999 } } } } },
    { profile_id: 'chosen', cute_name: 'Apple', selected: true, members: { [uuid]: member } }
  ] };
}
test('reads only the requested member of the selected profile and separates unique catches from total', () => {
  const card = parse(body({ safari: {
    tickets: { basic: 120, economy: 45, premium: 12, first_class: 3 },
    discovered_sparkling_critters: ['BLUEBIRD', 'BLUEBIRD', 'MANTIS_SHRIMP'],
    total_captured_sparkling_critters: 67
  }, player_data: { experience: { SKILL_HUNTING: 50 } }, currencies: { essence: { SAFARI: { current: 85000 } } } }), uuid);
  assert.equal(card?.profileName, 'Apple');
  assert.deepEqual(card.tickets, { basic: 120, economy: 45, premium: 12, first_class: 3 });
  assert.equal(card.ticketTotal, 180);
  assert.deepEqual(card.caught, ['Bluebird', 'Mantis Shrimp']);
  assert.equal(card.totalCaptured, 67);
  assert.equal(card.huntingLevel, 1);
  assert.equal(card.essence, 85000);
  assert.equal(card.missing.Forest.includes('Bluebird'), false);
});
test('a valid new member has zero discoveries while absent optional statistics stay unknown', () => {
  const card = parse(body({}), uuid);
  assert.deepEqual(card?.caught, []);
  assert.equal(card.totalCaptured, 0);
  assert.equal(card.ticketTotal, null);
  assert.equal(card.essence, null);
  assert.equal(card.huntingLevel, null);
});
test('unavailable profiles and malformed counters do not become zeros', () => {
  for (const payload of [
    { success: true, profiles: null },
    body({ safari: 'bad' }),
    body({ safari: { discovered_sparkling_critters: [12] } }),
    body({ safari: { tickets: { basic: -1 } } }),
    body({ safari: { tickets: { basic: '12' } } }),
    body({ safari: { total_captured_sparkling_critters: 1.5 } }),
    body({ safari: { total_captured_sparkling_critters: Number.MAX_SAFE_INTEGER + 1 } })
  ]) assert.throws(() => parse(payload, uuid), /unavailable|Malformed/);
});
test('a supplied partial ticket object defaults omitted tiers to zero and known discoveries without total remain unknown', () => {
  const card = parse(body({ safari: { tickets: { economy: 2 }, discovered_sparkling_critters: ['WUMPA'] } }), uuid);
  assert.equal(card?.ticketTotal, 2);
  assert.equal(card.totalCaptured, null);
  assert.equal(card.missing.Icy.includes('Wumpa'), false);
});
test('explicit null ticket balances remain unknown and prevent a fabricated total', () => {
  const card = parse(body({ safari: { tickets: { basic: null, economy: 2 } } }), uuid);
  assert.equal(card.tickets.basic, null);
  assert.equal(card.tickets.premium, 0);
  assert.equal(card.ticketTotal, null);
});
test('preserves the supplied total even when it differs from discovery progress', () => {
  const card = parse(body({ safari: { discovered_sparkling_critters: ['BLUEBIRD', 'MACAW'], total_captured_sparkling_critters: 1 } }), uuid);
  assert.equal(card.totalCaptured, 1);
  assert.equal(card.caught.length, 2);
});
