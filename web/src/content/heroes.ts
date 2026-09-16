import type { PlayerClass } from './classes';
import type { HeroTemplate } from './heroStats';
import type { SaveHeroTemplate } from '../engine/save/schema';

/**
 * The summonable roster, ported verbatim from the shipped game.
 *
 * This is the file the save migration validates against: `SaveContent`
 * explains that a roster row whose template id is absent here is *dropped*,
 * because that is the mechanism by which a retired hero leaves old saves. So
 * a hero missing from this list does not fail loudly — it silently deletes
 * that hero from every save that had one. `heroes.test.ts` therefore asserts
 * the id sequence has no gap, rather than only that the ids are unique.
 *
 * Two authored fields are deliberately not carried across. Each entry in the
 * shipped `HERO_POOL` also has a `passiveTrait` and an `activeSkillArchetype`,
 * which describe verbs no phase has built yet; `HeroTemplate` does not declare
 * them, and carrying data nothing reads is how the previous config reached
 * four thousand lines. They are still in `src/gameConfig.ts` when Phase 4
 * wants them.
 */

export const HERO_POOL: readonly HeroTemplate[] = [
  { id: 'h1', name: 'Kael Ironheart', heroClass: 'warrior', emoji: '⚔️', baseTeamBoost: 0.05, tier: 1 },
  { id: 'h2', name: 'Mira Oathguard', heroClass: 'warrior', emoji: '🛡️', baseTeamBoost: 0.055, tier: 1 },
  { id: 'h3', name: 'Drogan Ashfury', heroClass: 'berserker', emoji: '🪓', baseTeamBoost: 0.06, tier: 1 },
  { id: 'h4', name: 'Thorn Bloodhide', heroClass: 'berserker', emoji: '🧱', baseTeamBoost: 0.05, tier: 1 },
  { id: 'h5', name: 'Sylvi Windmark', heroClass: 'archer', emoji: '🏹', baseTeamBoost: 0.055, tier: 1 },
  { id: 'h6', name: 'Riven Hawkeye', heroClass: 'archer', emoji: '🎯', baseTeamBoost: 0.06, tier: 1 },
  { id: 'h7', name: 'Lunara Frostweave', heroClass: 'mage', emoji: '❄️', baseTeamBoost: 0.065, tier: 1 },
  { id: 'h8', name: 'Aziel Embermind', heroClass: 'mage', emoji: '🔥', baseTeamBoost: 0.06, tier: 1 },
  { id: 'h9', name: 'Shen Dawnfist', heroClass: 'monk', emoji: '👊', baseTeamBoost: 0.055, tier: 1 },
  { id: 'h10', name: 'Iria Lotusveil', heroClass: 'monk', emoji: '🪷', baseTeamBoost: 0.06, tier: 1 },
  { id: 'h11', name: 'Borin Stonewall', heroClass: 'warrior', emoji: '⛰️', baseTeamBoost: 0.05, tier: 1 },
  { id: 'h12', name: 'Karra Rageborn', heroClass: 'berserker', emoji: '🩸', baseTeamBoost: 0.065, tier: 1 },
  { id: 'h13', name: 'Nyx Whisperleaf', heroClass: 'archer', emoji: '🌿', baseTeamBoost: 0.055, tier: 1 },
  { id: 'h14', name: 'Vex Starchant', heroClass: 'mage', emoji: '✨', baseTeamBoost: 0.07, tier: 1 },
  { id: 'h15', name: 'Tarin Sunstep', heroClass: 'monk', emoji: '☀️', baseTeamBoost: 0.06, tier: 1 },
  { id: 'h16', name: 'Orin Bastionforge', heroClass: 'warrior', emoji: '🧱', baseTeamBoost: 0.058, tier: 1 },
  { id: 'h17', name: 'Selene Ironbanner', heroClass: 'warrior', emoji: '🚩', baseTeamBoost: 0.062, tier: 1 },
  { id: 'h18', name: 'Varric Doomhowl', heroClass: 'berserker', emoji: '🐺', baseTeamBoost: 0.068, tier: 1 },
  { id: 'h19', name: 'Morga Chainstorm', heroClass: 'berserker', emoji: '⛓️', baseTeamBoost: 0.057, tier: 1 },
  { id: 'h20', name: 'Aela Windpierce', heroClass: 'archer', emoji: '🦅', baseTeamBoost: 0.061, tier: 1 },
  { id: 'h21', name: 'Kestrel Moonshot', heroClass: 'archer', emoji: '🌙', baseTeamBoost: 0.058, tier: 1 },
  { id: 'h22', name: 'Seris Riftborn', heroClass: 'mage', emoji: '🌀', baseTeamBoost: 0.071, tier: 1 },
  { id: 'h23', name: 'Noctis Emberveil', heroClass: 'mage', emoji: '🌌', baseTeamBoost: 0.066, tier: 1 },
  { id: 'h24', name: 'Korin Stillwater', heroClass: 'monk', emoji: '🌊', baseTeamBoost: 0.063, tier: 1 },
  { id: 'h25', name: 'Maeve Stormpalm', heroClass: 'monk', emoji: '⚡', baseTeamBoost: 0.064, tier: 1 },
  { id: 'h26', name: 'Gideon Flamecrest', heroClass: 'warrior', emoji: '🔥', baseTeamBoost: 0.06, tier: 1 },
  { id: 'h27', name: 'Rook Ashrender', heroClass: 'berserker', emoji: '💀', baseTeamBoost: 0.067, tier: 1 },
  { id: 'h28', name: 'Lyra Starquill', heroClass: 'archer', emoji: '⭐', baseTeamBoost: 0.06, tier: 1 },
  { id: 'h29', name: 'Eldrin Palefire', heroClass: 'mage', emoji: '🕯️', baseTeamBoost: 0.065, tier: 1 },
  { id: 'h30', name: 'Jin Hollowreed', heroClass: 'monk', emoji: '🎋', baseTeamBoost: 0.062, tier: 1 },
  { id: 'h31', name: 'Thors Ironpeak', heroClass: 'warrior', emoji: '⛏️', baseTeamBoost: 0.061, tier: 2 },
  { id: 'h32', name: 'Valkyra Shieldborn', heroClass: 'warrior', emoji: '🗡️', baseTeamBoost: 0.063, tier: 2 },
  { id: 'h33', name: 'Brutus Ironjaw', heroClass: 'berserker', emoji: '😤', baseTeamBoost: 0.069, tier: 2 },
  { id: 'h34', name: 'Magus Stonereave', heroClass: 'berserker', emoji: '💥', baseTeamBoost: 0.059, tier: 2 },
  { id: 'h35', name: 'Vesper Silverbow', heroClass: 'archer', emoji: '🎪', baseTeamBoost: 0.062, tier: 2 },
  { id: 'h36', name: 'Fenwick Swiftbrand', heroClass: 'archer', emoji: '💨', baseTeamBoost: 0.06, tier: 2 },
  { id: 'h37', name: 'Thalia Duskborn', heroClass: 'mage', emoji: '🌙', baseTeamBoost: 0.072, tier: 2 },
  { id: 'h38', name: 'Corvus Nightwhisper', heroClass: 'mage', emoji: '🐦', baseTeamBoost: 0.067, tier: 2 },
  { id: 'h39', name: 'Kalen Dawnbringer', heroClass: 'monk', emoji: '☀️', baseTeamBoost: 0.065, tier: 2 },
  { id: 'h40', name: 'Sera Veilwanderer', heroClass: 'monk', emoji: '👻', baseTeamBoost: 0.064, tier: 2 },
  { id: 'h41', name: 'Karthus Soulforge', heroClass: 'warrior', emoji: '💀', baseTeamBoost: 0.073, tier: 3 },
  { id: 'h42', name: 'Azura Dawnbearer', heroClass: 'warrior', emoji: '🌅', baseTeamBoost: 0.068, tier: 3 },
  { id: 'h43', name: 'Viktor Darkbane', heroClass: 'berserker', emoji: '🗡️', baseTeamBoost: 0.075, tier: 3 },
  { id: 'h44', name: 'Morgath Terrorforge', heroClass: 'berserker', emoji: '👹', baseTeamBoost: 0.07, tier: 3 },
  { id: 'h45', name: 'Zara Voidarchress', heroClass: 'archer', emoji: '🌌', baseTeamBoost: 0.074, tier: 3 },
  { id: 'h46', name: 'Kastor Deathmark', heroClass: 'archer', emoji: '🎯', baseTeamBoost: 0.069, tier: 3 },
  { id: 'h47', name: 'Iris Veilbearer', heroClass: 'mage', emoji: '🔷', baseTeamBoost: 0.078, tier: 3 },
  { id: 'h48', name: 'Arctus Frostking', heroClass: 'mage', emoji: '❄️', baseTeamBoost: 0.076, tier: 3 },
  { id: 'h49', name: 'Sorena Lightfury', heroClass: 'monk', emoji: '⚡', baseTeamBoost: 0.072, tier: 3 },
  { id: 'h50', name: 'Orion Soulshaper', heroClass: 'monk', emoji: '✨', baseTeamBoost: 0.071, tier: 3 },
  { id: 'h51', name: 'Aethermaw Unbounded', heroClass: 'warrior', emoji: '🐉', baseTeamBoost: 0.085, tier: 4 },
  { id: 'h52', name: 'Seraph the Infinite', heroClass: 'warrior', emoji: '👼', baseTeamBoost: 0.082, tier: 4 },
  { id: 'h53', name: 'Ragnar Hellborn', heroClass: 'berserker', emoji: '👺', baseTeamBoost: 0.088, tier: 4 },
  { id: 'h54', name: 'Vyxara Shadow Empress', heroClass: 'berserker', emoji: '👑', baseTeamBoost: 0.084, tier: 4 },
  { id: 'h55', name: 'Zephyr Starreacher', heroClass: 'archer', emoji: '🌠', baseTeamBoost: 0.087, tier: 4 },
  { id: 'h56', name: 'Nyx Void Chosen', heroClass: 'archer', emoji: '🕷️', baseTeamBoost: 0.083, tier: 4 },
  { id: 'h57', name: 'Archaon Time Weaver', heroClass: 'mage', emoji: '⏰', baseTeamBoost: 0.091, tier: 4 },
  { id: 'h58', name: 'Pyritess Eternal Flame', heroClass: 'mage', emoji: '🔥', baseTeamBoost: 0.089, tier: 4 },
  { id: 'h59', name: 'Luminion Stellarch', heroClass: 'monk', emoji: '⭐', baseTeamBoost: 0.086, tier: 4 },
  { id: 'h60', name: 'Void Sovereign', heroClass: 'monk', emoji: '🌀', baseTeamBoost: 0.085, tier: 4 },
  { id: 'h61', name: 'Titan Worldrender', heroClass: 'warrior', emoji: '🗻', baseTeamBoost: 0.095, tier: 5 },
  { id: 'h62', name: 'Leviathan Depths', heroClass: 'berserker', emoji: '🐙', baseTeamBoost: 0.098, tier: 5 },
  { id: 'h63', name: 'Phoenix Eternal', heroClass: 'archer', emoji: '🦅', baseTeamBoost: 0.096, tier: 5 },
  { id: 'h64', name: 'Celestial Architect', heroClass: 'mage', emoji: '🌌', baseTeamBoost: 0.1, tier: 5 },
  { id: 'h65', name: 'Dharma Eternal Cycle', heroClass: 'monk', emoji: '♾️', baseTeamBoost: 0.099, tier: 5 },
];

export const HERO_TEMPLATE_COUNT = HERO_POOL.length;

const BY_ID = new Map(HERO_POOL.map(hero => [hero.id, hero]));

export function getHeroTemplate(id: string): HeroTemplate | undefined {
  return BY_ID.get(id);
}

/** Every class that actually appears in the catalogue. */
export function heroClassesInPool(): PlayerClass[] {
  return [...new Set(HERO_POOL.map(hero => hero.heroClass))];
}

/**
 * The two facts the save migration needs, in the shape it asks for.
 *
 * Built fresh each call rather than cached, so nothing a caller does to the
 * map it is handed can reach back into the catalogue.
 */
export function heroTemplatesById(): Map<string, SaveHeroTemplate> {
  return new Map(HERO_POOL.map(hero => [hero.id, { heroClass: hero.heroClass, baseTeamBoost: hero.baseTeamBoost }]));
}
