// ─────────────────────────────────────────────────────────────────────────────
//  IDLE RPG  –  Game Configuration
// ─────────────────────────────────────────────────────────────────────────────

export type PlayerClass = 'warrior' | 'berserker' | 'archer' | 'mage' | 'monk';

export type GameTab = 'battle' | 'heroes' | 'stats' | 'achievements' | 'equipment';

export type GiftPreference = 'gold' | 'shards' | 'essence';

/** Responsive layout breakpoints (width/height in logical pixels). */
export const BREAKPOINTS = {
  /** Below this width, use ultra-compact sub-tab layout */
  compactSubTab: 390,
  /** Below this width, phone-optimized compact layout */
  compactPhone: 430,
  /** Below this height, short phone layout adjustments */
  shortPhone: 780,
} as const;

export const GIFT_AMOUNTS = {
  gold: (level: number) => Math.max(1, Math.floor(level)) * 1000,
  shards: (level: number) => Math.max(1, Math.floor(level)) * 10,
  essence: (level: number) => Math.max(1, Math.floor(level)) * 5,
} as const;

export type StatKey = 'strength' | 'vitality' | 'agility' | 'intelligence' | 'spirit';

export interface StatBlock {
  strength: number;
  vitality: number;
  agility: number;
  intelligence: number;
  spirit: number;
}

export interface ClassConfig {
  id: PlayerClass;
  name: string;
  emoji: string;
  fantasy: string;
  style: string;
  baseStats: StatBlock;
  physWeight: number;
  magicWeight: number;
  teamWeight: number;
  statDescriptions: Record<StatKey, string>;
}

export const CLASSES: ClassConfig[] = [
  {
    id: 'warrior',
    name: 'Warrior',
    emoji: '🛡️',
    fantasy: 'Melee physical attack',
    style: 'Frontline bruiser with balanced defense',
    baseStats: { strength: 9, vitality: 8, agility: 5, intelligence: 3, spirit: 4 },
    physWeight: 1.25,
    magicWeight: 0.65,
    teamWeight: 1.0,
    statDescriptions: {
      strength: '⚔️ PRIMARY — High physical damage (1.25× weight). Invest here first.',
      vitality: '🛡️ STRONG — Grows team HP pool and enemy damage reduction.',
      agility: '🏃 DECENT — Minor physical bonus (1.2× speed scale).',
      intelligence: '💤 WEAK — Low magic weight (0.65×). Low priority for Warriors.',
      spirit: '🌀 UTILITY — Boosts defense and minor magic. Good third pick.',
    },
  },
  {
    id: 'berserker',
    name: 'Berserker',
    emoji: '🪓',
    fantasy: 'Melee physical tank',
    style: 'High vitality and rage scaling',
    baseStats: { strength: 8, vitality: 10, agility: 4, intelligence: 2, spirit: 4 },
    physWeight: 1.15,
    magicWeight: 0.55,
    teamWeight: 1.2,
    statDescriptions: {
      strength: '⚔️ PRIMARY — Rage power (1.15× weight). Core offensive stat.',
      vitality: '🛡️ CORE — Tank mode sustain. Very high HP synergy. Prioritize.',
      agility: '💤 LOW — Minor physical speed. Berserkers prefer raw power.',
      intelligence: '❌ SKIP — Near-useless (0.55× weight). Avoid entirely.',
      spirit: '🌀 MINOR — Slight defense. Optional investment.',
    },
  },
  {
    id: 'archer',
    name: 'Archer',
    emoji: '🏹',
    fantasy: 'Ranged physical attack',
    style: 'Fast, high precision sustained damage',
    baseStats: { strength: 6, vitality: 5, agility: 10, intelligence: 4, spirit: 4 },
    physWeight: 1.35,
    magicWeight: 0.5,
    teamWeight: 1.0,
    statDescriptions: {
      strength: '⚔️ SOLID — Ranged physical base (1.35× weight). Works with AGI.',
      vitality: '🛡️ MODERATE — Archers dodge, but some HP helps survivability.',
      agility: '🏃 PRIMARY — Attack speed + physical scaling (1.2×). Max first.',
      intelligence: '💤 SKIP — Weak magic weight (0.50×). Not for Archers.',
      spirit: '🌀 LOW — Minor ranged utility. Low priority.',
    },
  },
  {
    id: 'mage',
    name: 'Mage',
    emoji: '🔮',
    fantasy: 'Ranged magic attack',
    style: 'Explosive magic scaling and burst',
    baseStats: { strength: 2, vitality: 4, agility: 5, intelligence: 11, spirit: 8 },
    physWeight: 0.45,
    magicWeight: 1.45,
    teamWeight: 1.0,
    statDescriptions: {
      strength: '❌ SKIP — Nearly useless (0.45× weight). Never invest.',
      vitality: '🛡️ MODERATE — Fragile by nature. Some HP investment helps.',
      agility: '💤 LOW — Speed scaling is negligible for Mages.',
      intelligence: '🔮 PRIMARY — Main damage stat (1.45× weight). Always max first.',
      spirit: '✨ STRONG — Powerful magic synergy (1.1× scale). Second priority.',
    },
  },
  {
    id: 'monk',
    name: 'Monk',
    emoji: '🙏',
    fantasy: 'Melee magic attack/defense hybrid',
    style: 'Balanced discipline with aura buffs',
    baseStats: { strength: 5, vitality: 8, agility: 6, intelligence: 7, spirit: 9 },
    physWeight: 0.85,
    magicWeight: 1.05,
    teamWeight: 1.25,
    statDescriptions: {
      strength: '⚔️ SOLID — Balanced physical (0.85× weight). Good foundation.',
      vitality: '🛡️ STRONG — HP + team aura healing rate. Very valuable.',
      agility: '🏃 DECENT — Flow-state physical bonus. Moderate priority.',
      intelligence: '🔮 STRONG — Magic channel (1.05× weight). Strong investment.',
      spirit: '✨ PRIMARY — Aura amplifier (1.1× scale + 1.25× team bonus). Max this.',
    },
  },
];

export function getClassConfig(playerClass: PlayerClass): ClassConfig {
  return CLASSES.find(c => c.id === playerClass) ?? CLASSES[0];
}

// ── Equipment ──────────────────────────────────────────────────────────────

export type EquipmentSlot = 'weapon' | 'armor' | 'accessory';
export type EquipmentRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'transcendent';

export type PermanentUnlockId = 'class_passive' | 'advanced_consumables' | 'mythic_equipment';

export interface ActConfig {
  id: number;
  name: string;
  emoji: string;
  theme: string;
  startWave: number;
  endWave: number;
  bossWave: number;
  unlock: PermanentUnlockId | null;
}

export const ACTS: ActConfig[] = [
  {
    id: 1,
    name: 'Ashen Frontier',
    emoji: '🌋',
    theme: 'Scorched plains and raider warbands.',
    startWave: 1,
    endWave: 10,
    bossWave: 10,
    unlock: 'class_passive',
  },
  {
    id: 2,
    name: 'Verdant Ruin',
    emoji: '🌿',
    theme: 'Ancient overgrowth crawling with relic guardians.',
    startWave: 11,
    endWave: 20,
    bossWave: 20,
    unlock: 'advanced_consumables',
  },
  {
    id: 3,
    name: 'Glass Citadel',
    emoji: '🏰',
    theme: 'Fractured crystal halls and elite sentinels.',
    startWave: 21,
    endWave: 30,
    bossWave: 30,
    unlock: 'mythic_equipment',
  },
  {
    id: 4,
    name: 'Storm Abyss',
    emoji: '🌩️',
    theme: 'Tempest-choked void where captains become legends.',
    startWave: 31,
    endWave: 40,
    bossWave: 40,
    unlock: null,
  },
  {
    id: 5,
    name: 'Crownfall Depths',
    emoji: '👑',
    theme: 'Sunken imperial vaults guarded by ancient kings.',
    startWave: 41,
    endWave: 50,
    bossWave: 50,
    unlock: null,
  },
  {
    id: 6,
    name: 'Eternal Eclipse',
    emoji: '🌑',
    theme: 'The horizon where mythic armies march forever.',
    startWave: 51,
    endWave: Number.MAX_SAFE_INTEGER,
    bossWave: 60,
    unlock: null,
  },
];

export function getActForWave(wave: number): ActConfig {
  return ACTS.find(act => wave >= act.startWave && wave <= act.endWave) ?? ACTS[ACTS.length - 1];
}

export function getBossUnlockForWave(wave: number): PermanentUnlockId | null {
  const act = ACTS.find(a => a.bossWave === wave);
  return act?.unlock ?? null;
}

export function unlockLabel(unlock: PermanentUnlockId): string {
  return {
    class_passive: 'Class Passive Unlocked',
    advanced_consumables: 'Advanced Consumables Unlocked',
    mythic_equipment: 'Mythic Equipment Tier Unlocked',
  }[unlock];
}

export interface ClassPassive {
  id: string;
  name: string;
  description: string;
  dpsMultiplier: number;
  incomingDamageMultiplier: number;
}

export const CLASS_PASSIVES: Record<PlayerClass, ClassPassive> = {
  warrior: {
    id: 'frontline_ward',
    name: 'Frontline Ward',
    description: 'Hardened formation reduces all incoming team damage by 15%.',
    dpsMultiplier: 1.02,
    incomingDamageMultiplier: 0.85,
  },
  berserker: {
    id: 'blood_frenzy',
    name: 'Blood Frenzy',
    description: 'Relentless assault amplifies total team DPS by 18%, but takes 5% more damage.',
    dpsMultiplier: 1.18,
    incomingDamageMultiplier: 1.05,
  },
  archer: {
    id: 'marking_volley',
    name: 'Marking Volley',
    description: 'Precision fire boosts team DPS by 14%.',
    dpsMultiplier: 1.14,
    incomingDamageMultiplier: 1.0,
  },
  mage: {
    id: 'arcane_barrier',
    name: 'Arcane Barrier',
    description: 'Protective weave cuts incoming damage by 12% and boosts DPS by 6%.',
    dpsMultiplier: 1.06,
    incomingDamageMultiplier: 0.88,
  },
  monk: {
    id: 'tranquil_aura',
    name: 'Tranquil Aura',
    description: 'Balanced stance grants 10% DPS and 8% mitigation.',
    dpsMultiplier: 1.1,
    incomingDamageMultiplier: 0.92,
  },
};

export function getClassPassive(playerClass: PlayerClass): ClassPassive {
  return CLASS_PASSIVES[playerClass];
}

export interface EquipmentItem {
  id: string;
  name: string;
  emoji: string;
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  allowedClasses: PlayerClass[];
  description: string;
  bonus: Partial<StatBlock>;
}

export interface EquipmentRarityConfig {
  id: EquipmentRarity;
  label: string;
  color: string;
  dropWeight: number;
}

export const EQUIPMENT_RARITIES: EquipmentRarityConfig[] = [
  { id: 'common', label: 'Common', color: '#B8B8B8', dropWeight: 60 },
  { id: 'rare', label: 'Rare', color: '#5DA8FF', dropWeight: 26 },
  { id: 'epic', label: 'Epic', color: '#B66BFF', dropWeight: 11 },
  { id: 'legendary', label: 'Legendary', color: '#FFB347', dropWeight: 3 },
  { id: 'mythic', label: 'Mythic', color: '#FF5B8A', dropWeight: 1 },
  { id: 'transcendent', label: 'Transcendent', color: '#00D4FF', dropWeight: 0.4 },
];

