import { parseProfile } from '../src/profile.ts';
import { renderCard } from '../src/commands.ts';
const uuid = 'a'.repeat(32);
const card = parseProfile({ success: true, profiles: [{ profile_id: 'example-profile', cute_name: 'Example profile',
  selected: true, members: { [uuid]: { safari: {
    tickets: { basic: 120, economy: 45, premium: 12, first_class: 3 },
    discovered_sparkling_critters: ['BLUEBIRD', 'MANTIS_SHRIMP'], total_captured_sparkling_critters: 67
  }, player_data: { experience: { SKILL_HUNTING: 50 } }, currencies: { essence: { SAFARI: { current: 85000 } } } } }
}] }, uuid);
console.log(JSON.stringify({ notice: 'Fictional offline demonstration; not a live player lookup.',
  messages: ['tickets', 'sparkling', 'safari'].map(command => renderCard(command,
    { name: 'ExamplePlayer', uuid, fetchedAt: 0, card })) }, null, 2));
