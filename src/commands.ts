import { ROSTER, TIERS } from './profile.ts';
import type { LookupResult } from './lookup.ts';
export type Message = { content?: string; embeds?: any[]; allowed_mentions?: { parse: string[] } };
const labels: Record<string, string> = { basic: 'Basic', economy: 'Economy', premium: 'Premium', first_class: 'First Class' };
export const SM_LINKS = {
  support: 'https://discord.com/channels/1567856303341051905/1567859199491186749',
  bugs: 'https://discord.com/channels/1567856303341051905/1567859984346128485',
  testing: 'https://discord.com/channels/1567856303341051905/1567860529777610822',
  downloads: 'https://discord.com/channels/1567856303341051905/1567858847169781831'
};
const show = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
export function clean(value: string): string { return value.replace(/[\\_*~|()[\]<>]/g, '\\$&'); }
export function renderCard(command: string, result: LookupResult, biome?: string): Message {
  const c = result.card;
  const fields: any[] = [];
  const field = (name: string, value: string) => fields.push({ name, value, inline: true });
  if (command !== 'sparkling') {
    if (command === 'tickets') {
      TIERS.forEach(tier => field(labels[tier], c.tickets ? show(c.tickets[tier]) : 'Unavailable'));
      field('Total', show(c.ticketTotal));
    } else {
      field('Hunting level', show(c.huntingLevel));
      field('Safari Essence', show(c.essence));
      field('Tickets', show(c.ticketTotal));
    }
  }
  if (command !== 'tickets') {
    field('Unique species', c.caught.length + ' / ' + Object.values(ROSTER).flat().length);
    field('Total catches', show(c.totalCaptured));
  }
  if (command === 'sparkling') {
    for (const [name, species] of Object.entries(ROSTER)) {
      if (biome && name !== biome) continue;
      const caught = species.filter(s => c.caught.includes(s));
      fields.push({ name: name + ' discoveries', inline: false,
        value: '**Caught:** ' + (caught.join(', ') || 'None') + '\n**Missing:** ' + (c.missing[name].join(', ') || 'None') });
    }
    if (c.unknownSpecies.length) fields.push({ name: 'Roster update needed', value: 'The API returned species not recognized by this bot. Known-species progress may be incomplete.' });
  }
  return { embeds: [{ title: clean(result.name) + ' — ' + (command === 'tickets' ? 'Safari tickets' : command === 'sparkling' ? 'Sparkling progress' : 'Safari card'),
    color: 0x60bfff, description: 'Profile: ' + clean(c.profileName), fields,
    footer: { text: 'API snapshot • fetched ' + new Date(result.fetchedAt).toISOString() } }],
    allowed_mentions: { parse: [] } };
}
export const commandDefinitions = [
  ...['tickets', 'sparkling', 'safari'].map(name => ({
    name, description: name === 'tickets' ? 'Show a player’s Safari tickets' : name === 'sparkling' ? 'Show Sparkling discoveries and catches' : 'Show a player’s Safari statistics',
    type: 1, options: [
      { name: 'player', description: 'Minecraft username', type: 3, required: true, min_length: 1, max_length: 16 },
      { name: 'share', description: 'Share the successful result in this command channel', type: 5, required: false },
      ...(name === 'sparkling' ? [{ name: 'biome', description: 'Filter the species list', type: 3, required: false,
        choices: Object.keys(ROSTER).map(value => ({ name: value, value })) }] : [])
    ]
  })),
  { name: 'help', description: 'Show SM bot commands and data freshness', type: 1 }
];
export const helpMessage: Message = {
  content: '**Sparkling Mutuals**\n/tickets player:IGN — ticket balances\n/sparkling player:IGN — unique discoveries, total catches and missing species\n/safari player:IGN — combined Safari card\n\nLookups use the selected SkyBlock profile and a 60-second cache. Results are private unless you choose share. Minecraft does not need to be open. [Support](' + SM_LINKS.support + ') · [Downloads](' + SM_LINKS.downloads + ')',
  allowed_mentions: { parse: [] }
};
