import type { PlayerClass } from './classes';
import type { SaveEquipmentTemplate, StatBlock } from '../engine/save/schema';

/**
 * Everything the player can wear: seventy-five items across three slots, and
 * the six rarities they come in.
 *
 * **Equipment rarities are not hero rarities.** The hero table has eight and
 * includes `uncommon` and `godly`; this has six and includes neither. Two
 * unions with four shared names is exactly the shape a port collapses into one
 * by accident, and the symptom would be a `godly` sword that no rarity table
 * has a weight for — so they are separate types that never meet.
 *
 * Transcribed from the shipped catalogue by generating this file out of
 * `__fixtures__/equipment.json` rather than by hand, and `equipment.test.ts`
 * checks every row back against that fixture. Seventy-five rows of names,
 * emoji, classes and stat bonuses is more transcription than anybody reads
 * carefully.
 */

export const EQUIPMENT_SLOTS = ['weapon', 'armor', 'accessory'] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export const EQUIPMENT_RARITY_IDS = ['common', 'rare', 'epic', 'legendary', 'mythic', 'transcendent'] as const;
export type EquipmentRarity = (typeof EQUIPMENT_RARITY_IDS)[number];

export interface EquipmentRarityConfig {
  id: EquipmentRarity;
  label: string;
  /**
   * The shipped hex, carried so the two apps' catalogues stay identical and a
   * divergence is visible. **Not** what the web build paints with — a surface
   * may only name a colour from `theme/tokens.css`, and `ui/architecture.test.ts`
   * refuses one that does not. `ui/copy/equipment.ts` does the mapping.
   */
  color: string;
  dropWeight: number;
}

export interface EquipmentItem {
  id: string;
  name: string;
  emoji: string;
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  /**
   * Every authored row names exactly one class, and `equipItem` refuses an item
   * whose list does not include the player's — so in practice this is equality.
   * Kept as a list because that is what the shipped rows are: a port that
   * modelled it as one string would agree on every item that exists today and
   * diverge the moment a shared item is authored.
   */
  allowedClasses: readonly PlayerClass[];
  description: string;
  bonus: Partial<StatBlock>;
}

/**
 * The rarity table, in the order the roll walks it.
 *
 * Order is load-bearing twice over: the roll subtracts each weight in turn, and
 * the rank comparison the auto-dismantle floor uses is this index. A table
 * sorted differently would change both.
 */
export const EQUIPMENT_RARITIES: readonly EquipmentRarityConfig[] = [
  { id: 'common', label: 'Common', color: '#B8B8B8', dropWeight: 60 },
  { id: 'rare', label: 'Rare', color: '#5DA8FF', dropWeight: 26 },
  { id: 'epic', label: 'Epic', color: '#B66BFF', dropWeight: 11 },
  { id: 'legendary', label: 'Legendary', color: '#FFB347', dropWeight: 3 },
  { id: 'mythic', label: 'Mythic', color: '#FF5B8A', dropWeight: 1 },
  { id: 'transcendent', label: 'Transcendent', color: '#00D4FF', dropWeight: 0.4 },
];