export const EQUIPMENT_CATALOG: EquipmentItem[] = [
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

export function getEquipmentItem(id: string): EquipmentItem | undefined {
  return EQUIPMENT_CATALOG.find(item => item.id === id);
}

export function equipmentRarityConfig(rarity: EquipmentRarity): EquipmentRarityConfig {
  return EQUIPMENT_RARITIES.find(r => r.id === rarity) ?? EQUIPMENT_RARITIES[0];
}

export function rollEquipmentRarity(random: number): EquipmentRarity {
  const totalWeight = EQUIPMENT_RARITIES.reduce((sum, r) => sum + r.dropWeight, 0);
  let cursor = random * totalWeight;
  for (const r of EQUIPMENT_RARITIES) {
    cursor -= r.dropWeight;
    if (cursor <= 0) return r.id;
  }
  return 'common';
}

export function rollEquipmentRarityByTier(
  random: number,
  mythicUnlocked: boolean,
  transcendentUnlocked = false,
): EquipmentRarity {
  const pool = EQUIPMENT_RARITIES.filter(r => {
    if (!mythicUnlocked && (r.id === 'mythic' || r.id === 'transcendent')) return false;
    if (!transcendentUnlocked && r.id === 'transcendent') return false;
    return true;
  });
  const totalWeight = pool.reduce((sum, r) => sum + r.dropWeight, 0);
  let cursor = random * totalWeight;
  for (const r of pool) {
    cursor -= r.dropWeight;
    if (cursor <= 0) return r.id;
  }
  return 'common';
}

export function getNextEquipmentRarity(rarity: EquipmentRarity): EquipmentRarity | null {
  const chain: Record<EquipmentRarity, EquipmentRarity | null> = {
    common: 'rare',
    rare: 'epic',
    epic: 'legendary',
    legendary: 'mythic',
    mythic: 'transcendent',
    transcendent: null,
  };
  return chain[rarity];
}

export function getStarterEquipmentForClass(playerClass: PlayerClass): string[] {
  const rank: Record<EquipmentRarity, number> = {
    common: 0,
    rare: 1,
    epic: 2,
    legendary: 3,
    mythic: 4,
    transcendent: 5,
  };

  const classItems = EQUIPMENT_CATALOG.filter(item => item.allowedClasses.includes(playerClass));
  const pickForSlot = (slot: EquipmentSlot): string | null => {
    const slotItems = classItems.filter(item => item.slot === slot).sort((a, b) => rank[a.rarity] - rank[b.rarity]);
    return slotItems[0]?.id ?? null;
  };

  return (['weapon', 'armor', 'accessory'] as EquipmentSlot[])
    .map(slot => pickForSlot(slot))
    .filter((id): id is string => !!id);
}

export type UsableItemEffect =
  | 'heal_team_percent'
  | 'gain_gold_flat'
  | 'gain_exp_flat'
  | 'gain_shards_flat'
  | 'reduce_heat_flat'
  | 'gain_vip_points_flat';
export type UsableItemType = 'basic' | 'advanced';

export interface UsableItem {
  id: string;
  name: string;
  emoji: string;
  description: string;
  itemType: UsableItemType;
  effect: UsableItemEffect;
  value: number;
  dropWeight: number;
}

export const USABLE_ITEMS: UsableItem[] = [
  {
    id: 'small_potion',
    name: 'Small Vital Potion',
    emoji: '🧪',
    description: 'Restore 35% team HP instantly.',
    itemType: 'basic',
    effect: 'heal_team_percent',
    value: 0.35,
    dropWeight: 45,
  },
  {
    id: 'gold_cache',
    name: 'Gold Cache',
    emoji: '💰',
    description: 'Instantly grants 350 gold.',
    itemType: 'basic',
    effect: 'gain_gold_flat',
    value: 350,
    dropWeight: 28,
  },
  {
    id: 'exp_scroll',
    name: 'Training Scroll',
    emoji: '📜',
    description: 'Instantly grants 220 EXP.',
    itemType: 'basic',
    effect: 'gain_exp_flat',
    value: 220,
    dropWeight: 20,
  },
  {
    id: 'shard_cluster',
    name: 'Shard Cluster',
    emoji: '💠',
    description: 'Instantly grants 60 hero shards.',
    itemType: 'basic',
    effect: 'gain_shards_flat',
    value: 60,
    dropWeight: 7,
  },
  {
    id: 'grand_potion',
    name: 'Grand Vital Elixir',
    emoji: '🧴',
    description: 'Restore 65% team HP instantly.',
    itemType: 'advanced',
    effect: 'heal_team_percent',
    value: 0.65,
    dropWeight: 26,
  },
  {
    id: 'vault_cache',
    name: 'Imperial Vault Cache',
    emoji: '🏦',
    description: 'Instantly grants 1200 gold.',
    itemType: 'advanced',
    effect: 'gain_gold_flat',
    value: 1200,
    dropWeight: 14,
  },
  {
    id: 'coolant_mk1',
    name: 'Coolant Capsule I',
    emoji: '🧊',
    description: 'Premium: reduce combat heat by 35.',
    itemType: 'advanced',
    effect: 'reduce_heat_flat',
    value: 35,
    dropWeight: 0,
  },
  {
    id: 'coolant_mk2',
    name: 'Coolant Capsule II',
    emoji: '❄️',
    description: 'Premium: reduce combat heat by 75.',
    itemType: 'advanced',
    effect: 'reduce_heat_flat',
    value: 75,
    dropWeight: 0,
  },
];

export function getUsableItem(id: string): UsableItem | undefined {
  return USABLE_ITEMS.find(item => item.id === id);
}

export function rollUsableItem(random: number, advancedUnlocked: boolean): UsableItem {
  const pool = advancedUnlocked ? USABLE_ITEMS : USABLE_ITEMS.filter(item => item.itemType === 'basic');
  const totalWeight = pool.reduce((sum, item) => sum + item.dropWeight, 0);
  let cursor = random * totalWeight;
  for (const item of pool) {
    cursor -= item.dropWeight;
    if (cursor <= 0) return item;
  }
  return pool[0];
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'godly' | 'transcendent';

export interface RarityConfig {
  id: Rarity;
  label: string;
  color: string;
  chance: number; // out of 1
  boostMultiplier: number;
}

export const RARITIES: RarityConfig[] = [
  { id: 'common', label: 'Common', color: '#B8B8B8', chance: 0.499, boostMultiplier: 1.0 },
  { id: 'uncommon', label: 'Uncommon', color: '#6DDB7B', chance: 0.25, boostMultiplier: 1.15 },
  { id: 'rare', label: 'Rare', color: '#5DA8FF', chance: 0.13, boostMultiplier: 1.35 },
  { id: 'epic', label: 'Epic', color: '#B66BFF', chance: 0.07, boostMultiplier: 1.6 },
  { id: 'legendary', label: 'Legendary', color: '#FFB347', chance: 0.03, boostMultiplier: 1.95 },
  { id: 'mythic', label: 'Mythic', color: '#FF5B8A', chance: 0.015, boostMultiplier: 2.35 },
  { id: 'godly', label: 'Godly', color: '#FFE76A', chance: 0.005, boostMultiplier: 3.0 },
  { id: 'transcendent', label: 'Transcendent', color: '#00D4FF', chance: 0.001, boostMultiplier: 3.55 },
];

export interface FeaturedSummonBanner {
  id: string;
  title: string;
  description: string;
  featuredHeroId: string;
  artEmoji: string;
}

export const FEATURED_SUMMON_BANNERS: FeaturedSummonBanner[] = [
  {
    id: 'astral-vanguard',
    title: 'Astral Vanguard',
    description: 'Void command mobilized for precision warfront strikes.',
    featuredHeroId: 'h64',
    artEmoji: '🌌',
  },
  {
    id: 'worldrend-ascendant',
    title: 'Worldrend Ascendant',
    description: 'Frontline cataclysm specialists break siege lines.',
    featuredHeroId: 'h61',
    artEmoji: '🗻',
  },
  {
    id: 'abyssal-tide',
    title: 'Abyssal Tide',
    description: 'Berserker leviathans surge through fractured gates.',
    featuredHeroId: 'h62',
    artEmoji: '🌊',
  },
  {
    id: 'sunflame-flight',
    title: 'Sunflame Flight',
    description: 'Skyborn marksmen dominate extreme-range execution.',
    featuredHeroId: 'h63',
    artEmoji: '🦅',
  },
  {
    id: 'eternal-cycle',
    title: 'Eternal Cycle',
    description: 'Monastic avatars reset fate with impossible tempo.',
    featuredHeroId: 'h65',
    artEmoji: '♾️',
  },
  {
    id: 'time-hegemony',
    title: 'Time Hegemony',
    description: 'Chrono-casters lock timelines around elite targets.',
    featuredHeroId: 'h57',
    artEmoji: '⏰',
  },
  {
    id: 'imperial-fall',
    title: 'Imperial Fall',
    description: 'Crown-era warlords reclaim ruined dynastic thrones.',
    featuredHeroId: 'h52',
    artEmoji: '👑',
  },
];

export function getDailyFeaturedSummonBanner(nowMs = Date.now()): FeaturedSummonBanner {
  const dayIndex = Math.floor(nowMs / 86_400_000);
  const idx =
    ((dayIndex % FEATURED_SUMMON_BANNERS.length) + FEATURED_SUMMON_BANNERS.length) % FEATURED_SUMMON_BANNERS.length;
  return FEATURED_SUMMON_BANNERS[idx];
}

export function getHeroTemplateById(heroId: string): HeroTemplate | undefined {
  return HERO_POOL.find(hero => hero.id === heroId);
}

const HERO_BACKSTORIES: Record<string, string> = {
  h1: 'Kael Ironheart held the breach at Blackgate for three days with a shattered shield and a single oath: no civilian falls while he still stands.',
  h2: 'Mira Oathguard was the youngest captain ever sworn to the Crownfall Wall and secretly funded refugee caravans with her campaign stipends.',
  h3: 'Drogan Ashfury was exiled for refusing a staged duel and returned years later to save the same clan that cast him out.',
  h4: 'Thorn Bloodhide stitched his own war mantle from the hides of siege beasts and now leads frontline charges in silence.',
  h5: 'Sylvi Windmark learned to read storm drafts by sleeping in watchtowers and can split a moving target at full gallop.',
  h6: 'Riven Hawkeye once served as a royal execution archer and now uses that precision against tyrants instead of prisoners.',
  h7: 'Lunara Frostweave froze a collapsing bridge long enough for an entire battalion to cross and never speaks of the cost.',
  h8: 'Aziel Embermind was a court pyromancer who burned his own rank sigil after refusing to torch a rebel district.',
  h9: 'Shen Dawnfist defended a monastery granary through a seven-day siege using only open-hand forms and improvised staves.',
  h10: 'Iria Lotusveil preserved forbidden healing sutras by encoding them into prayer choreography taught only at dawn.',
  h11: 'Borin Stonewall is a quarry-born veteran who names each suit of armor after the village it protects.',
  h12: 'Karra Rageborn survived the Red Pit trials at sixteen and now channels that fury to break slaver battalions.',
  h13: 'Nyx Whisperleaf ran courier routes through occupied forests, mapping every patrol path from memory.',
  h14: 'Vex Starchant rebuilt a ruined observatory into a battlefield command post powered by prism relays.',
  h15: 'Tarin Sunstep turned a ceremonial dance discipline into a mobile combat doctrine used by temple guards.',
  h16: 'Orin Bastionforge is a smith-general who tempers armor in ashwater and tests every plate in live drills.',
  h17: 'Selene Ironbanner reclaimed three fallen standards in one night raid and became a symbol of stubborn resistance.',
  h18: 'Varric Doomhowl was raised in war camps and can identify enemy banners by horn cadence alone.',
  h19: 'Morga Chainstorm broke her captor legions by turning their own chainfields into trap corridors.',
  h20: 'Aela Windpierce trained with cliff rangers and specializes in anti-commander shots beyond normal sight lines.',
  h21: 'Kestrel Moonshot marks targets by moon angle and once ended a naval siege with three impossible arrows.',
  h22: 'Seris Riftborn survived a laboratory collapse that fused void scar tissue into her casting channels.',
  h23: 'Noctis Emberveil was a siege lanternkeeper who learned to weaponize beacon fire into precision spell bursts.',
  h24: 'Korin Stillwater mediates feuds between rival houses by day and breaks their mercenary lines by night.',
  h25: 'Maeve Stormpalm perfected thunder-breath kata after losing her hearing in a temple collapse.',
  h26: 'Gideon Flamecrest commanded the Ember Watch and abandoned nobility titles to stay with his rank-and-file unit.',
  h27: 'Rook Ashrender dismantled an entire war machine convoy using salvaged powder and timed ambushes.',
  h28: 'Lyra Starquill is a battlefield cartographer whose star charts double as long-range firing solutions.',
  h29: 'Eldrin Palefire studied mortuary rites and now bends soul-lamps into defensive wards for civilians.',
  h30: 'Jin Hollowreed trained in floodplains where every stance must adapt to unstable footing and shifting currents.',
  h31: 'Thors Ironpeak was a mine guard who organized worker militias when the barons hired private armies.',
  h32: 'Valkyra Shieldborn forged pact shields for orphan cohorts and treats every squadmate as sworn kin.',
  h33: 'Brutus Ironjaw won pit titles across five provinces before defecting to fight for frontier settlements.',
  h34: 'Magus Stonereave channels seismic shock through gauntlets etched with quarry sigils of his ancestors.',
  h35: 'Vesper Silverbow served in traveling caravans and became famous for shooting while mounted at full sprint.',
  h36: 'Fenwick Swiftbrand pioneered relay skirmish tactics that rotate archers in waves to maintain constant pressure.',
  h37: 'Thalia Duskborn studied eclipse rituals and turned them into stealth spell doctrine for night assaults.',
  h38: 'Corvus Nightwhisper intercepted imperial cipher traffic and rewrote battlefield orders before dawn.',
  h39: 'Kalen Dawnbringer rebuilt a shattered monastery wall by hand and then defended it through winter offensives.',
  h40: 'Sera Veilwanderer crossed plague quarantines with medicine convoys and refused every order to withdraw.',
  h41: 'Karthus Soulforge binds memory shards into his blade, carrying the resolve of every fallen comrade.',
  h42: 'Azura Dawnbearer is heir to a dissolved house and now fights to build a republic instead of a throne.',
  h43: 'Viktor Darkbane hunted warlords across border ruins and leaves no fortress with its command intact.',
  h44: 'Morgath Terrorforge once led a fear cult militia before turning on its prophets and burning their sanctums.',
  h45: 'Zara Voidarchress learned vacuum-shot archery on collapsed skybridges where one misstep means death.',
  h46: 'Kastor Deathmark served as a bounty warden and now uses those dossiers to dismantle corrupt command chains.',
  h47: 'Iris Veilbearer shields entire formations with layered prism veils tuned to enemy tempo.',
  h48: 'Arctus Frostking mastered cryo-siege doctrine and can halt armored advances with staged ice fractures.',
  h49: 'Sorena Lightfury combines solar breath forms with shock-step footwork to crack elite lines.',
  h50: 'Orion Soulshaper guides broken veterans through recovery rites and returns them to battle stronger.',
  h51: 'Aethermaw Unbounded emerged from the Eclipse Front carrying relic scales and a doctrine built for extinction wars.',
  h52: 'Seraph the Infinite abandoned celestial office to stand with mortal ranks against collapsing empires.',
  h53: 'Ragnar Hellborn was raised in abyssal arenas and now treats every warlord citadel as another ring to conquer.',
  h54: 'Vyxara Shadow Empress ruled a covert syndicate before redirecting its network toward anti-tyrant operations.',
  h55: 'Zephyr Starreacher commands high-altitude strike wings and is known for ending battles before first impact.',
  h56: 'Nyx Void Chosen infiltrated cult command circles for years and collapsed them from the inside in one night.',
  h57: 'Archaon Time Weaver maps probable futures in combat and chooses the branch where civilians survive.',
  h58: 'Pyritess Eternal Flame carries a furnace heart relic that turns battlefield panic into focused output.',
  h59: 'Luminion Stellarch rebuilt the Stellar Cloister and trains monk officers for multi-front command.',
  h60: 'Void Sovereign returned from the Rift March with a vow to seal every breach before another age is erased.',
  h61: 'Titan Worldrender was forged in orbital siege furnaces and now shatters god-plate battalions at the spearhead.',
  h62: 'Leviathan Depths rose from abyssal trenches to break fleet fortresses with tidal-impact assault doctrine.',
  h63: 'Phoenix Eternal leads skyfire hunter cadres and has survived more confirmed downings than any living archer.',
  h64: 'Celestial Architect rewrites battle geometry in real time, turning impossible theaters into executable plans.',
  h65: 'Dharma Eternal Cycle guards the Last Wheel archive, preserving combat wisdom across rebirth eras.',
};

type LegacyHeroUniqueEffectFamily = 'frontline' | 'ranger' | 'arcane' | 'monk';
type HeroUniqueEffectFamily =
  | 'bastion'
  | 'convoy'
  | 'onslaught'
  | 'phalanx'
  | 'command'
  | 'cataclysm'
  | 'judgment'
  | 'ambush'
  | 'execution'
  | 'oracle'
  | 'sanctuary'
  | 'harvest'
  | 'spellfire'
  | 'chronicle';

interface HeroUniqueCombatModifiers {
  dpsMult: number;
  goldMult: number;
  expMult: number;
  incomingDmgMult: number;
}

// ── Unique Weapon Active Skills ───────────────────────────────────────────

/**
 * When a hero's unique weapon is equipped, their generic archetype skill
 * is replaced by a signature combat skill. Each hero gets one of these types
 * with custom parameters.
 */
export type UniqueSkillType =
  | 'shield_wall' // massive DR shield, longer than ward
  | 'execute' // deal % of monster MISSING HP as damage
  | 'rallying_cry' // DPS buff + heal combo
  | 'soul_drain' // damage + self-heal based on damage dealt
  | 'crit_storm' // multiple rapid hits (burst DPS)
  | 'mark_prey' // debuff monster: take more damage for duration
  | 'chain_lightning' // instant burst + lingering DoT (DPS buff)
  | 'barrier_pulse' // shield + heal team
  | 'armor_shred' // reduce monster defense, boost team DPS briefly
  | 'overcharge'; // massive single hit based on hero's own DPS contribution

export interface UniqueSkillParams {
  type: UniqueSkillType;
  /** Skill-specific primary value (meaning depends on type). */
  power: number;
  /** Duration in ms for timed effects. */
  durationMs: number;
  /** Custom cooldown override in ms (default: archetype cooldown). */
  cooldownMs: number;
}

interface HeroUniqueWeaponProfile {
  weaponName: string;
  skillName: string;
  skillFlavor: string;
  effectFamily?: HeroUniqueEffectFamily | LegacyHeroUniqueEffectFamily;
  uniqueSkill: UniqueSkillParams;
}

const HERO_UNIQUE_WEAPONS: Record<string, HeroUniqueWeaponProfile> = {
  // ── Tier 1 ──────────────────────────────────────────────────────────────
  h1: {
    weaponName: 'Blackgate Oathwall',
    skillName: 'Last Stand of Blackgate',
    skillFlavor: 'Turns a broken line into an unbreakable defense.',
    uniqueSkill: { type: 'shield_wall', power: 0.3, durationMs: 4000, cooldownMs: 10000 },
  },
  h2: {
    weaponName: 'Crownfall Convoy Shield',
    skillName: 'Refuge Keeper',
    skillFlavor: 'Marches protection forward with every rescued soul.',
    uniqueSkill: { type: 'barrier_pulse', power: 0.1, durationMs: 3500, cooldownMs: 9000 },
  },
  h3: {
    weaponName: "Exile's Redress",
    skillName: 'Ashen Return',
    skillFlavor: 'Punishes any clan that mistakes mercy for weakness.',
    uniqueSkill: { type: 'armor_shred', power: 0.2, durationMs: 4000, cooldownMs: 8000 },
  },
  h4: {
    weaponName: 'Siegehide Mantleaxe',
    skillName: 'Beastwall Charge',
    skillFlavor: 'Drives forward behind the weight of hunted war beasts.',
    uniqueSkill: { type: 'rallying_cry', power: 0.2, durationMs: 4000, cooldownMs: 9000 },
  },
  h5: {
    weaponName: 'Gale-Sleeper Longbow',
    skillName: 'Stormdraft Split',
    skillFlavor: 'Reads wind shear before the arrow ever leaves the string.',
    uniqueSkill: { type: 'crit_storm', power: 0.06, durationMs: 0, cooldownMs: 7000 },
  },
  h6: {
    weaponName: "Tyrant's Last Verdict",
    skillName: 'Reversed Sentence',
    skillFlavor: 'Executes oppressors with the same precision once used on prisoners.',
    uniqueSkill: { type: 'execute', power: 0.12, durationMs: 0, cooldownMs: 7000 },
  },
  h7: {
    weaponName: 'Bridge of White Silence',
    skillName: 'Frostspan Miracle',
    skillFlavor: 'Freezes catastrophe into a path for allies to cross.',
    uniqueSkill: { type: 'barrier_pulse', power: 0.12, durationMs: 3500, cooldownMs: 6000 },
  },
  h8: {
    weaponName: 'Brandless Censer',
    skillName: 'Rebel Pyre',
    skillFlavor: 'Turns forbidden fire against the rulers who ordered it.',
    uniqueSkill: { type: 'chain_lightning', power: 0.1, durationMs: 3000, cooldownMs: 7000 },
  },
  h9: {
    weaponName: 'Granary Wardstaff',
    skillName: 'Seven-Day Hold',
    skillFlavor: 'Finds endurance in hunger, rubble, and bare hands.',
    uniqueSkill: { type: 'shield_wall', power: 0.25, durationMs: 4500, cooldownMs: 8000 },
  },
  h10: {
    weaponName: 'Dawnscript Veils',
    skillName: 'Sutra at First Light',
    skillFlavor: 'Unfolds lost healing doctrine through sacred movement.',
    uniqueSkill: { type: 'barrier_pulse', power: 0.1, durationMs: 4000, cooldownMs: 8000 },
  },
  h11: {
    weaponName: 'Village-Name Plate',
    skillName: 'Hearthwall Ledger',
    skillFlavor: 'Carries every protected settlement into the next defense.',
    uniqueSkill: { type: 'shield_wall', power: 0.35, durationMs: 4000, cooldownMs: 10000 },
  },
  h12: {
    weaponName: 'Pitscar Reaver',
    skillName: 'Red Pit Breakout',
    skillFlavor: 'Turns trial scars into momentum that cannot be chained.',
    uniqueSkill: { type: 'soul_drain', power: 0.08, durationMs: 0, cooldownMs: 7000 },
  },
  h13: {
    weaponName: "Occupier's Blind",
    skillName: 'Whisper Route',
    skillFlavor: 'Shoots along the hidden paths only a courier survivor remembers.',
    uniqueSkill: { type: 'mark_prey', power: 0.22, durationMs: 4000, cooldownMs: 8000 },
  },
  h14: {
    weaponName: 'Prism Command Lattice',
    skillName: 'Observatory Overwatch',
    skillFlavor: 'Converts star math into battlefield certainty.',
    uniqueSkill: { type: 'barrier_pulse', power: 0.12, durationMs: 4000, cooldownMs: 6000 },
  },
  h15: {
    weaponName: 'Sunstep Warfan',
    skillName: 'Processional Breaker',
    skillFlavor: 'Refines ceremonial grace into a marching combat rhythm.',
    uniqueSkill: { type: 'rallying_cry', power: 0.2, durationMs: 4500, cooldownMs: 9000 },
  },
  h16: {
    weaponName: 'Ashwater Testhammer',
    skillName: 'Live-Drill Temper',
    skillFlavor: 'Hits with the certainty of steel proven under real fire.',
    uniqueSkill: { type: 'shield_wall', power: 0.3, durationMs: 3800, cooldownMs: 9500 },
  },
  h17: {
    weaponName: 'Night-Raid Standard',
    skillName: 'Third Banner Rising',
    skillFlavor: 'Raises morale the instant a fallen line is reclaimed.',
    uniqueSkill: { type: 'rallying_cry', power: 0.22, durationMs: 4200, cooldownMs: 9000 },
  },
  h18: {
    weaponName: 'Hornblood Cleaver',
    skillName: 'Camp-Horn Reading',
    skillFlavor: 'Breaks enemy tempo by hearing command patterns before they crest.',
    uniqueSkill: { type: 'mark_prey', power: 0.2, durationMs: 4000, cooldownMs: 8000 },
  },
  h19: {
    weaponName: 'Chainfield Sever',
    skillName: 'Corridor of Hooks',
    skillFlavor: 'Turns enemy restraint into a killing lane.',
    uniqueSkill: { type: 'crit_storm', power: 0.06, durationMs: 0, cooldownMs: 6500 },
  },
  h20: {
    weaponName: 'Cliffline Talonbow',
    skillName: 'Far-Sight Execution',
    skillFlavor: 'Punishes commanders who believe distance is safety.',
    uniqueSkill: { type: 'execute', power: 0.12, durationMs: 0, cooldownMs: 7000 },
  },
  h21: {
    weaponName: 'Lunar Trident Bow',
    skillName: 'Three Arrows to Midnight',
    skillFlavor: 'Aligns impossible shots to the cold math of moonlight.',
    uniqueSkill: { type: 'overcharge', power: 0.15, durationMs: 0, cooldownMs: 8000 },
  },
  h22: {
    weaponName: 'Scarwell Focus',
    skillName: 'Riftfused Channel',
    skillFlavor: 'Makes void damage flow through wounds that never fully closed.',
    effectFamily: 'arcane',
    uniqueSkill: { type: 'chain_lightning', power: 0.1, durationMs: 3000, cooldownMs: 7000 },
  },
  h23: {
    weaponName: 'Beaconrend Lantern',
    skillName: 'Lantern Burst',
    skillFlavor: 'Condenses siege-signal fire into disciplined devastation.',
    effectFamily: 'arcane',
    uniqueSkill: { type: 'chain_lightning', power: 0.08, durationMs: 3500, cooldownMs: 7000 },
  },
  h24: {
    weaponName: 'Treatybreaker Hands',
    skillName: 'Stillwater Verdict',
    skillFlavor: 'Delivers the judgment diplomacy could not secure.',
    effectFamily: 'monk',
    uniqueSkill: { type: 'barrier_pulse', power: 0.1, durationMs: 4000, cooldownMs: 6000 },
  },
  h25: {
    weaponName: 'Thunderbreath Tonfa',
    skillName: 'Silent Storm Form',
    skillFlavor: 'Lets motion speak where hearing no longer can.',
    effectFamily: 'monk',
    uniqueSkill: { type: 'armor_shred', power: 0.2, durationMs: 3500, cooldownMs: 8000 },
  },
  h26: {
    weaponName: 'Emberwatch Greatblade',
    skillName: 'Rankfire Command',
    skillFlavor: 'Burns brighter when held beside common soldiers.',
    uniqueSkill: { type: 'rallying_cry', power: 0.2, durationMs: 4000, cooldownMs: 9000 },
  },
  h27: {
    weaponName: 'Convoy-Breaker Rig',
    skillName: 'Ashrender Ambush',
    skillFlavor: 'Turns scavenged ruin into perfect demolition timing.',
    uniqueSkill: { type: 'overcharge', power: 0.18, durationMs: 0, cooldownMs: 7500 },
  },
  h28: {
    weaponName: 'Starplot Recurve',
    skillName: "Cartographer's Answer",
    skillFlavor: 'Fires where the chart says the future will stand.',
    effectFamily: 'ranger',
    uniqueSkill: { type: 'mark_prey', power: 0.22, durationMs: 4000, cooldownMs: 7500 },
  },
  h29: {
    weaponName: 'Soul-Lamp Reliquary',
    skillName: 'Palefire Ward',
    skillFlavor: 'Binds mourning rites into protection for the living.',
    effectFamily: 'arcane',
    uniqueSkill: { type: 'barrier_pulse', power: 0.12, durationMs: 4000, cooldownMs: 6000 },
  },
  h30: {
    weaponName: 'Floodstep Reedstaff',
    skillName: 'Hollowreed Current',
    skillFlavor: 'Flows through unstable terrain without ever surrendering balance.',
    effectFamily: 'monk',
    uniqueSkill: { type: 'shield_wall', power: 0.25, durationMs: 4500, cooldownMs: 9000 },
  },
  // ── Tier 2 ──────────────────────────────────────────────────────────────
  h31: {
    weaponName: "Baron's End Pickblade",
    skillName: 'Ironpeak Uprising',
    skillFlavor: 'Turns labor tools into the start of revolt.',
    uniqueSkill: { type: 'armor_shred', power: 0.22, durationMs: 4000, cooldownMs: 8500 },
  },
  h32: {
    weaponName: 'Kinshield Pactblade',
    skillName: 'Orphan Phalanx',
    skillFlavor: 'Fights as though every ally were sworn family.',
    uniqueSkill: { type: 'shield_wall', power: 0.3, durationMs: 4000, cooldownMs: 9000 },
  },
  h33: {
    weaponName: 'Five-Province Jawmaul',
    skillName: "Pit Defector's Rush",
    skillFlavor: 'Carries arena brutality into wars that finally matter.',
    uniqueSkill: { type: 'crit_storm', power: 0.07, durationMs: 0, cooldownMs: 6500 },
  },
  h34: {
    weaponName: 'Quarrysigil Fists',
    skillName: 'Seismic Recall',
    skillFlavor: 'Calls old stone-markings back as living shockwaves.',
    uniqueSkill: { type: 'overcharge', power: 0.18, durationMs: 0, cooldownMs: 7500 },
  },
  h35: {
    weaponName: 'Caravan Halo Bow',
    skillName: 'Silversprint',
    skillFlavor: 'Keeps perfect aim even at full mounted speed.',
    effectFamily: 'ranger',
    uniqueSkill: { type: 'crit_storm', power: 0.07, durationMs: 0, cooldownMs: 6500 },
  },
  h36: {
    weaponName: 'Relaybrand Repeater',
    skillName: 'Rotating Pressure',
    skillFlavor: 'Maintains relentless ranged tempo through disciplined cycling.',
    effectFamily: 'ranger',
    uniqueSkill: { type: 'mark_prey', power: 0.25, durationMs: 4500, cooldownMs: 7500 },
  },
  h37: {
    weaponName: 'Eclipse Catechism',
    skillName: 'Duskborn Veil',
    skillFlavor: 'Turns ritual shadow into surgical spell cover.',
    effectFamily: 'arcane',
    uniqueSkill: { type: 'soul_drain', power: 0.1, durationMs: 0, cooldownMs: 7000 },
  },
  h38: {
    weaponName: 'Dawnthief Corvid Seal',
    skillName: 'Nightwhisper Rewrite',
    skillFlavor: "Steals the enemy's next command before it is spoken.",
    effectFamily: 'arcane',
    uniqueSkill: { type: 'mark_prey', power: 0.22, durationMs: 4000, cooldownMs: 7500 },
  },
  h39: {
    weaponName: 'Winterwall Sunstaff',
    skillName: 'Dawn Masonry',
    skillFlavor: 'Builds a defense and becomes its first guardian.',
    effectFamily: 'monk',
    uniqueSkill: { type: 'shield_wall', power: 0.28, durationMs: 4000, cooldownMs: 9000 },
  },
  h40: {
    weaponName: 'Quarantine Veilblades',
    skillName: 'No Retreat Convoy',
    skillFlavor: 'Cuts a safe road where plague and fear say to turn back.',
    effectFamily: 'monk',
    uniqueSkill: { type: 'barrier_pulse', power: 0.12, durationMs: 4000, cooldownMs: 6000 },
  },
  // ── Tier 3 ──────────────────────────────────────────────────────────────
  h41: {
    weaponName: 'Memory-Anvil Greatsword',
    skillName: 'Fallen Chorus',
    skillFlavor: 'Strikes with the will of comrades preserved inside the steel.',
    uniqueSkill: { type: 'soul_drain', power: 0.12, durationMs: 0, cooldownMs: 7000 },
  },
  h42: {
    weaponName: 'Republic Dawn',
    skillName: 'House Without Throne',
    skillFlavor: 'Fights for a future that outlives noble bloodlines.',
    uniqueSkill: { type: 'rallying_cry', power: 0.25, durationMs: 4500, cooldownMs: 8500 },
  },
  h43: {
    weaponName: 'Ruinbreak Fangblade',
    skillName: 'Fortress Null',
    skillFlavor: 'Leaves command structures gutted and leaderless.',
    uniqueSkill: { type: 'execute', power: 0.15, durationMs: 0, cooldownMs: 6500 },
  },
  h44: {
    weaponName: 'Sanctumrend Idol-Axe',
    skillName: 'Prophetbreaker Pyre',
    skillFlavor: 'Burns fear doctrine down and feeds on the collapse.',
    uniqueSkill: { type: 'armor_shred', power: 0.25, durationMs: 4000, cooldownMs: 8000 },
  },
  h45: {
    weaponName: 'Vacuumstring Bow',
    skillName: 'Skybridge Deadfall',
    skillFlavor: 'Shoots through empty air where hesitation means death.',
    effectFamily: 'ranger',
    uniqueSkill: { type: 'overcharge', power: 0.2, durationMs: 0, cooldownMs: 7000 },
  },
  h46: {
    weaponName: "Warden's Red Ledger",
    skillName: 'Dossier Collapse',
    skillFlavor: 'Turns old hunting records into a chain of command-kills.',
    effectFamily: 'ranger',
    uniqueSkill: { type: 'execute', power: 0.15, durationMs: 0, cooldownMs: 7000 },
  },
  h47: {
    weaponName: 'Prismheart Canopy',
    skillName: 'Tempo Veil',
    skillFlavor: "Layers protective light exactly against the enemy's rhythm.",
    effectFamily: 'arcane',
    uniqueSkill: { type: 'barrier_pulse', power: 0.15, durationMs: 4500, cooldownMs: 6000 },
  },
  h48: {
    weaponName: 'Cryo-Crown Scepter',
    skillName: 'Glacier Fault',
    skillFlavor: 'Breaks an advance by teaching the ground to freeze and split.',
    effectFamily: 'arcane',
    uniqueSkill: { type: 'chain_lightning', power: 0.12, durationMs: 3500, cooldownMs: 6500 },
  },
  h49: {
    weaponName: 'Lightfury Shockstaff',
    skillName: 'Solar Breach Step',
    skillFlavor: 'Combines radiant breath and impact footwork into one opening.',
    effectFamily: 'monk',
    uniqueSkill: { type: 'overcharge', power: 0.2, durationMs: 0, cooldownMs: 7000 },
  },
  h50: {
    weaponName: 'Soulreturn Mantra',
    skillName: "Veteran's Recall",
    skillFlavor: 'Pulls the broken back into the fight with renewed shape.',
    effectFamily: 'monk',
    uniqueSkill: { type: 'rallying_cry', power: 0.25, durationMs: 4500, cooldownMs: 7000 },
  },
  // ── Tier 4 ──────────────────────────────────────────────────────────────
  h51: {
    weaponName: 'Eclipse-Scale Halberd',
    skillName: 'Extinction Protocol',
    skillFlavor: 'Advances with the doctrine of wars meant to erase civilizations.',
    uniqueSkill: { type: 'armor_shred', power: 0.3, durationMs: 4500, cooldownMs: 8000 },
  },
  h52: {
    weaponName: 'Office of the Fallen Wing',
    skillName: 'Infinite Descent',
    skillFlavor: 'Trades celestial stature for absolute commitment to mortal lines.',
    uniqueSkill: { type: 'rallying_cry', power: 0.28, durationMs: 5000, cooldownMs: 8000 },
  },
  h53: {
    weaponName: 'Abyss Ringbreaker',
    skillName: 'Citadel Arena',
    skillFlavor: 'Treats every fortress as another circle to conquer.',
    uniqueSkill: { type: 'crit_storm', power: 0.1, durationMs: 0, cooldownMs: 6000 },
  },
  h54: {
    weaponName: 'Shadowcourt Headsman',
    skillName: 'Syndicate Reversal',
    skillFlavor: 'Redirects an empire of secrets into targeted regime collapse.',
    uniqueSkill: { type: 'mark_prey', power: 0.3, durationMs: 5000, cooldownMs: 7500 },
  },
  h55: {
    weaponName: 'First-Impact Railbow',
    skillName: 'Stratos Verdict',
    skillFlavor: 'Ends the battle before the enemy registers the opening exchange.',
    effectFamily: 'ranger',
    uniqueSkill: { type: 'execute', power: 0.18, durationMs: 0, cooldownMs: 6500 },
  },
  h56: {
    weaponName: 'Cultneedle Widowbow',
    skillName: 'One-Night Collapse',
    skillFlavor: 'Brings years of infiltration down in a single coordinated kill.',
    effectFamily: 'ranger',
    uniqueSkill: { type: 'soul_drain', power: 0.14, durationMs: 0, cooldownMs: 6500 },
  },
  h57: {
    weaponName: 'Branchkeeper Chronometer',
    skillName: 'Civilian Line',
    skillFlavor: 'Selects the future where the innocent remain standing.',
    effectFamily: 'arcane',
    uniqueSkill: { type: 'barrier_pulse', power: 0.18, durationMs: 5000, cooldownMs: 5500 },
  },
  h58: {
    weaponName: 'Furnaceheart Scepter',
    skillName: 'Panic to Flame',
    skillFlavor: 'Refines battlefield terror into controlled annihilation.',
    effectFamily: 'arcane',
    uniqueSkill: { type: 'chain_lightning', power: 0.15, durationMs: 4000, cooldownMs: 6000 },
  },
  h59: {
    weaponName: 'Stellarch Wheelstaff',
    skillName: 'Cloister Command',
    skillFlavor: 'Turns disciplined enlightenment into multi-front battle control.',
    effectFamily: 'monk',
    uniqueSkill: { type: 'rallying_cry', power: 0.28, durationMs: 5000, cooldownMs: 8000 },
  },
  h60: {
    weaponName: 'Riftseal Sovereign Rings',
    skillName: 'Age-End Closure',
    skillFlavor: 'Closes breaches with the force of a final imperial decree.',
    effectFamily: 'monk',
    uniqueSkill: { type: 'shield_wall', power: 0.4, durationMs: 5000, cooldownMs: 9000 },
  },
  // ── Tier 5 ──────────────────────────────────────────────────────────────
  h61: {
    weaponName: 'Orbital Furnace Pike',
    skillName: 'Godplate Sundering',
    skillFlavor: 'Breaks divine armor the way siege furnaces break ore.',
    uniqueSkill: { type: 'armor_shred', power: 0.35, durationMs: 5000, cooldownMs: 7500 },
  },
  h62: {
    weaponName: 'Trenchwake Guillotine',
    skillName: 'Tidal Citadel Crush',
    skillFlavor: 'Hits like an abyssal surge rolling over fortress walls.',
    uniqueSkill: { type: 'overcharge', power: 0.3, durationMs: 0, cooldownMs: 6000 },
  },
  h63: {
    weaponName: 'Downfall Sunwing',
    skillName: 'Skyfire Reprisal',
    skillFlavor: 'Returns from certain death as an airborne execution order.',
    effectFamily: 'ranger',
    uniqueSkill: { type: 'soul_drain', power: 0.18, durationMs: 0, cooldownMs: 6000 },
  },
  h64: {
    weaponName: 'Theaterframe Axiom',
    skillName: 'Impossible Geometry',
    skillFlavor: 'Rearranges the field until victory becomes structurally inevitable.',
    effectFamily: 'arcane',
    uniqueSkill: { type: 'chain_lightning', power: 0.18, durationMs: 4500, cooldownMs: 5500 },
  },
  h65: {
    weaponName: 'Last Wheel Naginata',
    skillName: 'Archive of Returns',
    skillFlavor: 'Carries preserved wisdom from one rebirth age into the next.',
    effectFamily: 'monk',
    uniqueSkill: { type: 'barrier_pulse', power: 0.2, durationMs: 5000, cooldownMs: 5500 },
  },
};

const HERO_UNIQUE_EFFECTS: Record<
  HeroUniqueEffectFamily,
  {
    label: string;
    dpsBasePct: number;
    dpsPerRankPct: number;
    goldBasePct?: number;
    goldPerRankPct?: number;
    expBasePct?: number;
    expPerRankPct?: number;
    mitigationBasePct?: number;
    mitigationPerRankPct?: number;
  }
> = {
  bastion: {
    label: 'Bastion Doctrine',
    dpsBasePct: 10,
    dpsPerRankPct: 3.2,
    mitigationBasePct: 9,
    mitigationPerRankPct: 1.8,
  },
  convoy: {
    label: 'Convoy Doctrine',
    dpsBasePct: 8,
    dpsPerRankPct: 2.8,
    goldBasePct: 9,
    goldPerRankPct: 1.8,
    mitigationBasePct: 4,
    mitigationPerRankPct: 1.0,
  },
  onslaught: {
    label: 'Onslaught Doctrine',
    dpsBasePct: 15,
    dpsPerRankPct: 4.4,
    mitigationBasePct: 5,
    mitigationPerRankPct: 1.0,
  },
  phalanx: {
    label: 'Phalanx Doctrine',
    dpsBasePct: 9,
    dpsPerRankPct: 3.0,
    mitigationBasePct: 11,
    mitigationPerRankPct: 1.8,
  },
  command: { label: 'Command Doctrine', dpsBasePct: 11, dpsPerRankPct: 3.3, goldBasePct: 6, goldPerRankPct: 1.5 },
  cataclysm: { label: 'Cataclysm Doctrine', dpsBasePct: 17, dpsPerRankPct: 4.8, expBasePct: 3, expPerRankPct: 1.0 },
  judgment: {
    label: 'Judgment Doctrine',
    dpsBasePct: 14,
    dpsPerRankPct: 4.0,
    mitigationBasePct: 3,
    mitigationPerRankPct: 0.8,
  },
  ambush: { label: 'Ambush Doctrine', dpsBasePct: 12, dpsPerRankPct: 3.5, goldBasePct: 8, goldPerRankPct: 1.8 },
  execution: { label: 'Execution Doctrine', dpsBasePct: 16, dpsPerRankPct: 4.6, goldBasePct: 3, goldPerRankPct: 1.0 },
  oracle: { label: 'Oracle Doctrine', dpsBasePct: 11, dpsPerRankPct: 3.4, expBasePct: 10, expPerRankPct: 2.0 },
  sanctuary: {
    label: 'Sanctuary Doctrine',
    dpsBasePct: 8,
    dpsPerRankPct: 2.8,
    expBasePct: 6,
    expPerRankPct: 1.5,
    mitigationBasePct: 10,
    mitigationPerRankPct: 1.6,
  },
  harvest: {
    label: 'Harvest Doctrine',
    dpsBasePct: 7,
    dpsPerRankPct: 2.6,
    goldBasePct: 11,
    goldPerRankPct: 2.2,
    expBasePct: 4,
    expPerRankPct: 1.0,
  },
  spellfire: { label: 'Spellfire Doctrine', dpsBasePct: 13, dpsPerRankPct: 3.8, expBasePct: 5, expPerRankPct: 1.2 },
  chronicle: {
    label: 'Chronicle Doctrine',
    dpsBasePct: 9,
    dpsPerRankPct: 3.0,
    expBasePct: 11,
    expPerRankPct: 2.2,
    mitigationBasePct: 6,
    mitigationPerRankPct: 1.1,
  },
};

function isModernHeroUniqueEffectFamily(
  value: HeroUniqueWeaponProfile['effectFamily'],
): value is HeroUniqueEffectFamily {
  if (!value) return false;
  return value in HERO_UNIQUE_EFFECTS;
}

function getHeroUniqueEffectFamily(heroId: string): HeroUniqueEffectFamily {
  const profile = HERO_UNIQUE_WEAPONS[heroId];
  if (isModernHeroUniqueEffectFamily(profile?.effectFamily)) return profile.effectFamily;
  const hero = getHeroTemplateById(heroId);
  if (!hero) return 'bastion';

  if (hero.activeSkillArchetype === 'frontline_ward' && hero.passiveTrait === 'bulwark_instinct') return 'bastion';
  if (hero.activeSkillArchetype === 'frontline_ward' && hero.passiveTrait === 'fortune_hunter') return 'convoy';
  if (hero.activeSkillArchetype === 'frontline_ward' && hero.passiveTrait === 'warpath_instinct') return 'onslaught';
  if (hero.activeSkillArchetype === 'frontline_ward' && hero.passiveTrait === 'sage_instinct') return 'chronicle';
  if (hero.activeSkillArchetype === 'battle_chant' && hero.passiveTrait === 'bulwark_instinct') return 'phalanx';
  if (hero.activeSkillArchetype === 'battle_chant' && hero.passiveTrait === 'fortune_hunter') return 'command';
  if (hero.activeSkillArchetype === 'battle_chant' && hero.passiveTrait === 'warpath_instinct') return 'cataclysm';
  if (hero.activeSkillArchetype === 'battle_chant' && hero.passiveTrait === 'sage_instinct') return 'chronicle';
  if (hero.activeSkillArchetype === 'burst_volley' && hero.passiveTrait === 'bulwark_instinct') return 'judgment';
  if (hero.activeSkillArchetype === 'burst_volley' && hero.passiveTrait === 'fortune_hunter') return 'ambush';
  if (hero.activeSkillArchetype === 'burst_volley' && hero.passiveTrait === 'warpath_instinct') return 'execution';
  if (hero.activeSkillArchetype === 'burst_volley' && hero.passiveTrait === 'sage_instinct') return 'oracle';
  if (hero.activeSkillArchetype === 'mending_pulse' && hero.passiveTrait === 'bulwark_instinct') return 'sanctuary';
  if (hero.activeSkillArchetype === 'mending_pulse' && hero.passiveTrait === 'fortune_hunter') return 'harvest';
  if (hero.activeSkillArchetype === 'mending_pulse' && hero.passiveTrait === 'warpath_instinct') return 'spellfire';
  return 'chronicle';
}

function clampHeroUniqueRank(rank: number): number {
  return Math.max(1, Math.min(10, Math.floor(rank)));
}

export function getHeroBackstory(heroId: string): string {
  const hero = getHeroTemplateById(heroId);
  if (!hero) return 'A nameless wanderer whose legend has yet to be written.';
  return HERO_BACKSTORIES[heroId] ?? `${hero.name} carries an untold legend from the frontier wars.`;
}

export function getHeroUniqueWeaponName(heroId: string): string {
  const hero = getHeroTemplateById(heroId);
  if (!hero) return 'Unwritten Relic';
  return HERO_UNIQUE_WEAPONS[heroId]?.weaponName ?? `${hero.name}'s Signature Relic`;
}

export function getHeroUniqueEffectFamilyLabel(heroId: string): string {
  return HERO_UNIQUE_EFFECTS[getHeroUniqueEffectFamily(heroId)].label;
}

export function getHeroUniqueCombatModifiers(heroId: string, rank: number): HeroUniqueCombatModifiers {
  const safeRank = clampHeroUniqueRank(rank);
  const effect = HERO_UNIQUE_EFFECTS[getHeroUniqueEffectFamily(heroId)];
  const dpsBonusPct = effect.dpsBasePct + effect.dpsPerRankPct * safeRank;
  const goldBonusPct = (effect.goldBasePct ?? 0) + (effect.goldPerRankPct ?? 0) * safeRank;
  const expBonusPct = (effect.expBasePct ?? 0) + (effect.expPerRankPct ?? 0) * safeRank;
  const mitigationPct = (effect.mitigationBasePct ?? 0) + (effect.mitigationPerRankPct ?? 0) * safeRank;

  return {
    dpsMult: 1 + dpsBonusPct / 100,
    goldMult: 1 + goldBonusPct / 100,
    expMult: 1 + expBonusPct / 100,
    incomingDmgMult: Math.max(0.5, 1 - mitigationPct / 100),
  };
}

/** Returns the unique combat skill params for a hero, scaled by weapon rank. */
export function getHeroUniqueSkillParams(heroId: string, rank: number): UniqueSkillParams | null {
  const profile = HERO_UNIQUE_WEAPONS[heroId];
  if (!profile?.uniqueSkill) return null;
  const safeRank = clampHeroUniqueRank(rank);
  const rankScale = 1 + (safeRank - 1) * 0.12; // rank 1 = 1×, rank 10 = 2.08×
  return {
    ...profile.uniqueSkill,
    power: profile.uniqueSkill.power * rankScale,
  };
}

const UNIQUE_SKILL_LABELS: Record<UniqueSkillType, string> = {
  shield_wall: 'Shield Wall',
  execute: 'Execute',
  rallying_cry: 'Rallying Cry',
  soul_drain: 'Soul Drain',
  crit_storm: 'Crit Storm',
  mark_prey: 'Mark Prey',
  chain_lightning: 'Chain Lightning',
  barrier_pulse: 'Barrier Pulse',
  armor_shred: 'Armor Shred',
  overcharge: 'Overcharge',
};

function describeUniqueSkillEffect(params: UniqueSkillParams): string {
  const pct = Math.round(params.power * 100);
  const dur = params.durationMs > 0 ? ` for ${(params.durationMs / 1000).toFixed(1)}s` : '';
  switch (params.type) {
    case 'shield_wall':
      return `Reduces incoming damage by ${pct}%${dur}`;
    case 'execute':
      return `Deals ${pct}% of monster missing HP as instant damage`;
    case 'rallying_cry':
      return `Boosts team DPS by ${pct}% and heals ${pct}% of max HP${dur}`;
    case 'soul_drain':
      return `Deals ${pct}% team DPS as damage and heals self for the same`;
    case 'crit_storm':
      return `Fires 5 rapid hits, each dealing ${pct}% of monster max HP`;
    case 'mark_prey':
      return `Marks the enemy to take ${pct}% more damage${dur}`;
    case 'chain_lightning':
      return `Deals ${pct}% of monster max HP and boosts DPS${dur}`;
    case 'barrier_pulse':
      return `Heals team for ${pct}% of max HP and reduces damage${dur}`;
    case 'armor_shred':
      return `Shreds armor, enemy takes ${pct}% more damage${dur}`;
    case 'overcharge':
      return `Deals a massive hit equal to ${pct}% of hero's DPS contribution`;
    default:
      return `Activates unique combat skill`;
  }
}

export function getHeroUniqueSkillDescription(heroId: string, rank: number): string {
  const hero = getHeroTemplateById(heroId);
  const profile = HERO_UNIQUE_WEAPONS[heroId];
  const safeRank = clampHeroUniqueRank(rank);
  const skillName = profile?.skillName ?? `${hero?.name ?? 'Unknown'}'s Relic Art`;
  const skillFlavor = profile?.skillFlavor ?? 'Unleashes a signature legend-bound technique.';
  const effectLabel = getHeroUniqueEffectFamilyLabel(heroId);
  const modifiers = getHeroUniqueCombatModifiers(heroId, safeRank);
  const bonusParts = [`+${Math.round((modifiers.dpsMult - 1) * 100)}% team DPS`];

  if (modifiers.goldMult > 1) {
    bonusParts.push(`+${Math.round((modifiers.goldMult - 1) * 100)}% gold gain`);
  }
  if (modifiers.expMult > 1) {
    bonusParts.push(`+${Math.round((modifiers.expMult - 1) * 100)}% EXP gain`);
  }
  if (modifiers.incomingDmgMult < 1) {
    bonusParts.push(`${Math.round((1 - modifiers.incomingDmgMult) * 100)}% damage reduction`);
  }

  const scaledSkill = getHeroUniqueSkillParams(heroId, safeRank);
  const combatLine = scaledSkill
    ? ` ⚔️ ${UNIQUE_SKILL_LABELS[scaledSkill.type]}: ${describeUniqueSkillEffect(scaledSkill)} (${(scaledSkill.cooldownMs / 1000).toFixed(0)}s CD).`
    : '';

  return `${skillName} • ${effectLabel}: ${skillFlavor} While active, grants ${bonusParts.join(', ')}.${combatLine}`;
}

export function getSummonRarityPool(postgameUnlocked: boolean): RarityConfig[] {
  return postgameUnlocked ? RARITIES : RARITIES.filter(r => r.id !== 'transcendent');
}

export function getHighestAvailableSummonRarity(postgameUnlocked: boolean): Rarity {
  return postgameUnlocked ? 'transcendent' : 'godly';
}

export interface HeroTemplate {
  id: string;
  name: string;
  heroClass: PlayerClass;
  emoji: string;
  passiveTrait: HeroPassiveTraitId;
  activeSkillArchetype: HeroActiveSkillArchetypeId;
  baseTeamBoost: number; // decimal (0.06 = +6% base)
  tier: 1 | 2 | 3 | 4 | 5;
}

// ── Hero V2: Per-hero stat profiles ──────────────────────────────────────

/** Class-level base stats and growth rates for heroes. */
export const HERO_CLASS_STAT_PROFILE: Record<
  PlayerClass,
  {
    baseStats: { str: number; int: number; agi: number; vit: number; spr: number };
    statGrowth: { str: number; int: number; agi: number; vit: number; spr: number };
  }
> = {
  warrior: {
    baseStats: { str: 12, int: 4, agi: 6, vit: 10, spr: 5 },
    statGrowth: { str: 1.1, int: 0.3, agi: 0.5, vit: 0.9, spr: 0.4 },
  },
  berserker: {
    baseStats: { str: 14, int: 3, agi: 8, vit: 6, spr: 4 },
    statGrowth: { str: 1.3, int: 0.2, agi: 0.7, vit: 0.4, spr: 0.3 },
  },
  archer: {
    baseStats: { str: 6, int: 5, agi: 13, vit: 5, spr: 7 },
    statGrowth: { str: 0.5, int: 0.4, agi: 1.2, vit: 0.4, spr: 0.5 },
  },
  mage: {
    baseStats: { str: 3, int: 14, agi: 5, vit: 4, spr: 10 },
    statGrowth: { str: 0.2, int: 1.3, agi: 0.4, vit: 0.3, spr: 0.9 },
  },
  monk: {
    baseStats: { str: 7, int: 8, agi: 9, vit: 8, spr: 9 },
    statGrowth: { str: 0.6, int: 0.7, agi: 0.8, vit: 0.7, spr: 0.8 },
  },
};

/** Tier growth multiplier: higher-tier heroes have stronger bases and scale faster. */
export const TIER_GROWTH_MULT: Record<number, number> = {
  1: 1.0,
  2: 1.15,
  3: 1.35,
  4: 1.6,
  5: 2.0,
};

/** Min/max rarity a hero of a given tier can be assigned. */
export const TIER_RARITY_RANGE: Record<number, { min: Rarity; max: Rarity }> = {
  1: { min: 'common', max: 'legendary' },
  2: { min: 'common', max: 'legendary' },
  3: { min: 'rare', max: 'godly' },
  4: { min: 'epic', max: 'transcendent' },
  5: { min: 'epic', max: 'transcendent' },
};

/** Clamp a rarity to the allowed range for a hero tier. */
export function clampRarityToTier(rarity: Rarity, tier: number): Rarity {
  const range = TIER_RARITY_RANGE[tier];
  if (!range) return rarity;
  const idx = RARITIES.findIndex(r => r.id === rarity);
  const minIdx = RARITIES.findIndex(r => r.id === range.min);
  const maxIdx = RARITIES.findIndex(r => r.id === range.max);
  if (idx < minIdx) return range.min;
  if (idx > maxIdx) return range.max;
  return rarity;
}

/** Deterministic ±15% stat variance per hero per stat key. Stable across sessions. */
function heroStatVariance(heroId: string, statKey: string): number {
  let hash = 0;
  const seed = heroId + statKey;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return 0.85 + ((hash & 0xffff) / 0xffff) * 0.3;
}

/** Resolve per-hero base stats & growth with class profile × tier × individual variance. */
export function getHeroStatProfile(hero: HeroTemplate): {
  baseStats: { str: number; int: number; agi: number; vit: number; spr: number };
  statGrowth: { str: number; int: number; agi: number; vit: number; spr: number };
} {
  const profile = HERO_CLASS_STAT_PROFILE[hero.heroClass];
  const tierMult = TIER_GROWTH_MULT[hero.tier] ?? 1;
  const v = (stat: string) => heroStatVariance(hero.id, stat);
  return {
    baseStats: {
      str: profile.baseStats.str * v('str') * tierMult,
      int: profile.baseStats.int * v('int') * tierMult,
      agi: profile.baseStats.agi * v('agi') * tierMult,
      vit: profile.baseStats.vit * v('vit') * tierMult,
      spr: profile.baseStats.spr * v('spr') * tierMult,
    },
    statGrowth: {
      str: profile.statGrowth.str * v('str') * tierMult,
      int: profile.statGrowth.int * v('int') * tierMult,
      agi: profile.statGrowth.agi * v('agi') * tierMult,
      vit: profile.statGrowth.vit * v('vit') * tierMult,
      spr: profile.statGrowth.spr * v('spr') * tierMult,
    },
  };
}

export type HeroPassiveTraitId = 'bulwark_instinct' | 'warpath_instinct' | 'fortune_hunter' | 'sage_instinct';

export type HeroActiveSkillArchetypeId = 'frontline_ward' | 'burst_volley' | 'battle_chant' | 'mending_pulse';

/** Per-skill cooldown in ms. Different archetypes have different rhythms. */
export const ACTIVE_SKILL_COOLDOWN_MS: Record<HeroActiveSkillArchetypeId, number> = {
  frontline_ward: 10000, // defensive shield — long cooldown
  burst_volley: 7000, // burst damage — moderate cooldown
  battle_chant: 9000, // team DPS buff — moderate-long cooldown
  mending_pulse: 6000, // healing — shorter cooldown for sustain
};

/** Mending pulse base heal fraction (scales with hero level). */
export const MENDING_PULSE_BASE_HEAL = 0.08;
export const MENDING_PULSE_LEVEL_SCALE = 0.0004; // +0.04% per hero level

export function getHeroPassiveTraitInfo(id: HeroPassiveTraitId): { name: string; description: string } {
  return {
    bulwark_instinct: {
      name: 'Bulwark Instinct',
      description: '-2% incoming team damage while in active team.',
    },
    warpath_instinct: {
      name: 'Warpath Instinct',
      description: '+3% team DPS while in active team.',
    },
    fortune_hunter: {
      name: 'Fortune Hunter',
      description: '+4% gold gain while in active team.',
    },
    sage_instinct: {
      name: 'Sage Instinct',
      description: '+3% EXP gain while in active team.',
    },
  }[id];
}

export function getHeroActiveArchetypeInfo(id: HeroActiveSkillArchetypeId): { name: string; description: string } {
  return {
    frontline_ward: {
      name: 'Frontline Ward',
      description: 'Triggers a short team damage reduction shield.',
    },
    burst_volley: {
      name: 'Burst Volley',
      description: 'Deals instant burst damage based on enemy max HP.',
    },
    battle_chant: {
      name: 'Battle Chant',
      description: 'Boosts team DPS for a short duration.',
    },
    mending_pulse: {
      name: 'Mending Pulse',
      description: 'Heals a percent of team max HP instantly.',
    },
  }[id];
}

export interface HeroUnit extends HeroTemplate {
  uid: string;
  rarity: Rarity;
  level: number; // hero's individual level
  rank: number; // hero's star rank (1-10), separate from level
  teamBoost: number; // effective decimal after rarity multiplier
  rebirthStatMult?: number; // hero-only stat multiplier from hero rebirths
}

// Hero rank system: grants stat bonuses per rank
export interface RankConfig {
  rankNumber: number;
  shardCostToRankUp: number;
  statMultiplier: number; // 1.0 = no bonus, 1.1 = +10% stats
}

export const RANK_CONFIGS: RankConfig[] = [
  { rankNumber: 1, shardCostToRankUp: 0, statMultiplier: 1.0 },
  { rankNumber: 2, shardCostToRankUp: 10, statMultiplier: 1.05 },
  { rankNumber: 3, shardCostToRankUp: 25, statMultiplier: 1.1 },
  { rankNumber: 4, shardCostToRankUp: 50, statMultiplier: 1.15 },
  { rankNumber: 5, shardCostToRankUp: 100, statMultiplier: 1.2 },
  { rankNumber: 6, shardCostToRankUp: 200, statMultiplier: 1.25 },
  { rankNumber: 7, shardCostToRankUp: 350, statMultiplier: 1.3 },
  { rankNumber: 8, shardCostToRankUp: 525, statMultiplier: 1.35 },
  { rankNumber: 9, shardCostToRankUp: 750, statMultiplier: 1.4 },
  { rankNumber: 10, shardCostToRankUp: 1000, statMultiplier: 1.45 },
];

// Rarity-based rank-up cost multiplier. Higher rarities cost proportionally more
// shards to rank up, creating intentional endgame gates. A full transcendent hero
// from rank 1→10 costs ~base_total × mult = 3010 × 11.4 ≈ 34,314 shards.
// This is designed as a 2-4 week grind at endgame shard income (~1000/day).
const RARITY_RANK_COST_MULT: Record<Rarity, number> = {
  common: 1.0,
  uncommon: 1.25,
  rare: 1.7,
  epic: 2.45,
  legendary: 3.7,
  mythic: 5.3,
  godly: 7.8,
  transcendent: 11.4,
};

const RARITY_RANK_POWER_MULT: Record<Rarity, number> = {
  common: 0.9,
  uncommon: 1.0,
  rare: 1.12,
  epic: 1.28,
  legendary: 1.48,
  mythic: 1.72,
  godly: 2.05,
  transcendent: 2.45,
};

export function getRankConfig(rank: number): RankConfig | null {
  return RANK_CONFIGS.find(r => r.rankNumber === rank) ?? null;
}

export function getRankUpShardCost(rarity: Rarity, targetRank: number): number {
  const cfg = getRankConfig(targetRank);
  if (!cfg) return Number.MAX_SAFE_INTEGER;
  const rarityMult = RARITY_RANK_COST_MULT[rarity] ?? 1;
  const progressiveMult = 1 + Math.pow(Math.max(0, targetRank - 1), 1.15) * 0.08;
  return Math.ceil(cfg.shardCostToRankUp * rarityMult * progressiveMult);
}

export function getRankStatMultiplier(rank: number, rarity: Rarity): number {
  const r = Math.max(1, rank);
  const rarityPower = RARITY_RANK_POWER_MULT[rarity] ?? 1;
  const additiveGrowth = (r - 1) * 0.015 * rarityPower;
  // Diminishing returns: high-rarity power tapers after rank 5
  const diminishingFactor = rarityPower > 1.4 && r > 5 ? 1 - (rarityPower - 1.4) * 0.15 * (r - 5) : 1;
  const effectivePower = rarityPower * Math.max(0.5, diminishingFactor);
  const acceleratedGrowth = Math.pow(r - 1, 1.22) * 0.018 * effectivePower;
  return Math.round((1 + additiveGrowth + acceleratedGrowth) * 10000) / 10000;
}

// Calculate shards earned when recycling a hero
export function calculateShardReward(rarity: Rarity, level: number): number {
  const rarityBaseValue =
    {
      common: 5,
      uncommon: 15,
      rare: 40,
      epic: 100,
      legendary: 250,
      mythic: 600,
      godly: 1500,
      transcendent: 3200,
    }[rarity] ?? 5;

  const levelMultiplier = 1 + Math.max(1, level - 1) * 0.15;
  return Math.floor(rarityBaseValue * levelMultiplier);
}

const HERO_REBIRTH_REFERENCE_MULT = 1.15;
const HERO_REBIRTH_SHARD_BASE_COST = 320;
const HERO_REBIRTH_SHARD_COST_MULT = 1.4;
const HERO_REBIRTH_SHARD_GROWTH_PER_REBIRTH = 0.22;
const HERO_REBIRTH_SHARD_LEVEL_REFERENCE = 80;
const HERO_REBIRTH_ESSENCE_BASE_COST = 1;
const HERO_REBIRTH_ESSENCE_STEP = 2;
const HERO_REBIRTH_BOOST_GAIN_BASE = 0.75;
const HERO_REBIRTH_BOOST_GAIN_DECAY = 0.84;
const HERO_REBIRTH_BOOST_GAIN_FLOOR = 0.04;

export interface HeroRebirthPlan {
  estimatedRebirths: number;
  shardCost: number;
  essenceCost: number;
  nextStatMultiplier: number;
  statGainPct: number;
}

export function getHeroRebirthPlan(hero: HeroUnit): HeroRebirthPlan {
  const statMult = Math.max(1, hero.rebirthStatMult ?? 1);
  const boostRatio = Math.max(1, statMult);
  const estimatedRebirths = Math.max(
    0,
    Math.floor(Math.log(boostRatio) / Math.log(HERO_REBIRTH_REFERENCE_MULT) + 1e-6),
  );

  const baseShardCost = Math.max(
    HERO_REBIRTH_SHARD_BASE_COST,
    Math.floor(
      calculateShardReward(hero.rarity, Math.min(hero.level, HERO_REBIRTH_SHARD_LEVEL_REFERENCE)) *
        HERO_REBIRTH_SHARD_COST_MULT,
    ),
  );
  const shardCost = Math.floor(baseShardCost * (1 + estimatedRebirths * HERO_REBIRTH_SHARD_GROWTH_PER_REBIRTH));
  const essenceCost = HERO_REBIRTH_ESSENCE_BASE_COST + Math.floor(estimatedRebirths / HERO_REBIRTH_ESSENCE_STEP);

  const gainPct = Math.max(
    HERO_REBIRTH_BOOST_GAIN_FLOOR,
    HERO_REBIRTH_BOOST_GAIN_BASE * Math.pow(HERO_REBIRTH_BOOST_GAIN_DECAY, estimatedRebirths),
  );
  const nextStatMultiplier = Number((statMult * (1 + gainPct)).toFixed(4));

  return {
    estimatedRebirths,
    shardCost,
    essenceCost,
    nextStatMultiplier,
    statGainPct: Number((gainPct * 100).toFixed(2)),
  };
}

export const HERO_POOL: HeroTemplate[] = [
  {
    id: 'h1',
    name: 'Kael Ironheart',
    heroClass: 'warrior',
    emoji: '⚔️',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.05,
    tier: 1,
  },
  {
    id: 'h2',
    name: 'Mira Oathguard',
    heroClass: 'warrior',
    emoji: '🛡️',
    passiveTrait: 'fortune_hunter',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.055,
    tier: 1,
  },
  {
    id: 'h3',
    name: 'Drogan Ashfury',
    heroClass: 'berserker',
    emoji: '🪓',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.06,
    tier: 1,
  },
  {
    id: 'h4',
    name: 'Thorn Bloodhide',
    heroClass: 'berserker',
    emoji: '🧱',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.05,
    tier: 1,
  },
  {
    id: 'h5',
    name: 'Sylvi Windmark',
    heroClass: 'archer',
    emoji: '🏹',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.055,
    tier: 1,
  },
  {
    id: 'h6',
    name: 'Riven Hawkeye',
    heroClass: 'archer',
    emoji: '🎯',
    passiveTrait: 'fortune_hunter',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.06,
    tier: 1,
  },
  {
    id: 'h7',
    name: 'Lunara Frostweave',
    heroClass: 'mage',
    emoji: '❄️',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.065,
    tier: 1,
  },
  {
    id: 'h8',
    name: 'Aziel Embermind',
    heroClass: 'mage',
    emoji: '🔥',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.06,
    tier: 1,
  },
  {
    id: 'h9',
    name: 'Shen Dawnfist',
    heroClass: 'monk',
    emoji: '👊',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.055,
    tier: 1,
  },
  {
    id: 'h10',
    name: 'Iria Lotusveil',
    heroClass: 'monk',
    emoji: '🪷',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.06,
    tier: 1,
  },
  {
    id: 'h11',
    name: 'Borin Stonewall',
    heroClass: 'warrior',
    emoji: '⛰️',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.05,
    tier: 1,
  },
  {
    id: 'h12',
    name: 'Karra Rageborn',
    heroClass: 'berserker',
    emoji: '🩸',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.065,
    tier: 1,
  },
  {
    id: 'h13',
    name: 'Nyx Whisperleaf',
    heroClass: 'archer',
    emoji: '🌿',
    passiveTrait: 'fortune_hunter',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.055,
    tier: 1,
  },
  {
    id: 'h14',
    name: 'Vex Starchant',
    heroClass: 'mage',
    emoji: '✨',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.07,
    tier: 1,
  },
  {
    id: 'h15',
    name: 'Tarin Sunstep',
    heroClass: 'monk',
    emoji: '☀️',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.06,
    tier: 1,
  },
  {
    id: 'h16',
    name: 'Orin Bastionforge',
    heroClass: 'warrior',
    emoji: '🧱',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.058,
    tier: 1,
  },
  {
    id: 'h17',
    name: 'Selene Ironbanner',
    heroClass: 'warrior',
    emoji: '🚩',
    passiveTrait: 'fortune_hunter',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.062,
    tier: 1,
  },
  {
    id: 'h18',
    name: 'Varric Doomhowl',
    heroClass: 'berserker',
    emoji: '🐺',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.068,
    tier: 1,
  },
  {
    id: 'h19',
    name: 'Morga Chainstorm',
    heroClass: 'berserker',
    emoji: '⛓️',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.057,
    tier: 1,
  },
  {
    id: 'h20',
    name: 'Aela Windpierce',
    heroClass: 'archer',
    emoji: '🦅',
    passiveTrait: 'fortune_hunter',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.061,
    tier: 1,
  },
  {
    id: 'h21',
    name: 'Kestrel Moonshot',
    heroClass: 'archer',
    emoji: '🌙',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.058,
    tier: 1,
  },
  {
    id: 'h22',
    name: 'Seris Riftborn',
    heroClass: 'mage',
    emoji: '🌀',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.071,
    tier: 1,
  },
  {
    id: 'h23',
    name: 'Noctis Emberveil',
    heroClass: 'mage',
    emoji: '🌌',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.066,
    tier: 1,
  },
  {
    id: 'h24',
    name: 'Korin Stillwater',
    heroClass: 'monk',
    emoji: '🌊',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.063,
    tier: 1,
  },
  {
    id: 'h25',
    name: 'Maeve Stormpalm',
    heroClass: 'monk',
    emoji: '⚡',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.064,
    tier: 1,
  },
  {
    id: 'h26',
    name: 'Gideon Flamecrest',
    heroClass: 'warrior',
    emoji: '🔥',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.06,
    tier: 1,
  },
  {
    id: 'h27',
    name: 'Rook Ashrender',
    heroClass: 'berserker',
    emoji: '💀',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.067,
    tier: 1,
  },
  {
    id: 'h28',
    name: 'Lyra Starquill',
    heroClass: 'archer',
    emoji: '⭐',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.06,
    tier: 1,
  },
  {
    id: 'h29',
    name: 'Eldrin Palefire',
    heroClass: 'mage',
    emoji: '🕯️',
    passiveTrait: 'fortune_hunter',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.065,
    tier: 1,
  },
  {
    id: 'h30',
    name: 'Jin Hollowreed',
    heroClass: 'monk',
    emoji: '🎋',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.062,
    tier: 1,
  },
  // ── Tier 2 Heroes (Epic+ fodder) ────────────────────────────────────────
  {
    id: 'h31',
    name: 'Thors Ironpeak',
    heroClass: 'warrior',
    emoji: '⛏️',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.061,
    tier: 2,
  },
  {
    id: 'h32',
    name: 'Valkyra Shieldborn',
    heroClass: 'warrior',
    emoji: '🗡️',
    passiveTrait: 'fortune_hunter',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.063,
    tier: 2,
  },
  {
    id: 'h33',
    name: 'Brutus Ironjaw',
    heroClass: 'berserker',
    emoji: '😤',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.069,
    tier: 2,
  },
  {
    id: 'h34',
    name: 'Magus Stonereave',
    heroClass: 'berserker',
    emoji: '💥',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.059,
    tier: 2,
  },
  {
    id: 'h35',
    name: 'Vesper Silverbow',
    heroClass: 'archer',
    emoji: '🎪',
    passiveTrait: 'fortune_hunter',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.062,
    tier: 2,
  },
  {
    id: 'h36',
    name: 'Fenwick Swiftbrand',
    heroClass: 'archer',
    emoji: '💨',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.06,
    tier: 2,
  },
  {
    id: 'h37',
    name: 'Thalia Duskborn',
    heroClass: 'mage',
    emoji: '🌙',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.072,
    tier: 2,
  },
  {
    id: 'h38',
    name: 'Corvus Nightwhisper',
    heroClass: 'mage',
    emoji: '🐦',
    passiveTrait: 'fortune_hunter',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.067,
    tier: 2,
  },
  {
    id: 'h39',
    name: 'Kalen Dawnbringer',
    heroClass: 'monk',
    emoji: '☀️',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.065,
    tier: 2,
  },
  {
    id: 'h40',
    name: 'Sera Veilwanderer',
    heroClass: 'monk',
    emoji: '👻',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.064,
    tier: 2,
  },
  // ── Tier 3 Heroes (Legendary/Mythic base) ──────────────────────────────
  {
    id: 'h41',
    name: 'Karthus Soulforge',
    heroClass: 'warrior',
    emoji: '💀',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.073,
    tier: 3,
  },
  {
    id: 'h42',
    name: 'Azura Dawnbearer',
    heroClass: 'warrior',
    emoji: '🌅',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.068,
    tier: 3,
  },
  {
    id: 'h43',
    name: 'Viktor Darkbane',
    heroClass: 'berserker',
    emoji: '🗡️',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.075,
    tier: 3,
  },
  {
    id: 'h44',
    name: 'Morgath Terrorforge',
    heroClass: 'berserker',
    emoji: '👹',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.07,
    tier: 3,
  },
  {
    id: 'h45',
    name: 'Zara Voidarchress',
    heroClass: 'archer',
    emoji: '🌌',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.074,
    tier: 3,
  },
  {
    id: 'h46',
    name: 'Kastor Deathmark',
    heroClass: 'archer',
    emoji: '🎯',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.069,
    tier: 3,
  },
  {
    id: 'h47',
    name: 'Iris Veilbearer',
    heroClass: 'mage',
    emoji: '🔷',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.078,
    tier: 3,
  },
  {
    id: 'h48',
    name: 'Arctus Frostking',
    heroClass: 'mage',
    emoji: '❄️',
    passiveTrait: 'fortune_hunter',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.076,
    tier: 3,
  },
  {
    id: 'h49',
    name: 'Sorena Lightfury',
    heroClass: 'monk',
    emoji: '⚡',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.072,
    tier: 3,
  },
  {
    id: 'h50',
    name: 'Orion Soulshaper',
    heroClass: 'monk',
    emoji: '✨',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.071,
    tier: 3,
  },
  // ── Tier 4 Heroes (Godly heroes - ultra rare summons) ────────────────
  {
    id: 'h51',
    name: 'Aethermaw Unbounded',
    heroClass: 'warrior',
    emoji: '🐉',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.085,
    tier: 4,
  },
  {
    id: 'h52',
    name: 'Seraph the Infinite',
    heroClass: 'warrior',
    emoji: '👼',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.082,
    tier: 4,
  },
  {
    id: 'h53',
    name: 'Ragnar Hellborn',
    heroClass: 'berserker',
    emoji: '👺',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.088,
    tier: 4,
  },
  {
    id: 'h54',
    name: 'Vyxara Shadow Empress',
    heroClass: 'berserker',
    emoji: '👑',
    passiveTrait: 'fortune_hunter',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.084,
    tier: 4,
  },
  {
    id: 'h55',
    name: 'Zephyr Starreacher',
    heroClass: 'archer',
    emoji: '🌠',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.087,
    tier: 4,
  },
  {
    id: 'h56',
    name: 'Nyx Void Chosen',
    heroClass: 'archer',
    emoji: '🕷️',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.083,
    tier: 4,
  },
  {
    id: 'h57',
    name: 'Archaon Time Weaver',
    heroClass: 'mage',
    emoji: '⏰',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.091,
    tier: 4,
  },
  {
    id: 'h58',
    name: 'Pyritess Eternal Flame',
    heroClass: 'mage',
    emoji: '🔥',
    passiveTrait: 'fortune_hunter',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.089,
    tier: 4,
  },
  {
    id: 'h59',
    name: 'Luminion Stellarch',
    heroClass: 'monk',
    emoji: '⭐',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.086,
    tier: 4,
  },
  {
    id: 'h60',
    name: 'Void Sovereign',
    heroClass: 'monk',
    emoji: '🌀',
    passiveTrait: 'bulwark_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.085,
    tier: 4,
  },
  // ── Tier 5 Heroes (Transcendent - only in postgame) ───────────────────
  {
    id: 'h61',
    name: 'Titan Worldrender',
    heroClass: 'warrior',
    emoji: '🗻',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'frontline_ward',
    baseTeamBoost: 0.095,
    tier: 5,
  },
  {
    id: 'h62',
    name: 'Leviathan Depths',
    heroClass: 'berserker',
    emoji: '🐙',
    passiveTrait: 'warpath_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.098,
    tier: 5,
  },
  {
    id: 'h63',
    name: 'Phoenix Eternal',
    heroClass: 'archer',
    emoji: '🦅',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'burst_volley',
    baseTeamBoost: 0.096,
    tier: 5,
  },
  {
    id: 'h64',
    name: 'Celestial Architect',
    heroClass: 'mage',
    emoji: '🌌',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'mending_pulse',
    baseTeamBoost: 0.1,
    tier: 5,
  },
  {
    id: 'h65',
    name: 'Dharma Eternal Cycle',
    heroClass: 'monk',
    emoji: '♾️',
    passiveTrait: 'sage_instinct',
    activeSkillArchetype: 'battle_chant',
    baseTeamBoost: 0.099,
    tier: 5,
  },
];

export const MAX_EQUIPPED_HEROES = 5;
export const ACTIVE_TEAM_SIZE = 6; // max heroes in battle (+ player)
export const GACHA_SUMMON_COST = 500;
export const DIAMOND_SUMMON_COST = 500; // diamonds per single summon
export const HERO_LEVEL_EXP_FORMULA = (level: number) => Math.floor(50 * Math.pow(1.18, level - 1));
export const HERO_LEVEL_CAP = 999;

/** VIP 3+ reduces summon costs (boss tear & diamond) by 10%. */
export const VIP_SUMMON_DISCOUNT_LEVEL = 3;
export const VIP_SUMMON_DISCOUNT = 0.1; // 10% off

// ── Gacha V2: Tiered Hero Pool ────────────────────────────────────────────

/** Maps a pulled rarity to the eligible hero sub-pool (by tier). */
const HERO_TIER_RANGES: { rarities: Rarity[]; startIndex: number; endIndex: number }[] = [
  { rarities: ['common', 'uncommon'], startIndex: 0, endIndex: 30 }, // h1–h30
  { rarities: ['rare', 'epic'], startIndex: 30, endIndex: 50 }, // h31–h50
  { rarities: ['legendary', 'mythic'], startIndex: 40, endIndex: 60 }, // h41–h60 (overlaps for variety)
  { rarities: ['godly', 'transcendent'], startIndex: 50, endIndex: 65 }, // h51–h65
];

export function pickHeroForRarity(rarity: Rarity): HeroTemplate {
  const tier = HERO_TIER_RANGES.find(t => t.rarities.includes(rarity));
  if (!tier) return HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
  const slice = HERO_POOL.slice(tier.startIndex, tier.endIndex);
  return slice[Math.floor(Math.random() * slice.length)];
}

// ── Gacha V2: Dupe Spark Tokens ───────────────────────────────────────────

export const SPARK_TOKEN_BY_RARITY: Record<Rarity, number> = {
  common: 1,
  uncommon: 3,
  rare: 8,
  epic: 20,
  legendary: 50,
  mythic: 120,
  godly: 300,
  transcendent: 600,
};

export interface SparkExchangeOption {
  id: string;
  label: string;
  sparkCost: number;
  kind: 'free_summon' | 'targeted_hero';
  minRarity?: Rarity;
}

export const SPARK_EXCHANGE_OPTIONS: SparkExchangeOption[] = [
  { id: 'spark_free_charge', label: '1 Free Summon Charge', sparkCost: 50, kind: 'free_summon' },
  { id: 'spark_rare', label: 'Choose a Rare-tier Hero', sparkCost: 150, kind: 'targeted_hero', minRarity: 'rare' },
  { id: 'spark_epic', label: 'Choose an Epic-tier Hero', sparkCost: 500, kind: 'targeted_hero', minRarity: 'epic' },
  {
    id: 'spark_legendary',
    label: 'Choose a Legendary-tier Hero',
    sparkCost: 1500,
    kind: 'targeted_hero',
    minRarity: 'legendary',
  },
  { id: 'spark_mythic', label: 'Choose a Mythic+ Hero', sparkCost: 5000, kind: 'targeted_hero', minRarity: 'mythic' },
];

// ── Gacha V2: Banner Rate-Up (across all Legendary+ pulls) ───────────────

export const BANNER_RATE_UP_BY_RARITY: Partial<Record<Rarity, number>> = {
  legendary: 0.35,
  mythic: 0.45,
  godly: 0.55,
  transcendent: 0.65,
};

// ── Gacha V2: Summon Milestones ───────────────────────────────────────────

export interface SummonMilestone {
  threshold: number;
  rewardLabel: string;
  rewardKind: 'free_charges' | 'guaranteed_rarity' | 'spark_tokens' | 'spark_and_unique';
  freeCharges?: number;
  sparkTokens?: number;
  guaranteedRarity?: Rarity;
  grantUniqueForge?: boolean;
}

export const SUMMON_MILESTONES: SummonMilestone[] = [
  { threshold: 10, rewardLabel: '5 Free Summon Charges', rewardKind: 'free_charges', freeCharges: 5 },
  {
    threshold: 50,
    rewardLabel: 'Next summon guaranteed Epic+',
    rewardKind: 'guaranteed_rarity',
    guaranteedRarity: 'epic',
  },
  { threshold: 100, rewardLabel: '500 Spark Tokens', rewardKind: 'spark_tokens', sparkTokens: 500 },
  {
    threshold: 250,
    rewardLabel: 'Next summon guaranteed Legendary+',
    rewardKind: 'guaranteed_rarity',
    guaranteedRarity: 'legendary',
  },
  {
    threshold: 500,
    rewardLabel: '2000 Spark Tokens + Unique Gear',
    rewardKind: 'spark_and_unique',
    sparkTokens: 2000,
    grantUniqueForge: true,
  },
  {
    threshold: 1000,
    rewardLabel: 'Next summon guaranteed Mythic+',
    rewardKind: 'guaranteed_rarity',
    guaranteedRarity: 'mythic',
  },
];

// ── Gacha V2: Soft Pity ──────────────────────────────────────────────────

/** Pulls 20+ get +3% cumulative Legendary+ chance per pull past 20. */
export const SOFT_PITY_START = 20;
export const SOFT_PITY_BOOST_PER_PULL = 0.03;

export function rollRarity(random: number, pool: RarityConfig[] = RARITIES): Rarity {
  let acc = 0;
  for (const r of pool) {
    acc += r.chance;
    if (random <= acc) return r.id;
  }
  return pool[0]?.id ?? 'common';
}

export function rarityConfig(rarity: Rarity): RarityConfig {
  return RARITIES.find(r => r.id === rarity) ?? RARITIES[0];
}

// ── Combat / Economy ───────────────────────────────────────────────────────

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  cost: number;
  targetId: 'click';
  multiplier: number;
}

export interface MonsterConfig {
  name: string;
  emoji: string;
}

export interface MonsterAffix {
  id: string;
  name: string;
  color: string;
  description: string;
  enemyHpMultiplier: number;
  enemyDamageMultiplier: number;
  goldMultiplier: number;
  expMultiplier: number;
}

const MONSTER_POOL: MonsterConfig[] = [
  { name: 'Slime', emoji: '🟢' },
  { name: 'Goblin', emoji: '👺' },
  { name: 'Skeleton', emoji: '💀' },
  { name: 'Orc', emoji: '👹' },
  { name: 'Troll', emoji: '🧌' },
  { name: 'Witch', emoji: '🧙' },
  { name: 'Vampire', emoji: '🧛' },
  { name: 'Werewolf', emoji: '🐺' },
  { name: 'Demon', emoji: '😈' },
  { name: 'Ancient Dragon', emoji: '🐲' },
];

const MONSTER_AFFIX_POOL: MonsterAffix[] = [
  {
    id: 'armored',
    name: 'Armored',
    color: '#9aa8bd',
    description: 'Reduced incoming damage by 18%.',
    enemyHpMultiplier: 1.18,
    enemyDamageMultiplier: 1.0,
    goldMultiplier: 1.06,
    expMultiplier: 1.05,
  },
  {
    id: 'berserk',
    name: 'Berserk',
    color: '#ff7b6e',
    description: 'Deals much higher damage.',
    enemyHpMultiplier: 1.0,
    enemyDamageMultiplier: 1.28,
    goldMultiplier: 1.07,
    expMultiplier: 1.07,
  },
  {
    id: 'swift',
    name: 'Swift',
    color: '#75d7ff',
    description: 'Harder to pin down, some damage is avoided.',
    enemyHpMultiplier: 1.12,
    enemyDamageMultiplier: 1.08,
    goldMultiplier: 1.06,
    expMultiplier: 1.06,
  },
  {
    id: 'hoarder',
    name: 'Hoarder',
    color: '#ffd780',
    description: 'Carries extra treasure.',
    enemyHpMultiplier: 1.1,
    enemyDamageMultiplier: 1.05,
    goldMultiplier: 1.24,
    expMultiplier: 1.08,
  },
  {
    id: 'arcane',
    name: 'Arcane',
    color: '#b99cff',
    description: 'Empowered with chaotic magic.',
    enemyHpMultiplier: 1.15,
    enemyDamageMultiplier: 1.14,
    goldMultiplier: 1.1,
    expMultiplier: 1.16,
  },
];

export function getMonsterAffixes(wave: number): MonsterAffix[] {
  const affixes: MonsterAffix[] = [];
  const primary = MONSTER_AFFIX_POOL[(wave - 1) % MONSTER_AFFIX_POOL.length];
  affixes.push(primary);
  if (wave % 10 === 0) {
    const secondary = MONSTER_AFFIX_POOL[(wave + 2) % MONSTER_AFFIX_POOL.length];
    if (secondary.id !== primary.id) affixes.push(secondary);
  }
  return affixes;
}

export function getMonsterForWave(wave: number): MonsterConfig {
  if (wave % 10 === 0) {
    const base = MONSTER_POOL[Math.floor(wave / 10 - 1) % MONSTER_POOL.length];
    return { name: `${base.name} King`, emoji: '👑' };
  }
  return MONSTER_POOL[(wave - 1) % MONSTER_POOL.length];
}

export function getMonsterMaxHp(wave: number): number {
  const isBoss = wave % 10 === 0;
  const base = Math.floor(30 * Math.pow(1.12, wave - 1));
  return isBoss ? base * 5 : base;
}

export function getMonsterGold(wave: number): number {
  const isBoss = wave % 10 === 0;
  let base = Math.max(8, Math.floor(8 * Math.pow(1.14, wave - 1)));
  // Mid-game catchup: gradual 1.5x–2x gold boost for waves 20-60
  // to smooth the progression dead zone where building costs (1.15x)
  // outpace gold income (1.14x).
  if (wave >= 20 && wave <= 60) {
    const t = (wave - 20) / 40; // 0 at wave 20, 1 at wave 60
    const boost = 1.5 + 0.5 * t; // ramps from 1.5x to 2.0x
    base = Math.floor(base * boost);
  }
  return isBoss ? base * 7 : base;
}

export function getMonsterExp(wave: number): number {
  const isBoss = wave % 10 === 0;
  const base = Math.max(5, Math.floor(5 * Math.pow(1.12, wave - 1)));
  return isBoss ? base * 4 : base;
}

export function getMonsterDamage(wave: number): number {
  // Enemy damage per second based on wave
  const isBoss = wave % 10 === 0;
  const base = Math.max(0.5, Math.floor(0.8 * Math.pow(1.12, wave - 1)) / 10);
  return isBoss ? base * 2.5 : base;
}

export function expForLevel(level: number): number {
  return Math.floor(80 * Math.pow(1.16, level - 1));
}

export const SKILLS: SkillConfig[] = [
  {
    id: 'click_1',
    name: 'Combat Drill',
    description: 'Commander strike ×2',
    cost: 300,
    targetId: 'click',
    multiplier: 2,
  },
  {
    id: 'click_2',
    name: 'Execution Stance',
    description: 'Commander strike ×2',
    cost: 12_000,
    targetId: 'click',
    multiplier: 2,
  },
  {
    id: 'click_3',
    name: 'Heroic Burst',
    description: 'Commander strike ×5',
    cost: 250_000,
    targetId: 'click',
    multiplier: 5,
  },
];

export interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  hidden?: boolean;
  condition: (s: AchievementContext) => boolean;
}

