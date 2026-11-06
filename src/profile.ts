export class BotError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}
export const TIERS = ['basic', 'economy', 'premium', 'first_class'] as const;
// Species/biomes from SM f2cccafc33f0b7a391a8531189e12a0214303660, SafariRoster.kt.
// That roster credits CritterMod v0.9.0 cdfcb8effb4b3158df50f0c0960c11e536931840.
export const ROSTER: Record<string, string[]> = {
  Forest: 'Foxtrot,Bluebird,Honeybug,Treefrog,Woodchucker,Fluffling,Hideonfloor,Parakeet,Macaw'.split(','),
  Cavern: 'Cavernfish,Flitter,Shyworm,Driftling,Chuckwalla,Rockmite,Scrappy,Snoozle,Gemzie'.split(','),
  Icy: 'Strongarm,Tepid,Polaris,Shuddersquid,Billygoat,Mantis Shrimp,Nozzlenose,Troodon,Wumpa'.split(','),
  Haunted: 'Areita,Bloodbat,Duplico,Gazer,Litterbug,Solsnatcher,Gimmiegold,Hideonwall,Hideyho,Doomspiral'.split(',')
};
type Obj = Record<string, any>;
function object(value: unknown): value is Obj {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function optionalObject(value: unknown): Obj | undefined {
  if (value == null) return undefined;
  if (!object(value)) throw new BotError('malformed', 'Malformed API data.');
  return value;
}
function count(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new BotError('malformed', 'Malformed API counter.');
  return value;
}
function key(value: string): string { return value.toUpperCase().replaceAll(' ', '_'); }
function levelFromXp(xp: unknown): number | null {
  if (xp == null) return null;
  if (typeof xp !== 'number' || !Number.isFinite(xp) || xp < 0 || xp > Number.MAX_SAFE_INTEGER)
    throw new BotError('malformed', 'Malformed Hunting XP.');
  const levels = [50,125,200,300,500,750,1000,1500,2000,3500,5000,7500,10000,15000,20000,30000,50000,75000,100000,200000,300000,400000,500000,600000,700000,800000,900000,1000000,1100000,1200000,1300000,1400000,1500000,1600000,1700000,1800000,1900000,2000000,2100000,2200000,2300000,2400000,2500000,2600000,2750000,2900000,3100000,3400000,3700000,4000000,4300000,4600000,4900000,5200000,5500000,5800000,6100000,6400000,6700000,7000000];
  let remaining = xp, level = 0;
  for (const cost of levels) {
    if (remaining < cost) return level + remaining / cost;
    remaining -= cost; level++;
  }
  let slope = 600000, cost = 7000000 + slope;
  while (remaining >= cost) {
    remaining -= cost; level++;
    if (level % 10 === 0) slope *= 2;
    cost += slope;
  }
  return level + remaining / cost;
}
export type SafariCard = {
  profileId: string; profileName: string;
  tickets: Record<string, number | null> | null; ticketTotal: number | null;
  caught: string[]; missing: Record<string, string[]>; unknownSpecies: string[];
  totalCaptured: number | null; huntingLevel: number | null; essence: number | null;
};
export function parseProfile(payload: unknown, uuid: string): SafariCard {
  const id = uuid.replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id) || !object(payload) || payload.success !== true || !Array.isArray(payload.profiles))
    throw new BotError('unavailable', 'SkyBlock profile unavailable.');
  const selected = payload.profiles.filter((p: any) => object(p) && p.selected === true);
  if (selected.length !== 1 || typeof selected[0].profile_id !== 'string' ||
      !object(selected[0].members) || !object(selected[0].members[id]))
    throw new BotError('unavailable', 'Selected SkyBlock profile unavailable.');
  const profile = selected[0], member = profile.members[id];
  const safari = optionalObject(member.safari);
  const discoveries = safari?.discovered_sparkling_critters ?? [];
  if (!Array.isArray(discoveries) || discoveries.some(x => typeof x !== 'string' || x.length > 100))
    throw new BotError('malformed', 'Malformed Sparkling discoveries.');
  const discovered = new Set<string>(discoveries.map(key));
  const all = Object.values(ROSTER).flat();
  const known = new Set(all.map(key));
  const caught = all.filter(name => discovered.has(key(name)));
  const unknownSpecies = [...discovered].filter(name => !known.has(name));
  const rawTickets = optionalObject(safari?.tickets);
  const tickets = rawTickets ? Object.fromEntries(TIERS.map(tier => [tier, Object.hasOwn(rawTickets, tier) ? count(rawTickets[tier]) : 0])) : null;
  const balances = tickets ? Object.values(tickets) : null;
  const ticketTotal = balances && balances.every((n): n is number => n !== null) ? balances.reduce((a, b) => a + b, 0) : null;
  if (ticketTotal !== null && !Number.isSafeInteger(ticketTotal)) throw new BotError('malformed', 'Malformed ticket total.');
  const suppliedTotal = count(safari?.total_captured_sparkling_critters);
  const playerData = optionalObject(member.player_data);
  const experience = optionalObject(playerData?.experience);
  const currencies = optionalObject(member.currencies);
  const essence = optionalObject(currencies?.essence);
  const safariEssence = optionalObject(essence?.SAFARI);
  return {
    profileId: profile.profile_id,
    profileName: typeof profile.cute_name === 'string' ? profile.cute_name.slice(0, 80) : profile.profile_id.slice(0, 80),
    tickets, ticketTotal, caught,
    missing: Object.fromEntries(Object.entries(ROSTER).map(([biome, names]) => [biome, names.filter(name => !discovered.has(key(name)))])),
    unknownSpecies, totalCaptured: suppliedTotal ?? (discovered.size === 0 ? 0 : null),
    huntingLevel: levelFromXp(experience?.SKILL_HUNTING),
    essence: count(safariEssence?.current)
  };
}