export const EQUIPMENT_CATALOG: readonly EquipmentItem[] = [
  {
    id: 'w_warrior_blade',
    name: 'Iron Vanguard Blade',
    emoji: '⚔️',
    slot: 'weapon',
    rarity: 'common',
    allowedClasses: ['warrior'],
    description: 'Reliable frontline steel.',
    bonus: { strength: 3, vitality: 1 },
  },
  {
    id: 'w_warrior_hammer',
    name: 'Bastion Hammer',
    emoji: '🔨',
    slot: 'weapon',
    rarity: 'rare',
    allowedClasses: ['warrior'],
    description: 'Crushing blows for fortress walls.',
    bonus: { strength: 4, vitality: 2 },
  },
  {
    id: 'w_berserker_axe',
    name: 'Ragecleaver Axe',
    emoji: '🪓',
    slot: 'weapon',
    rarity: 'common',
    allowedClasses: ['berserker'],
    description: 'Heavy strikes with reckless force.',
    bonus: { strength: 3, vitality: 2 },
  },
  {
    id: 'w_berserker_chainaxe',
    name: 'Howlchain Axe',
    emoji: '⛓️',
    slot: 'weapon',
    rarity: 'epic',
    allowedClasses: ['berserker'],
    description: 'A savage weapon that feeds on chaos.',
    bonus: { strength: 6, agility: 1 },
  },
  {
    id: 'w_archer_bow',
    name: 'Falcon Recurve',
    emoji: '🏹',
    slot: 'weapon',
    rarity: 'common',
    allowedClasses: ['archer'],
    description: 'A bow built for rapid shots.',
    bonus: { agility: 3, strength: 1 },
  },
  {
    id: 'w_archer_longbow',
    name: 'Stormline Longbow',
    emoji: '🎯',
    slot: 'weapon',
    rarity: 'rare',
    allowedClasses: ['archer'],
    description: 'Pinpoint shots over impossible distance.',
    bonus: { agility: 5, spirit: 1 },
  },
  {
    id: 'w_mage_staff',
    name: 'Starglass Staff',
    emoji: '🔮',
    slot: 'weapon',
    rarity: 'rare',
    allowedClasses: ['mage'],
    description: 'Arcane conduit for spellburst.',
    bonus: { intelligence: 4 },
  },
  {
    id: 'w_mage_codex',
    name: 'Void Codex',
    emoji: '📘',
    slot: 'weapon',
    rarity: 'epic',
    allowedClasses: ['mage'],
    description: 'Whispers forbidden equations of power.',
    bonus: { intelligence: 6, spirit: 2 },
  },
  {
    id: 'w_monk_focus',
    name: 'Prayer Beads',
    emoji: '📿',
    slot: 'weapon',
    rarity: 'rare',
    allowedClasses: ['monk'],
    description: 'Focuses inner current.',
    bonus: { spirit: 3, intelligence: 1 },
  },
  {
    id: 'w_monk_katar',
    name: 'Zen Katar',
    emoji: '🗡️',
    slot: 'weapon',
    rarity: 'epic',
    allowedClasses: ['monk'],
    description: 'Silent blades guided by calm breath.',
    bonus: { agility: 3, spirit: 4 },
  },
  {
    id: 'w_warrior_sunbreaker',
    name: 'Sunbreaker Claymore',
    emoji: '🗡️',
    slot: 'weapon',
    rarity: 'mythic',
    allowedClasses: ['warrior'],
    description: 'A royal blade that shatters siege lines.',
    bonus: { strength: 9, vitality: 4 },
  },
  {
    id: 'w_berserker_worldrend',
    name: 'Worldrend Axe',
    emoji: '🪓',
    slot: 'weapon',
    rarity: 'mythic',
    allowedClasses: ['berserker'],
    description: 'A hunger-forged axe of catastrophic swings.',
    bonus: { strength: 10, agility: 3 },
  },
  {
    id: 'w_archer_starfall',
    name: 'Starfall Bow',
    emoji: '🏹',
    slot: 'weapon',
    rarity: 'mythic',
    allowedClasses: ['archer'],
    description: 'Each arrow leaves a comet trail.',
    bonus: { agility: 9, spirit: 3 },
  },
  {
    id: 'w_mage_nullspire',
    name: 'Nullspire Staff',
    emoji: '🔮',
    slot: 'weapon',
    rarity: 'mythic',
    allowedClasses: ['mage'],
    description: 'Converts silence into annihilation.',
    bonus: { intelligence: 10, spirit: 5 },
  },
  {
    id: 'w_monk_heavensplit',
    name: 'Heavensplit Katar',
    emoji: '🗡️',
    slot: 'weapon',
    rarity: 'mythic',
    allowedClasses: ['monk'],
    description: 'A sacred edge that hums with calm fury.',
    bonus: { spirit: 9, agility: 4 },
  },
  {
    id: 'a_plate',
    name: 'Knight Plate',
    emoji: '🛡️',
    slot: 'armor',
    rarity: 'common',
    allowedClasses: ['warrior'],
    description: 'Reinforced armor for long fights.',
    bonus: { vitality: 3, spirit: 1 },
  },
  {
    id: 'a_bulwark',
    name: 'Bulwark Aegis',
    emoji: '🧿',
    slot: 'armor',
    rarity: 'epic',
    allowedClasses: ['warrior'],
    description: 'A legendary shell that refuses to break.',
    bonus: { vitality: 7, spirit: 2 },
  },
  {
    id: 'a_hide',
    name: 'Bloodhide Harness',
    emoji: '🧱',
    slot: 'armor',
    rarity: 'rare',
    allowedClasses: ['berserker'],
    description: 'Built to absorb punishment.',
    bonus: { vitality: 4 },
  },
  {
    id: 'a_wolfmantle',
    name: 'Wolfmantle',
    emoji: '🐺',
    slot: 'armor',
    rarity: 'epic',
    allowedClasses: ['berserker'],
    description: 'Predatory instinct wrapped in hide.',
    bonus: { vitality: 5, strength: 2 },
  },
  {
    id: 'a_leather',
    name: 'Ranger Leathers',
    emoji: '🦌',
    slot: 'armor',
    rarity: 'common',
    allowedClasses: ['archer'],
    description: 'Light movement and clean aim.',
    bonus: { agility: 2, vitality: 1 },
  },
  {
    id: 'a_phantomcloak',
    name: 'Phantom Cloak',
    emoji: '🕶️',
    slot: 'armor',
    rarity: 'epic',
    allowedClasses: ['archer'],
    description: 'A veil that makes every step unseen.',
    bonus: { agility: 5, spirit: 1 },
  },
  {
    id: 'a_robe',
    name: 'Astral Robe',
    emoji: '🧥',
    slot: 'armor',
    rarity: 'epic',
    allowedClasses: ['mage'],
    description: 'Runed cloth that amplifies mana.',
    bonus: { intelligence: 2, spirit: 2 },
  },
  {
    id: 'a_starweave',
    name: 'Starweave Mantle',
    emoji: '🌌',
    slot: 'armor',
    rarity: 'legendary',
    allowedClasses: ['mage'],
    description: 'Threads stitched from dying stars.',
    bonus: { intelligence: 7, spirit: 4 },
  },
  {
    id: 'a_wraps',
    name: 'Temple Wraps',
    emoji: '🥋',
    slot: 'armor',
    rarity: 'rare',
    allowedClasses: ['monk'],
    description: 'Flexible defense for body and mind.',
    bonus: { vitality: 2, spirit: 2 },
  },
  {
    id: 'a_lotusguard',
    name: 'Lotusguard Vest',
    emoji: '🌸',
    slot: 'armor',
    rarity: 'epic',
    allowedClasses: ['monk'],
    description: 'Balanced defense in every stance.',
    bonus: { vitality: 4, spirit: 3 },
  },
  {
    id: 'a_warrior_aurum',
    name: 'Aurum Bastion Plate',
    emoji: '🛡️',
    slot: 'armor',
    rarity: 'mythic',
    allowedClasses: ['warrior'],
    description: 'Imperial wallplate from a lost dynasty.',
    bonus: { vitality: 10, spirit: 4 },
  },
  {
    id: 'a_berserker_rampart',
    name: 'Rampart Hide',
    emoji: '🧱',
    slot: 'armor',
    rarity: 'mythic',
    allowedClasses: ['berserker'],
    description: 'Stitched with battle oaths and scars.',
    bonus: { vitality: 9, strength: 4 },
  },
  {
    id: 'a_archer_galeveil',
    name: 'Galeveil Cloak',
    emoji: '🕶️',
    slot: 'armor',
    rarity: 'mythic',
    allowedClasses: ['archer'],
    description: 'Turns pressure fronts into cover.',
    bonus: { agility: 9, vitality: 3 },
  },
  {
    id: 'a_mage_starvault',
    name: 'Starvault Mantle',
    emoji: '🌌',
    slot: 'armor',
    rarity: 'mythic',
    allowedClasses: ['mage'],
    description: 'Threaded with an unbroken night sky.',
    bonus: { intelligence: 9, spirit: 5 },
  },
  {
    id: 'a_monk_moonward',
    name: 'Moonward Vestments',
    emoji: '🌙',
    slot: 'armor',
    rarity: 'mythic',
    allowedClasses: ['monk'],
    description: 'Ceremonial robes that bend impact.',
    bonus: { spirit: 8, vitality: 5 },
  },
  {
    id: 'x_warrior_signet',
    name: 'Lioncrest Signet',
    emoji: '💍',
    slot: 'accessory',
    rarity: 'rare',
    allowedClasses: ['warrior'],
    description: 'Symbol of command.',
    bonus: { strength: 1, vitality: 1 },
  },
  {
    id: 'x_warrior_banner',
    name: 'Warlord Banner Pin',
    emoji: '🚩',
    slot: 'accessory',
    rarity: 'epic',
    allowedClasses: ['warrior'],
    description: 'Inspires nearby allies to hold.',
    bonus: { vitality: 3, spirit: 2 },
  },
  {
    id: 'x_berserker_totem',
    name: 'Blood Totem',
    emoji: '🩸',
    slot: 'accessory',
    rarity: 'epic',
    allowedClasses: ['berserker'],
    description: 'Feeds relentless fury.',
    bonus: { strength: 2 },
  },
  {
    id: 'x_berserker_fang',
    name: 'Rift Fang',
    emoji: '🦷',
    slot: 'accessory',
    rarity: 'legendary',
    allowedClasses: ['berserker'],
    description: 'A fang from something ancient and cruel.',
    bonus: { strength: 5, agility: 2 },
  },
  {
    id: 'x_archer_charm',
    name: 'Windcharm',
    emoji: '🍃',
    slot: 'accessory',
    rarity: 'rare',
    allowedClasses: ['archer'],
    description: 'Sharper reflex and release.',
    bonus: { agility: 2 },
  },
  {
    id: 'x_archer_scope',
    name: 'Hawkeye Scope',
    emoji: '🔭',
    slot: 'accessory',
    rarity: 'epic',
    allowedClasses: ['archer'],
    description: 'Reads wind and distance in a blink.',
    bonus: { agility: 4, intelligence: 1 },
  },
  {
    id: 'x_mage_orb',
    name: 'Aether Orb',
    emoji: '🔵',
    slot: 'accessory',
    rarity: 'legendary',
    allowedClasses: ['mage'],
    description: 'Dense arcane focus.',
    bonus: { intelligence: 2 },
  },
  {
    id: 'x_mage_seal',
    name: 'Chronoseal',
    emoji: '⌛',
    slot: 'accessory',
    rarity: 'legendary',
    allowedClasses: ['mage'],
    description: 'Bends moments between spells.',
    bonus: { intelligence: 5, spirit: 3 },
  },
  {
    id: 'x_monk_talisman',
    name: 'Lotus Talisman',
    emoji: '🪷',
    slot: 'accessory',
    rarity: 'epic',
    allowedClasses: ['monk'],
    description: 'Calm aura under pressure.',
    bonus: { spirit: 2 },
  },
  {
    id: 'x_monk_knot',
    name: 'Celestial Knot',
    emoji: '🪢',
    slot: 'accessory',
    rarity: 'legendary',
    allowedClasses: ['monk'],
    description: 'A sacred knot with perfect tension.',
    bonus: { spirit: 5, vitality: 2 },
  },
  {
    id: 'x_warrior_kingshard',
    name: 'Kingshard Sigil',
    emoji: '💠',
    slot: 'accessory',
    rarity: 'mythic',
    allowedClasses: ['warrior'],
    description: 'A shard of old coronation steel.',
    bonus: { vitality: 6, strength: 4 },
  },
  {
    id: 'x_berserker_heartfire',
    name: 'Heartfire Fang',
    emoji: '🔥',
    slot: 'accessory',
    rarity: 'mythic',
    allowedClasses: ['berserker'],
    description: 'Feeds on momentum and pain.',
    bonus: { strength: 6, agility: 3 },
  },
  {
    id: 'x_archer_skylens',
    name: 'Skylens Pendant',
    emoji: '🔭',
    slot: 'accessory',
    rarity: 'mythic',
    allowedClasses: ['archer'],
    description: 'Finds weak points before they exist.',
    bonus: { agility: 7, spirit: 2 },
  },
  {
    id: 'x_mage_voidtear',
    name: 'Voidtear Orb',
    emoji: '🌀',
    slot: 'accessory',
    rarity: 'mythic',
    allowedClasses: ['mage'],
    description: 'A hollow star that amplifies spells.',
    bonus: { intelligence: 7, spirit: 4 },
  },
  {
    id: 'x_monk_sunsigil',
    name: 'Sunsigil Charm',
    emoji: '☀️',
    slot: 'accessory',
    rarity: 'mythic',
    allowedClasses: ['monk'],
    description: 'Anchors the breath in radiant rhythm.',
    bonus: { spirit: 7, vitality: 3 },
  },
  {
    id: 'w_warrior_gravemark',
    name: 'Gravemark Halberd',
    emoji: '🗡️',
    slot: 'weapon',
    rarity: 'legendary',
    allowedClasses: ['warrior'],
    description: 'Heavy polearm forged for siege lines.',
    bonus: { strength: 7, vitality: 3 },
  },
  {
    id: 'w_berserker_skullsplit',
    name: 'Skullsplit Maul',
    emoji: '🔨',
    slot: 'weapon',
    rarity: 'legendary',
    allowedClasses: ['berserker'],
    description: 'A brutal hammer that grows louder in battle.',
    bonus: { strength: 8, vitality: 2 },
  },
  {
    id: 'w_archer_duskgale',
    name: 'Duskgale Repeater',
    emoji: '🏹',
    slot: 'weapon',
    rarity: 'legendary',
    allowedClasses: ['archer'],
    description: 'Fires in controlled stormburst volleys.',
    bonus: { agility: 7, strength: 2 },
  },
  {
    id: 'w_mage_riftlantern',
    name: 'Rift Lantern',
    emoji: '🏮',
    slot: 'weapon',
    rarity: 'legendary',
    allowedClasses: ['mage'],
    description: 'Carries a miniature tear in space.',
    bonus: { intelligence: 8, spirit: 3 },
  },
  {
    id: 'w_monk_thunderstaff',
    name: 'Thunderstaff',
    emoji: '⚡',
    slot: 'weapon',
    rarity: 'legendary',
    allowedClasses: ['monk'],
    description: 'Conducts focused strikes through breath control.',
    bonus: { spirit: 6, agility: 3 },
  },
  {
    id: 'a_warrior_garrison',
    name: 'Garrison Shell',
    emoji: '🛡️',
    slot: 'armor',
    rarity: 'legendary',
    allowedClasses: ['warrior'],
    description: 'Layered plating from fortress captains.',
    bonus: { vitality: 8, strength: 2 },
  },
  {
    id: 'a_berserker_ironhide',
    name: 'Ironhide Mantle',
    emoji: '🧱',
    slot: 'armor',
    rarity: 'legendary',
    allowedClasses: ['berserker'],
    description: 'Absorbs punishment and answers with force.',
    bonus: { vitality: 7, strength: 3 },
  },
  {
    id: 'a_archer_shadesilk',
    name: 'Shadesilk Cloak',
    emoji: '🕶️',
    slot: 'armor',
    rarity: 'legendary',
    allowedClasses: ['archer'],
    description: 'Weightless cloak tuned for sudden movement.',
    bonus: { agility: 7, spirit: 2 },
  },
  {
    id: 'a_mage_orbitweave',
    name: 'Orbitweave Robes',
    emoji: '🌠',
    slot: 'armor',
    rarity: 'mythic',
    allowedClasses: ['mage'],
    description: 'Runes orbit the wearer like satellites.',
    bonus: { intelligence: 10, spirit: 4 },
  },
  {
    id: 'a_monk_stormveil',
    name: 'Stormveil Wraps',
    emoji: '🥋',
    slot: 'armor',
    rarity: 'legendary',
    allowedClasses: ['monk'],
    description: 'Flexes between impact and flow.',
    bonus: { vitality: 6, spirit: 4 },
  },
  {
    id: 'x_warrior_wardring',
    name: 'Wardring of Oaths',
    emoji: '💍',
    slot: 'accessory',
    rarity: 'legendary',
    allowedClasses: ['warrior'],
    description: 'Binds old oaths into active defenses.',
    bonus: { vitality: 5, spirit: 2 },
  },
  {
    id: 'x_berserker_warbrand',
    name: 'Warbrand Token',
    emoji: '🔥',
    slot: 'accessory',
    rarity: 'rare',
    allowedClasses: ['berserker'],
    description: 'Marks each hit with rising fury.',
    bonus: { strength: 3, vitality: 1 },
  },
  {
    id: 'x_archer_galecrest',
    name: 'Galecrest Brooch',
    emoji: '🍃',
    slot: 'accessory',
    rarity: 'legendary',
    allowedClasses: ['archer'],
    description: 'Keeps rhythm between movement and release.',
    bonus: { agility: 6, spirit: 2 },
  },
  {
    id: 'x_mage_starseal',
    name: 'Starseal Prism',
    emoji: '🔷',
    slot: 'accessory',
    rarity: 'epic',
    allowedClasses: ['mage'],
    description: 'Condenses unstable mana into clean bursts.',
    bonus: { intelligence: 4, spirit: 2 },
  },
  {
    id: 'x_monk_tidebead',
    name: 'Tidebead Charm',
    emoji: '🌊',
    slot: 'accessory',
    rarity: 'rare',
    allowedClasses: ['monk'],
    description: 'Stabilizes cadence under pressure.',
    bonus: { spirit: 3, vitality: 1 },
  },
  {
    id: 'tw_warrior_oblivion',
    name: 'Oblivion Crownblade',
    emoji: '🗡️',
    slot: 'weapon',
    rarity: 'transcendent',
    allowedClasses: ['warrior'],
    description: 'Dynastic steel tempered in collapsing stars.',
    bonus: { strength: 14, vitality: 7 },
  },
  {
    id: 'tw_berserker_abyss',
    name: 'Abyssbreaker',
    emoji: '🪓',
    slot: 'weapon',
    rarity: 'transcendent',
    allowedClasses: ['berserker'],
    description: 'A tidal executioner axe forged under blood moons.',
    bonus: { strength: 15, agility: 6 },
  },
  {
    id: 'tw_archer_solstice',
    name: 'Solstice Railbow',
    emoji: '🏹',
    slot: 'weapon',
    rarity: 'transcendent',
    allowedClasses: ['archer'],
    description: 'Launches stellar lances through fortress walls.',
    bonus: { agility: 14, spirit: 6 },
  },
  {
    id: 'tw_mage_axiom',
    name: 'Axiom Core Staff',
    emoji: '🔮',
    slot: 'weapon',
    rarity: 'transcendent',
    allowedClasses: ['mage'],
    description: 'Writes new laws for arcane warfare.',
    bonus: { intelligence: 16, spirit: 8 },
  },
  {
    id: 'tw_monk_resonance',
    name: 'Resonance Edge',
    emoji: '🗡️',
    slot: 'weapon',
    rarity: 'transcendent',
    allowedClasses: ['monk'],
    description: 'Every strike echoes across parallel arenas.',
    bonus: { spirit: 14, agility: 7 },
  },
  {
    id: 'ta_warrior_imperium',
    name: 'Imperium Bulwark',
    emoji: '🛡️',
    slot: 'armor',
    rarity: 'transcendent',
    allowedClasses: ['warrior'],
    description: 'Throneguard plate from the final empire.',
    bonus: { vitality: 15, spirit: 7 },
  },
  {
    id: 'ta_berserker_howl',
    name: 'Howlplate Mantle',
    emoji: '🧱',
    slot: 'armor',
    rarity: 'transcendent',
    allowedClasses: ['berserker'],
    description: 'Hides stitched from apex void predators.',
    bonus: { vitality: 14, strength: 7 },
  },
  {
    id: 'ta_archer_aether',
    name: 'Aetherveil Cloak',
    emoji: '🕶️',
    slot: 'armor',
    rarity: 'transcendent',
    allowedClasses: ['archer'],
    description: 'Bends crosswinds into phantom cover.',
    bonus: { agility: 13, vitality: 6 },
  },
  {
    id: 'ta_mage_singularity',
    name: 'Singularity Robes',
    emoji: '🌌',
    slot: 'armor',
    rarity: 'transcendent',
    allowedClasses: ['mage'],
    description: 'Orbiting runes trap enemy momentum.',
    bonus: { intelligence: 15, spirit: 8 },
  },
  {
    id: 'ta_monk_equilibrium',
    name: 'Equilibrium Vestments',
    emoji: '🌙',
    slot: 'armor',
    rarity: 'transcendent',
    allowedClasses: ['monk'],
    description: 'Flows between stillness and annihilation.',
    bonus: { spirit: 13, vitality: 7 },
  },
  {
    id: 'tx_warrior_crown',
    name: 'Crownfall Sigil',
    emoji: '💠',
    slot: 'accessory',
    rarity: 'transcendent',
    allowedClasses: ['warrior'],
    description: 'Marks command over ruined dynasties.',
    bonus: { vitality: 9, strength: 7 },
  },
  {
    id: 'tx_berserker_heart',
    name: 'Heartfire Core',
    emoji: '🔥',
    slot: 'accessory',
    rarity: 'transcendent',
    allowedClasses: ['berserker'],
    description: 'Converts battle pain into pure force.',
    bonus: { strength: 10, agility: 6 },
  },
  {
    id: 'tx_archer_horizon',
    name: 'Horizon Lens',
    emoji: '🔭',
    slot: 'accessory',
    rarity: 'transcendent',
    allowedClasses: ['archer'],
    description: 'Calculates kill vectors before release.',
    bonus: { agility: 10, spirit: 5 },
  },
  {
    id: 'tx_mage_paradox',
    name: 'Paradox Prism',
    emoji: '🌀',
    slot: 'accessory',
    rarity: 'transcendent',
    allowedClasses: ['mage'],
    description: 'Fractures cast limits into infinite loops.',
    bonus: { intelligence: 10, spirit: 7 },
  },
  {
    id: 'tx_monk_cycle',
    name: 'Cycle Knot',
    emoji: '♾️',
    slot: 'accessory',
    rarity: 'transcendent',
    allowedClasses: ['monk'],
    description: 'Aligns breath with the eternal return.',
    bonus: { spirit: 10, vitality: 6 },
  },
];