export interface AchievementContext {
  totalGold: number;
  totalKills: number;
  wave: number;
  highestWaveReached: number;
  level: number;
  prestigeCount: number;
  totalSummons: number;
  equippedCount: number;
  activeTeamClassCount: number;
  teamSlotCount: number;
  heroRosterCount: number;
  godlyHeroCount: number;
  transcendentHeroCount: number;
  maxHeroRankCount: number;
  maxHeroLevelCount: number;
  heroShards: number;
  essence: number;
  bossTears: number;
  vipLevel: number;
  equipmentScrap: number;
  epicPlusEquipmentCount: number;
  mythicPlusEquipmentCount: number;
  transcendentEquipmentCount: number;
  facilityTotalLevel: number;
  forgeFacilityLevel: number;
  uniqueForgedCount: number;
  uniqueEquippedCount: number;
  uniqueMaxRankCount: number;
  codexClaimCount: number;
  permanentUnlockCount: number;
  unlockedCount: number;
  totalAchievementCount: number;
  dailyLoginStreak: number;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first_blood',
    name: 'Ashen First Blood',
    description: 'Break the line and defeat your first monster.',
    emoji: '🗡️',
    condition: s => s.totalKills >= 1,
  },
  {
    id: 'kills_25',
    name: 'Skirmish Doctrine',
    description: 'Defeat 25 monsters.',
    emoji: '⚔️',
    condition: s => s.totalKills >= 25,
  },
  {
    id: 'kills_100',
    name: 'Frontier Reaper',
    description: 'Defeat 100 monsters.',
    emoji: '☠️',
    condition: s => s.totalKills >= 100,
  },
  {
    id: 'kills_500',
    name: 'Warpath Unbroken',
    description: 'Defeat 500 monsters.',
    emoji: '🩸',
    condition: s => s.totalKills >= 500,
  },
  {
    id: 'kills_2500',
    name: 'Apex Exterminator',
    description: 'Defeat 2,500 monsters.',
    emoji: '💀',
    condition: s => s.totalKills >= 2500,
  },
  {
    id: 'kills_10k',
    name: 'Legion Harrower',
    description: 'Defeat 10,000 monsters.',
    emoji: '⚔️',
    condition: s => s.totalKills >= 10000,
  },
  {
    id: 'kills_100k',
    name: 'Cataclysm Standard',
    description: 'Defeat 100,000 monsters.',
    emoji: '🌪️',
    condition: s => s.totalKills >= 100000,
  },

  // Wave milestones
  {
    id: 'wave_10',
    name: 'Gatebreaker',
    description: 'Push the current run to wave 10.',
    emoji: '🚪',
    condition: s => s.wave >= 10,
  },
  {
    id: 'wave_25',
    name: 'Frontline Surge',
    description: 'Push the current run to wave 25.',
    emoji: '🌊',
    condition: s => s.wave >= 25,
  },
  {
    id: 'wave_50',
    name: 'Siege Veteran',
    description: 'Push the current run to wave 50.',
    emoji: '⚔️',
    condition: s => s.wave >= 50,
  },
  {
    id: 'wave_100',
    name: 'Century Siege',
    description: 'Push the current run to wave 100.',
    emoji: '🏰',
    condition: s => s.wave >= 100,
  },
  {
    id: 'wave_250',
    name: 'Storm Marshal',
    description: 'Push the current run to wave 250.',
    emoji: '🌩️',
    condition: s => s.wave >= 250,
  },
  {
    id: 'wave_500',
    name: 'Infinite March',
    description: 'Push the current run to wave 500.',
    emoji: '∞',
    condition: s => s.wave >= 500,
  },
  {
    id: 'highest_wave_300',
    name: 'Last Bastion',
    description: 'Reach wave 300 in any run.',
    emoji: '🧱',
    condition: s => s.highestWaveReached >= 300,
  },
  {
    id: 'highest_wave_1k',
    name: 'Epoch Conqueror',
    description: 'Reach wave 1,000 in any run.',
    emoji: '👑',
    condition: s => s.highestWaveReached >= 1000,
  },
  {
    id: 'highest_wave_2500',
    name: 'Thronefall Survivor',
    description: 'Reach wave 2,500 in any run.',
    emoji: '🜂',
    hidden: true,
    condition: s => s.highestWaveReached >= 2500,
  },

  // Level milestones
  {
    id: 'level_10',
    name: 'Battle-Hardened',
    description: 'Raise your commander to level 10.',
    emoji: '🛡️',
    condition: s => s.level >= 10,
  },
  {
    id: 'level_25',
    name: 'Ascendant Standard',
    description: 'Raise your commander to level 25.',
    emoji: '⭐',
    condition: s => s.level >= 25,
  },
  {
    id: 'level_50',
    name: 'Myth-Forged',
    description: 'Raise your commander to level 50.',
    emoji: '🌟',
    condition: s => s.level >= 50,
  },
  {
    id: 'level_100',
    name: 'Godborne Office',
    description: 'Raise your commander to level 100.',
    emoji: '🌌',
    condition: s => s.level >= 100,
  },
  {
    id: 'level_250',
    name: 'Eternal Regent',
    description: 'Raise your commander to level 250.',
    emoji: '👑',
    condition: s => s.level >= 250,
  },

  // Gold milestones
  {
    id: 'gold_100k',
    name: 'Coin Current',
    description: 'Accumulate 100,000 total gold across all runs.',
    emoji: '🪙',
    condition: s => s.totalGold >= 100_000,
  },
  {
    id: 'gold_1m',
    name: 'Gold Baron',
    description: 'Accumulate 1,000,000 total gold across all runs.',
    emoji: '💰',
    condition: s => s.totalGold >= 1_000_000,
  },
  {
    id: 'gold_10m',
    name: 'Imperial Treasury',
    description: 'Earn 10,000,000 total gold.',
    emoji: '🏦',
    condition: s => s.totalGold >= 10_000_000,
  },
  {
    id: 'gold_100m',
    name: 'Dynastic Wealth',
    description: 'Accumulate 100,000,000 total gold across all runs.',
    emoji: '🏆',
    condition: s => s.totalGold >= 100_000_000,
  },
  {
    id: 'gold_1b',
    name: 'Infinite Treasury',
    description: 'Accumulate 1,000,000,000 total gold across all runs.',
    emoji: '🤑',
    condition: s => s.totalGold >= 1_000_000_000,
  },

  // Summoning achievements
  {
    id: 'summon_1',
    name: 'Recruitment Opened',
    description: 'Summon your first hero.',
    emoji: '📯',
    condition: s => s.totalSummons >= 1,
  },
  {
    id: 'summon_10',
    name: 'Banner Collector',
    description: 'Summon 10 heroes.',
    emoji: '🎴',
    condition: s => s.totalSummons >= 10,
  },
  {
    id: 'summon_50',
    name: 'Warband Architect',
    description: 'Summon 50 heroes.',
    emoji: '🧬',
    condition: s => s.totalSummons >= 50,
  },
  {
    id: 'summon_200',
    name: 'Legion Broker',
    description: 'Summon 200 heroes.',
    emoji: '👑',
    condition: s => s.totalSummons >= 200,
  },
  {
    id: 'summon_1k',
    name: 'Infinite Bannerlord',
    description: 'Summon 1,000 heroes.',
    emoji: '🌠',
    condition: s => s.totalSummons >= 1000,
  },
  {
    id: 'godly_hero_1',
    name: 'Myth Walks',
    description: 'Own a Godly hero.',
    emoji: '🌟',
    condition: s => s.godlyHeroCount >= 1,
  },
  {
    id: 'transcendent_hero_1',
    name: 'Beyond the Banner',
    description: 'Own a Transcendent hero.',
    emoji: '🕳️',
    condition: s => s.transcendentHeroCount >= 1,
  },
  {
    id: 'transcendent_hero_5',
    name: 'Court of the Beyond',
    description: 'Own 5 Transcendent heroes.',
    emoji: '🜏',
    hidden: true,
    condition: s => s.transcendentHeroCount >= 5,
  },

  // Roster achievements
  {
    id: 'roster_12',
    name: 'Field Locker',
    description: 'Own 12 heroes at once.',
    emoji: '🗃️',
    condition: s => s.heroRosterCount >= 12,
  },
  {
    id: 'roster_30',
    name: 'Banner Hall',
    description: 'Own 30 heroes at once.',
    emoji: '🏳️',
    condition: s => s.heroRosterCount >= 30,
  },
  {
    id: 'roster_60',
    name: 'Eternal Legion',
    description: 'Own 60 heroes at once.',
    emoji: '⚔️',
    condition: s => s.heroRosterCount >= 60,
  },
  {
    id: 'team_full',
    name: 'War Council',
    description: 'Field a full five-hero active team.',
    emoji: '🪖',
    condition: s => s.equippedCount >= 5,
  },
  {
    id: 'team_diverse',
    name: 'Grand Coalition',
    description: 'Deploy 4 different hero classes at once.',
    emoji: '🧭',
    condition: s => s.activeTeamClassCount >= 4,
  },
  {
    id: 'team_slots_5',
    name: 'Expanded Command',
    description: 'Unlock all team slots.',
    emoji: '🪑',
    condition: s => s.teamSlotCount >= 5,
  },
  {
    id: 'rank_10_1',
    name: 'Crowned Veteran',
    description: 'Raise a hero to Rank 10.',
    emoji: '👑',
    condition: s => s.maxHeroRankCount >= 1,
  },
  {
    id: 'rank_10_5',
    name: 'Pantheon Vanguard',
    description: 'Raise 5 heroes to Rank 10.',
    emoji: '🏛️',
    condition: s => s.maxHeroRankCount >= 5,
  },
  {
    id: 'hero_cap_1',
    name: 'Limit Breaker',
    description: 'Raise a hero to the level cap.',
    emoji: '📈',
    condition: s => s.maxHeroLevelCount >= 1,
  },
  {
    id: 'hero_cap_5',
    name: 'Endgame Battalion',
    description: 'Raise 5 heroes to the level cap.',
    emoji: '🧱',
    condition: s => s.maxHeroLevelCount >= 5,
  },
  {
    id: 'lone_banner',
    name: 'Lone Banner',
    description: 'Reach wave 100 while fielding only one active hero.',
    emoji: '🕯️',
    hidden: true,
    condition: s => s.wave >= 100 && s.equippedCount === 1,
  },
  {
    id: 'mono_legion',
    name: 'Monoculture Doctrine',
    description: 'Field a full team without class diversity.',
    emoji: '🪞',
    hidden: true,
    condition: s => s.equippedCount >= 5 && s.activeTeamClassCount === 1,
  },

  // Equipment and crafting
  {
    id: 'equip_5',
    name: 'Forward Detachment',
    description: 'Field at least 4 active heroes.',
    emoji: '🧩',
    condition: s => s.equippedCount >= 4,
  },
  {
    id: 'gear_epic',
    name: 'Epic Armorsmith',
    description: 'Own an Epic-or-better equipment piece.',
    emoji: '🎨',
    condition: s => s.epicPlusEquipmentCount >= 1,
  },
  {
    id: 'gear_mythic',
    name: 'Mythic Artisan',
    description: 'Own a Mythic-or-better equipment piece.',
    emoji: '✨',
    condition: s => s.mythicPlusEquipmentCount >= 1,
  },
  {
    id: 'scrap_1k',
    name: 'Scrapyard Baron',
    description: 'Hold 1,000 equipment scrap.',
    emoji: '🔩',
    condition: s => s.equipmentScrap >= 1000,
  },
  {
    id: 'scrap_10k',
    name: 'Iron Mountain',
    description: 'Hold 10,000 equipment scrap.',
    emoji: '⛰️',
    condition: s => s.equipmentScrap >= 10000,
  },
  {
    id: 'gear_mythic_plus_3',
    name: 'High Armory',
    description: 'Own 3 Mythic or better equipment pieces.',
    emoji: '🛠️',
    condition: s => s.mythicPlusEquipmentCount >= 3,
  },
  {
    id: 'gear_transcendent_1',
    name: 'Transcendent Arsenal',
    description: 'Own a Transcendent equipment piece.',
    emoji: '🗡️',
    condition: s => s.transcendentEquipmentCount >= 1,
  },
  {
    id: 'gear_transcendent_3',
    name: 'Starvault Arsenal',
    description: 'Own 3 Transcendent equipment pieces.',
    emoji: '🌌',
    hidden: true,
    condition: s => s.transcendentEquipmentCount >= 3,
  },

  // Shard and essence
  {
    id: 'shards_1000',
    name: 'Shard Banker',
    description: 'Hold 1,000 hero shards at once.',
    emoji: '💠',
    condition: s => s.heroShards >= 1000,
  },
  {
    id: 'shards_10k',
    name: 'Crystalline Hoard',
    description: 'Hold 10,000 hero shards at once.',
    emoji: '💠',
    condition: s => s.heroShards >= 10000,
  },
  {
    id: 'essence_25',
    name: 'Essence Channel',
    description: 'Own 25 essence.',
    emoji: '✨',
    condition: s => s.essence >= 25,
  },
  {
    id: 'essence_100',
    name: 'Eternal Conduit',
    description: 'Own 100 essence.',
    emoji: '✨',
    condition: s => s.essence >= 100,
  },
  {
    id: 'boss_tears_10',
    name: 'Tear Vault',
    description: 'Hold 10 Boss Tears at once.',
    emoji: '💧',
    condition: s => s.bossTears >= 10,
  },
  {
    id: 'boss_tears_100',
    name: 'Abyss Reservoir',
    description: 'Hold 100 Boss Tears at once.',
    emoji: '🌊',
    condition: s => s.bossTears >= 100,
  },
  {
    id: 'boss_tears_250',
    name: 'Blackwell Reservoir',
    description: 'Hold 250 Boss Tears at once.',
    emoji: '🌑',
    hidden: true,
    condition: s => s.bossTears >= 250,
  },
  {
    id: 'vip_1',
    name: 'Patron Sigil',
    description: 'Reach VIP level 1.',
    emoji: '👑',
    condition: s => s.vipLevel >= 1,
  },
  {
    id: 'vip_5',
    name: 'Imperial Patron',
    description: 'Reach VIP level 5.',
    emoji: '💎',
    condition: s => s.vipLevel >= 5,
  },
  {
    id: 'vip_10',
    name: 'Throne Benefactor',
    description: 'Reach VIP level 10.',
    emoji: '🏰',
    condition: s => s.vipLevel >= 10,
  },

  // Progression unlocks
  {
    id: 'unlocks_3',
    name: 'Relic Keeper',
    description: 'Unlock your first permanent feature.',
    emoji: '🔓',
    condition: s => s.permanentUnlockCount >= 1,
  },
  {
    id: 'unlocks_10',
    name: 'Vault Master',
    description: 'Unlock all permanent features.',
    emoji: '🔑',
    condition: s => s.permanentUnlockCount >= 3,
  },
  {
    id: 'facilities_20',
    name: 'Guildhall Clerk',
    description: 'Reach 20 total facility levels.',
    emoji: '🏗️',
    condition: s => s.facilityTotalLevel >= 20,
  },
  {
    id: 'facilities_80',
    name: 'Citadel Quartermaster',
    description: 'Reach 80 total facility levels.',
    emoji: '🏰',
    condition: s => s.facilityTotalLevel >= 80,
  },
  {
    id: 'forge_10',
    name: 'Forge Supremacy',
    description: 'Upgrade the Forge facility to level 10.',
    emoji: '🔥',
    condition: s => s.forgeFacilityLevel >= 10,
  },
  {
    id: 'facilities_200',
    name: 'Imperial Works',
    description: 'Reach 200 total facility levels.',
    emoji: '🏛️',
    hidden: true,
    condition: s => s.facilityTotalLevel >= 200,
  },

  // Login achievements
  {
    id: 'streak_7',
    name: 'Habit of Steel',
    description: 'Reach a 7-day login streak.',
    emoji: '📅',
    condition: s => s.dailyLoginStreak >= 7,
  },
  {
    id: 'streak_30',
    name: 'Devoted Guardian',
    description: 'Reach a 30-day login streak.',
    emoji: '🗓️',
    condition: s => s.dailyLoginStreak >= 30,
  },

  // Rebirth achievements
  {
    id: 'rebirth_1',
    name: 'Reborn',
    description: 'Complete your first rebirth.',
    emoji: '♾️',
    condition: s => s.prestigeCount >= 1,
  },
  {
    id: 'rebirth_5',
    name: 'Soul Cycler',
    description: 'Complete 5 Rebirths.',
    emoji: '🌀',
    condition: s => s.prestigeCount >= 5,
  },
  {
    id: 'rebirth_15',
    name: 'Eternal Cadence',
    description: 'Complete 15 Rebirths.',
    emoji: '🌌',
    condition: s => s.prestigeCount >= 15,
  },
  {
    id: 'rebirth_50',
    name: 'Infinite Returner',
    description: 'Complete 50 Rebirths.',
    emoji: '∞',
    condition: s => s.prestigeCount >= 50,
  },
  {
    id: 'rebirth_100',
    name: 'Godborne',
    description: 'Complete 100 Rebirths. You transcend mortality.',
    emoji: '👑',
    condition: s => s.prestigeCount >= 100,
  },
  {
    id: 'rebirth_250',
    name: 'Cycle Tyrant',
    description: 'Complete 250 rebirths.',
    emoji: '🜃',
    hidden: true,
    condition: s => s.prestigeCount >= 250,
  },

  // Unique gear and codex
  {
    id: 'unique_1',
    name: 'Relic Awakened',
    description: 'Forge your first hero unique weapon.',
    emoji: '🗡️',
    condition: s => s.uniqueForgedCount >= 1,
  },
  {
    id: 'unique_10',
    name: 'Armory Curator',
    description: 'Forge 10 hero unique weapons.',
    emoji: '🗃️',
    condition: s => s.uniqueForgedCount >= 10,
  },
  {
    id: 'unique_25',
    name: 'Dynastic Relic Hall',
    description: 'Forge 25 hero unique weapons.',
    emoji: '🏛️',
    condition: s => s.uniqueForgedCount >= 25,
  },
  {
    id: 'unique_50',
    name: 'Imperial Reliquary',
    description: 'Forge 50 hero unique weapons.',
    emoji: '👑',
    condition: s => s.uniqueForgedCount >= 50,
  },
  {
    id: 'unique_equipped_5',
    name: 'Relic Doctrine',
    description: 'Have 5 unique weapons equipped at once.',
    emoji: '⚜️',
    condition: s => s.uniqueEquippedCount >= 5,
  },
  {
    id: 'unique_rank_10',
    name: 'Masterpiece Armament',
    description: 'Raise a unique weapon to Rank 10.',
    emoji: '🌟',
    condition: s => s.uniqueMaxRankCount >= 1,
  },
  {
    id: 'codex_claims_10',
    name: 'Lorekeeper',
    description: 'Claim 10 codex rewards.',
    emoji: '📚',
    condition: s => s.codexClaimCount >= 10,
  },
  {
    id: 'codex_claims_40',
    name: 'Archivist Supreme',
    description: 'Claim 40 codex rewards.',
    emoji: '📖',
    condition: s => s.codexClaimCount >= 40,
  },
  {
    id: 'unique_rank_10_5',
    name: 'Relic Pantheon',
    description: 'Raise 5 unique weapons to Rank 10.',
    emoji: '🌠',
    hidden: true,
    condition: s => s.uniqueMaxRankCount >= 5,
  },
  {
    id: 'codex_claims_100',
    name: 'Black Archive',
    description: 'Claim 100 codex rewards.',
    emoji: '🕮',
    hidden: true,
    condition: s => s.codexClaimCount >= 100,
  },

  // Achievement collection
  {
    id: 'legend_slate',
    name: 'Legend Slate',
    description: 'Unlock 20 achievements.',
    emoji: '📜',
    condition: s => s.unlockedCount >= 20,
  },
  {
    id: 'pantheon_ascend',
    name: 'Pantheon Ascendant',
    description: 'Unlock 50 achievements.',
    emoji: '⭐',
    condition: s => s.unlockedCount >= 50,
  },
  {
    id: 'ultimate_champion',
    name: 'Ultimate Champion',
    description: 'Unlock all achievements. You are eternal.',
    emoji: '🏆',
    condition: s => s.unlockedCount >= s.totalAchievementCount - 1,
  },
];