const BY_ID = new Map(EQUIPMENT_CATALOG.map(item => [item.id, item]));

export function getEquipmentItem(id: string): EquipmentItem | undefined {
  return BY_ID.get(id);
}

export function equipmentRarityConfig(rarity: EquipmentRarity): EquipmentRarityConfig {
  return EQUIPMENT_RARITIES.find(entry => entry.id === rarity) ?? EQUIPMENT_RARITIES[0];
}

/**
 * The three items a class begins with: the cheapest available in each slot.
 *
 * Cheapest, **not** common. No accessory in the catalogue is common, so every
 * class starts with a rare there — and the mage with an *epic*, which is the
 * strongest starter item in the game. The shipped function sorts by rarity rank
 * and takes the first, which is why that falls out rather than being chosen.
 */
export function starterEquipmentForClass(playerClass: PlayerClass): string[] {
  const rank = new Map(EQUIPMENT_RARITY_IDS.map((id, index) => [id, index]));
  const forClass = EQUIPMENT_CATALOG.filter(item => item.allowedClasses.includes(playerClass));
  return EQUIPMENT_SLOTS.map(slot => {
    const inSlot = [...forClass.filter(item => item.slot === slot)].sort(
      (a, b) => (rank.get(a.rarity) ?? 0) - (rank.get(b.rarity) ?? 0),
    );
    return inSlot[0]?.id ?? null;
  }).filter((id): id is string => id !== null);
}

/**
 * The catalogue in the shape the save layer needs it.
 *
 * The parallel of `heroTemplatesById`, and injected for the same reason: the
 * engine may not import this file, and a stored item whose row is absent from
 * the map is dropped — which is how a retired item leaves an old save.
 */
export function equipmentTemplatesById(): Map<string, SaveEquipmentTemplate> {
  return new Map(
    EQUIPMENT_CATALOG.map(item => [
      item.id,
      { slot: item.slot, rarity: item.rarity, name: item.name, emoji: item.emoji, description: item.description },
    ]),
  );
}