export interface StoryBeat {
  id: string;
  chapter: string;
  title: string;
  body: string;
  unlockWave: number;
  unlockPrestige?: number;
}

export const STORY_BEATS: StoryBeat[] = [
  {
    id: 'prologue_ash',
    chapter: 'Prologue',
    title: 'Ashen Signal',
    body: 'The frontier beacons relight after years of silence. Your command seal activates and old war machines answer your name.',
    unlockWave: 1,
  },
  {
    id: 'chapter_1_raiders',
    chapter: 'Chapter I',
    title: 'The Raider Accord',
    body: 'Scattered clans rally under a red standard. Every wave you clear denies their pact another foothold.',
    unlockWave: 10,
  },
  {
    id: 'chapter_2_verdant',
    chapter: 'Chapter II',
    title: 'Roots of the Citadel',
    body: 'Ancient gardens overrun the old roads. Beneath the vines, imperial vault doors begin to open on their own.',
    unlockWave: 20,
  },
  {
    id: 'chapter_3_glass',
    chapter: 'Chapter III',
    title: 'Glass and Oathfire',
    body: 'The crystal city fractures from within. Echoes of the first dynasty demand tribute in blood, gold, and memory.',
    unlockWave: 30,
  },
  {
    id: 'chapter_4_storm',
    chapter: 'Chapter IV',
    title: 'Storm Court',
    body: 'A council of storm captains crowns a false sovereign. Their fleets ride lightning across the abyss horizon.',
    unlockWave: 40,
  },
  {
    id: 'chapter_5_crownfall',
    chapter: 'Chapter V',
    title: 'Crownfall Depths',
    body: 'Sunken throne-ships awaken below black tide. Every captain you defeat restores one lost imperial oath.',
    unlockWave: 50,
  },
  {
    id: 'chapter_6_eclipse',
    chapter: 'Chapter VI',
    title: 'Eternal Eclipse',
    body: 'Daylight dies over the campaign line. Your banner is now one of the final symbols of lawful command.',
    unlockWave: 60,
  },
  {
    id: 'chapter_7_abyss',
    chapter: 'Chapter VII',
    title: 'Abyssal Maw',
    body: 'The monsters no longer retreat. They are converging. Something vast stirs in the deep, drawn by your victories.',
    unlockWave: 80,
  },
  {
    id: 'chapter_8_ascendant',
    chapter: 'Chapter VIII',
    title: 'Ascendant Path',
    body: 'The boundary between mortal and legend begins to dissolve. Your heroes transform. The cost of power becomes visible.',
    unlockWave: 100,
  },
  {
    id: 'ascension_first',
    chapter: 'Ascension I',
    title: 'Rebirth Protocol',
    body: 'Death no longer closes the ledger. You begin rewriting fate through controlled collapse and rebirth cores. Your first cycle completes.',
    unlockWave: 100,
    unlockPrestige: 1,
  },
  {
    id: 'chapter_9_throne',
    chapter: 'Chapter IX',
    title: 'Throne of Kings',
    body: 'Wave 150 marks a reign. Empires rise from your legacies. Ancient records now bear your seal across generations.',
    unlockWave: 150,
  },
  {
    id: 'chapter_10_eternity',
    chapter: 'Chapter X',
    title: 'Eternity Engine',
    body: "Wave 200. Your heroes' names become myth. The cycles accelerate. You are no longer led by time; you lead it.",
    unlockWave: 200,
  },
  {
    id: 'ascension_empire',
    chapter: 'Ascension II',
    title: 'Dynasty Engine',
    body: 'Your cycles form a war-dynasty. Heroes no longer fight for survival alone, but for succession across eras. Legacy multiplies.',
    unlockWave: 180,
    unlockPrestige: 5,
  },
  {
    id: 'chapter_11_void',
    chapter: 'Chapter XI',
    title: 'Void Covenant',
    body: 'Wave 300. The abyss speaks in your voice now. Cults emerge in your wake, seeking the secret of your infinite return.',
    unlockWave: 300,
  },
  {
    id: 'chapter_12_transcendence',
    chapter: 'Chapter XII',
    title: 'Transcendence',
    body: 'Wave 400. You are no longer mortal. Neither are those who follow you. The cosmos itself bends to your campaign.',
    unlockWave: 400,
  },
  {
    id: 'ascension_eternal',
    chapter: 'Ascension III',
    title: 'Eternal Recursion',
    body: 'Prestige 10+. Your rebirths now create branching timelines. Each cycle feeds the next. You are unstoppable.',
    unlockWave: 250,
    unlockPrestige: 10,
  },
  {
    id: 'chapter_13_singularity',
    chapter: 'Chapter XIII',
    title: 'Singularity Breach',
    body: 'Wave 500. Reality fractures under the weight of your victories. The final monsters are echoes of collapsed universes.',
    unlockWave: 500,
  },
  {
    id: 'finale_voidthrone',
    chapter: 'Finale',
    title: 'The Empty Throne',
    body: 'At the edge of all things, one throne remains unclaimed. The cults, captains, and dynasts now turn toward you. The choice is yours alone.',
    unlockWave: 300,
    unlockPrestige: 10,
  },
  {
    id: 'ascension_infinite',
    chapter: 'Apotheosis',
    title: 'Infinite Ascension',
    body: 'Prestige 25+. You have transcended the limitations of your world. Godhood is no longer a destination—it is a waypoint.',
    unlockWave: 600,
    unlockPrestige: 25,
  },
];

export const COST_SCALE = 1.15;
export const REBIRTH_BONUS = 1.5;
export const REBIRTH_WAVE_THRESHOLD = 100;

export function getRebirthWaveRequirement(prestigeCount: number): number {
  const clampedPrestige = Math.max(0, Math.floor(prestigeCount));
  return Math.max(1, Math.ceil(REBIRTH_WAVE_THRESHOLD * Math.pow(1.12, clampedPrestige)));
}

// ── Weekly Events / Mission Board ──────────────────────────────────────────

export interface WeeklyEventConfig {
  id: string;
  name: string;
  description: string;
  emoji: string;
  enemyHpMultiplier: number;
  enemyDamageMultiplier: number;
  goldMultiplier: number;
  expMultiplier: number;
  shardMultiplier: number;
}

export const WEEKLY_EVENTS: WeeklyEventConfig[] = [
  {
    id: 'no_armor_week',
    name: 'No Armor Week',
    description: 'Enemies lose heavy defenses. Faster clears, lighter resistance.',
    emoji: '🪓',
    enemyHpMultiplier: 0.85,
    enemyDamageMultiplier: 1,
    goldMultiplier: 1.05,
    expMultiplier: 1,
    shardMultiplier: 1,
  },
  {
    id: 'double_shard_drops',
    name: 'Double Shard Drops',
    description: 'Shard income surges from recycling and shard rewards.',
    emoji: '💎',
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    goldMultiplier: 1,
    expMultiplier: 1,
    shardMultiplier: 2,
  },
  {
    id: 'elite_waves_only',
    name: 'Elite Waves Only',
    description: 'Every wave is dangerous, but rewards are amplified.',
    emoji: '👹',
    enemyHpMultiplier: 1.2,
    enemyDamageMultiplier: 1.22,
    goldMultiplier: 1.25,
    expMultiplier: 1.25,
    shardMultiplier: 1.15,
  },
  {
    id: 'double_gold_week',
    name: 'Gold Rush',
    description: 'All gold rewards doubled. Time to fortify your treasury.',
    emoji: '🪙',
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    goldMultiplier: 2,
    expMultiplier: 1,
    shardMultiplier: 1,
  },
  {
    id: 'hero_experience_surge',
    name: 'Surge',
    description: 'Heroes gain XP at double rate. Perfect for leveling.',
    emoji: '⭐',
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    goldMultiplier: 1,
    expMultiplier: 2,
    shardMultiplier: 1,
  },
  {
    id: 'nightmare_assault',
    name: 'Nightmare',
    description: 'Monsters are tougher and hit harder, but rewards scale massively.',
    emoji: '💀',
    enemyHpMultiplier: 1.8,
    enemyDamageMultiplier: 1.5,
    goldMultiplier: 3,
    expMultiplier: 2.5,
    shardMultiplier: 2.5,
  },
  {
    id: 'essence_harvest',
    name: 'Essence Harvest',
    description: 'Essence drops increased. Perfect for ascending heroes.',
    emoji: '🌟',
    enemyHpMultiplier: 1.1,
    enemyDamageMultiplier: 1,
    goldMultiplier: 1.1,
    expMultiplier: 1.1,
    shardMultiplier: 1.5,
  },
  {
    id: 'balanced_week',
    name: 'Balanced Conquest',
    description: 'Enemies are moderate. Rewards are steady and reliable.',
    emoji: '⚖️',
    enemyHpMultiplier: 1,
    enemyDamageMultiplier: 1,
    goldMultiplier: 1.15,
    expMultiplier: 1.15,
    shardMultiplier: 1.15,
  },
];

export const WEEKLY_TRACK_MILESTONES = [25, 75, 150, 260];

export function weekNumberForTimestamp(ts: number): number {
  return Math.floor(ts / (7 * 24 * 60 * 60 * 1000));
}

export function getWeeklyEventByWeek(weekNumber: number): WeeklyEventConfig {
  return WEEKLY_EVENTS[Math.abs(weekNumber) % WEEKLY_EVENTS.length];
}

export function getWeeklyEventForTimestamp(ts: number): WeeklyEventConfig {
  return getWeeklyEventByWeek(weekNumberForTimestamp(ts));
}

export interface MissionBoardGoal {
  id: string;
  horizon: 'short' | 'medium' | 'long';
  title: string;
  description: string;
  metric: 'wave' | 'kills' | 'summons' | 'active_team' | 'hero_shards' | 'essence';
  target: number;
  rewardGold?: number;
  rewardShards?: number;
  rewardEssence?: number;
  rewardDiamonds?: number;
}

/**
 * Reward scaling formula by horizon tier.
 * Base gold scales with target difficulty; shards and diamonds follow tier brackets.
 */
const HORIZON_REWARD_SCALE = {
  short: { goldPerDifficulty: 60, shardBase: 80, diamondBase: 2 },
  medium: { goldPerDifficulty: 40, shardBase: 200, diamondBase: 5 },
  long: { goldPerDifficulty: 30, shardBase: 500, diamondBase: 12 },
} as const;

export const MISSION_BOARD_GOALS: MissionBoardGoal[] = [
  // ── Short-term missions (can complete in a single run) ──────────────
  {
    id: 'm_short_wave_20',
    horizon: 'short',
    title: 'Frontline Sprint',
    description: 'Reach Wave 20 this run.',
    metric: 'wave',
    target: 20,
    rewardGold: 1200,
    rewardShards: 80,
    rewardDiamonds: 2,
  },
  {
    id: 'm_short_wave_50',
    horizon: 'short',
    title: 'Surge Momentum',
    description: 'Reach Wave 50 this run.',
    metric: 'wave',
    target: 50,
    rewardGold: 3000,
    rewardShards: 150,
    rewardDiamonds: 4,
  },
  {
    id: 'm_short_team_4',
    horizon: 'short',
    title: 'Full Squad',
    description: 'Field 4 heroes in your active team.',
    metric: 'active_team',
    target: 4,
    rewardGold: 1000,
    rewardShards: 60,
    rewardDiamonds: 1,
  },
  {
    id: 'm_short_kills_100',
    horizon: 'short',
    title: 'Quick Dominance',
    description: 'Defeat 100 monsters this run.',
    metric: 'kills',
    target: 100,
    rewardGold: 1800,
    rewardShards: 100,
    rewardDiamonds: 2,
  },
  {
    id: 'm_short_summon_10',
    horizon: 'short',
    title: 'Fresh Recruits',
    description: 'Complete 10 hero summons.',
    metric: 'summons',
    target: 10,
    rewardGold: 1500,
    rewardShards: 100,
    rewardDiamonds: 2,
  },
  // ── Medium-term missions (multi-day/run goals) ───────────────────
  {
    id: 'm_medium_kills_250',
    horizon: 'medium',
    title: 'Campaign Attrition',
    description: 'Defeat 250 monsters total.',
    metric: 'kills',
    target: 250,
    rewardGold: 3200,
    rewardShards: 160,
  },
  {
    id: 'm_medium_kills_1000',
    horizon: 'medium',
    title: 'Slaughter Master',
    description: 'Defeat 1,000 monsters total.',
    metric: 'kills',
    target: 1000,
    rewardGold: 8000,
    rewardShards: 400,
    rewardDiamonds: 6,
  },
  {
    id: 'm_medium_summons_40',
    horizon: 'medium',
    title: 'Roster Architect',
    description: 'Complete 40 hero summons.',
    metric: 'summons',
    target: 40,
    rewardShards: 220,
    rewardEssence: 6,
    rewardDiamonds: 4,
  },
  {
    id: 'm_medium_summons_100',
    horizon: 'medium',
    title: 'Legion Builder',
    description: 'Complete 100 hero summons.',
    metric: 'summons',
    target: 100,
    rewardGold: 5000,
    rewardShards: 500,
    rewardEssence: 12,
    rewardDiamonds: 10,
  },
  {
    id: 'm_medium_wave_100',
    horizon: 'medium',
    title: 'Century Siege',
    description: 'Reach Wave 100 highest.',
    metric: 'wave',
    target: 100,
    rewardGold: 4000,
    rewardShards: 300,
    rewardEssence: 8,
    rewardDiamonds: 8,
  },
  // ── Long-term missions (prestige/progression goals) ────────────────
  {
    id: 'm_long_essence_60',
    horizon: 'long',
    title: 'Core Resonance',
    description: 'Accumulate 60 essence.',
    metric: 'essence',
    target: 60,
    rewardGold: 6000,
    rewardEssence: 10,
    rewardDiamonds: 8,
  },
  {
    id: 'm_long_essence_200',
    horizon: 'long',
    title: 'Eternal Essence Master',
    description: 'Accumulate 200 essence total.',
    metric: 'essence',
    target: 200,
    rewardGold: 15000,
    rewardShards: 600,
    rewardEssence: 25,
    rewardDiamonds: 15,
  },
  {
    id: 'm_long_shards_2000',
    horizon: 'long',
    title: 'Shard Dominion',
    description: 'Own 2,000 hero shards at once.',
    metric: 'hero_shards',
    target: 2000,
    rewardShards: 300,
    rewardEssence: 8,
  },
  {
    id: 'm_long_shards_10k',
    horizon: 'long',
    title: 'Crystalline Infinity',
    description: 'Own 10,000 hero shards at once.',
    metric: 'hero_shards',
    target: 10000,
    rewardGold: 20000,
    rewardShards: 1000,
    rewardEssence: 30,
    rewardDiamonds: 20,
  },
  {
    id: 'm_long_wave_250',
    horizon: 'long',
    title: 'Storm Marshal Ascendant',
    description: 'Reach Wave 250 highest.',
    metric: 'wave',
    target: 250,
    rewardGold: 12000,
    rewardShards: 800,
    rewardEssence: 20,
    rewardDiamonds: 15,
  },
  {
    id: 'm_long_wave_500',
    horizon: 'long',
    title: 'Infinite Path Pioneer',
    description: 'Reach Wave 500 highest. You transcend mortality.',
    metric: 'wave',
    target: 500,
    rewardGold: 30000,
    rewardShards: 2000,
    rewardEssence: 50,
    rewardDiamonds: 30,
  },
];
