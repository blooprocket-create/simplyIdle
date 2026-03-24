// ─────────────────────────────────────────────────────────────────────────────
//  IDLE RPG  –  Game Configuration
// ─────────────────────────────────────────────────────────────────────────────

export type PlayerClass =
  | 'warrior'
  | 'berserker'
  | 'archer'
  | 'mage'
  | 'monk';

export type GameTab = 'battle' | 'heroes' | 'stats' | 'achievements' | 'equipment';

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
      strength:     '⚔️ PRIMARY — High physical damage (1.25× weight). Invest here first.',
      vitality:     '🛡️ STRONG — Grows team HP pool and enemy damage reduction.',
      agility:      '🏃 DECENT — Minor physical bonus (1.2× speed scale).',
      intelligence: '💤 WEAK — Low magic weight (0.65×). Low priority for Warriors.',
      spirit:       '🌀 UTILITY — Boosts defense and minor magic. Good third pick.',
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
      strength:     '⚔️ PRIMARY — Rage power (1.15× weight). Core offensive stat.',
      vitality:     '🛡️ CORE — Tank mode sustain. Very high HP synergy. Prioritize.',
      agility:      '💤 LOW — Minor physical speed. Berserkers prefer raw power.',
      intelligence: '❌ SKIP — Near-useless (0.55× weight). Avoid entirely.',
      spirit:       '🌀 MINOR — Slight defense. Optional investment.',
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
      strength:     '⚔️ SOLID — Ranged physical base (1.35× weight). Works with AGI.',
      vitality:     '🛡️ MODERATE — Archers dodge, but some HP helps survivability.',
      agility:      '🏃 PRIMARY — Attack speed + physical scaling (1.2×). Max first.',
      intelligence: '💤 SKIP — Weak magic weight (0.50×). Not for Archers.',
      spirit:       '🌀 LOW — Minor ranged utility. Low priority.',
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
      strength:     '❌ SKIP — Nearly useless (0.45× weight). Never invest.',
      vitality:     '🛡️ MODERATE — Fragile by nature. Some HP investment helps.',
      agility:      '💤 LOW — Speed scaling is negligible for Mages.',
      intelligence: '🔮 PRIMARY — Main damage stat (1.45× weight). Always max first.',
      spirit:       '✨ STRONG — Powerful magic synergy (1.1× scale). Second priority.',
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
      strength:     '⚔️ SOLID — Balanced physical (0.85× weight). Good foundation.',
      vitality:     '🛡️ STRONG — HP + team aura healing rate. Very valuable.',
      agility:      '🏃 DECENT — Flow-state physical bonus. Moderate priority.',
      intelligence: '🔮 STRONG — Magic channel (1.05× weight). Strong investment.',
      spirit:       '✨ PRIMARY — Aura amplifier (1.1× scale + 1.25× team bonus). Max this.',
    },
  },
];

export function getClassConfig(playerClass: PlayerClass): ClassConfig {
  return CLASSES.find(c => c.id === playerClass) ?? CLASSES[0];
}

// ── Tutorial Quests ────────────────────────────────────────────────────────

export type TutorialEvent =
  | 'open_battle_tab'
  | 'open_heroes_tab'
  | 'open_stats_tab'
  | 'open_achievements_tab';

export interface TutorialQuest {
  id: string;
  title: string;
  description: string;
  targetTab: GameTab;
  rewardGold?: number;
  requiredEvent?: TutorialEvent;
  requiredState?: {
    minKills?: number;
    minSummons?: number;
    minActiveTeam?: number;
    minAllocatedStats?: number;
    minWave?: number;
  };
}

export const TUTORIAL_QUESTS: TutorialQuest[] = [
  {
    id: 'q_first_blood',
    title: 'Win Your First Fight',
    description: 'Stay on Battle and defeat 1 monster.',
    targetTab: 'battle',
    requiredState: { minKills: 1 },
    rewardGold: 500,
  },
  {
    id: 'q_open_heroes',
    title: 'Open Heroes Tab',
    description: 'Go to Heroes to manage your roster.',
    targetTab: 'heroes',
    requiredEvent: 'open_heroes_tab',
  },
  {
    id: 'q_use_free_summon',
    title: 'Use Free Summon',
    description: 'Press Summon Hero using your free summon charge.',
    targetTab: 'heroes',
    requiredState: { minSummons: 1 },
  },
  {
    id: 'q_build_team',
    title: 'Build Your Team',
    description: 'Add at least 1 hero to active team.',
    targetTab: 'heroes',
    requiredState: { minActiveTeam: 1 },
  },
  {
    id: 'q_open_stats',
    title: 'Open Stats Tab',
    description: 'Go to Stats to improve your class build.',
    targetTab: 'stats',
    requiredEvent: 'open_stats_tab',
  },
  {
    id: 'q_spend_stat',
    title: 'Spend a Stat Point',
    description: 'Press +1 on a stat that fits your class.',
    targetTab: 'stats',
    requiredState: { minAllocatedStats: 1 },
  },
  {
    id: 'q_back_to_battle',
    title: 'Return to Battle',
    description: 'Go back to Battle and keep pushing waves.',
    targetTab: 'battle',
    requiredEvent: 'open_battle_tab',
  },
  {
    id: 'q_wave_5',
    title: 'Frontline Rising',
    description: 'Reach wave 5 to complete the tutorial.',
    targetTab: 'battle',
    requiredState: { minWave: 5 },
    rewardGold: 300,
  },
];

// ── Equipment ──────────────────────────────────────────────────────────────

export type EquipmentSlot = 'weapon' | 'armor' | 'accessory';
export type EquipmentRarity = 'common' | 'rare' | 'epic' | 'legendary';

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
];

export const EQUIPMENT_CATALOG: EquipmentItem[] = [
  { id: 'w_warrior_blade', name: 'Iron Vanguard Blade', emoji: '⚔️', slot: 'weapon', rarity: 'common', allowedClasses: ['warrior'], description: 'Reliable frontline steel.', bonus: { strength: 3, vitality: 1 } },
  { id: 'w_warrior_hammer', name: 'Bastion Hammer', emoji: '🔨', slot: 'weapon', rarity: 'rare', allowedClasses: ['warrior'], description: 'Crushing blows for fortress walls.', bonus: { strength: 4, vitality: 2 } },
  { id: 'w_berserker_axe', name: 'Ragecleaver Axe', emoji: '🪓', slot: 'weapon', rarity: 'common', allowedClasses: ['berserker'], description: 'Heavy strikes with reckless force.', bonus: { strength: 3, vitality: 2 } },
  { id: 'w_berserker_chainaxe', name: 'Howlchain Axe', emoji: '⛓️', slot: 'weapon', rarity: 'epic', allowedClasses: ['berserker'], description: 'A savage weapon that feeds on chaos.', bonus: { strength: 6, agility: 1 } },
  { id: 'w_archer_bow', name: 'Falcon Recurve', emoji: '🏹', slot: 'weapon', rarity: 'common', allowedClasses: ['archer'], description: 'A bow built for rapid shots.', bonus: { agility: 3, strength: 1 } },
  { id: 'w_archer_longbow', name: 'Stormline Longbow', emoji: '🎯', slot: 'weapon', rarity: 'rare', allowedClasses: ['archer'], description: 'Pinpoint shots over impossible distance.', bonus: { agility: 5, spirit: 1 } },
  { id: 'w_mage_staff', name: 'Starglass Staff', emoji: '🔮', slot: 'weapon', rarity: 'rare', allowedClasses: ['mage'], description: 'Arcane conduit for spellburst.', bonus: { intelligence: 4 } },
  { id: 'w_mage_codex', name: 'Void Codex', emoji: '📘', slot: 'weapon', rarity: 'epic', allowedClasses: ['mage'], description: 'Whispers forbidden equations of power.', bonus: { intelligence: 6, spirit: 2 } },
  { id: 'w_monk_focus', name: 'Prayer Beads', emoji: '📿', slot: 'weapon', rarity: 'rare', allowedClasses: ['monk'], description: 'Focuses inner current.', bonus: { spirit: 3, intelligence: 1 } },
  { id: 'w_monk_katar', name: 'Zen Katar', emoji: '🗡️', slot: 'weapon', rarity: 'epic', allowedClasses: ['monk'], description: 'Silent blades guided by calm breath.', bonus: { agility: 3, spirit: 4 } },

  { id: 'a_plate', name: 'Knight Plate', emoji: '🛡️', slot: 'armor', rarity: 'common', allowedClasses: ['warrior'], description: 'Reinforced armor for long fights.', bonus: { vitality: 3, spirit: 1 } },
  { id: 'a_bulwark', name: 'Bulwark Aegis', emoji: '🧿', slot: 'armor', rarity: 'epic', allowedClasses: ['warrior'], description: 'A legendary shell that refuses to break.', bonus: { vitality: 7, spirit: 2 } },
  { id: 'a_hide', name: 'Bloodhide Harness', emoji: '🧱', slot: 'armor', rarity: 'rare', allowedClasses: ['berserker'], description: 'Built to absorb punishment.', bonus: { vitality: 4 } },
  { id: 'a_wolfmantle', name: 'Wolfmantle', emoji: '🐺', slot: 'armor', rarity: 'epic', allowedClasses: ['berserker'], description: 'Predatory instinct wrapped in hide.', bonus: { vitality: 5, strength: 2 } },
  { id: 'a_leather', name: 'Ranger Leathers', emoji: '🦌', slot: 'armor', rarity: 'common', allowedClasses: ['archer'], description: 'Light movement and clean aim.', bonus: { agility: 2, vitality: 1 } },
  { id: 'a_phantomcloak', name: 'Phantom Cloak', emoji: '🕶️', slot: 'armor', rarity: 'epic', allowedClasses: ['archer'], description: 'A veil that makes every step unseen.', bonus: { agility: 5, spirit: 1 } },
  { id: 'a_robe', name: 'Astral Robe', emoji: '🧥', slot: 'armor', rarity: 'epic', allowedClasses: ['mage'], description: 'Runed cloth that amplifies mana.', bonus: { intelligence: 2, spirit: 2 } },
  { id: 'a_starweave', name: 'Starweave Mantle', emoji: '🌌', slot: 'armor', rarity: 'legendary', allowedClasses: ['mage'], description: 'Threads stitched from dying stars.', bonus: { intelligence: 7, spirit: 4 } },
  { id: 'a_wraps', name: 'Temple Wraps', emoji: '🥋', slot: 'armor', rarity: 'rare', allowedClasses: ['monk'], description: 'Flexible defense for body and mind.', bonus: { vitality: 2, spirit: 2 } },
  { id: 'a_lotusguard', name: 'Lotusguard Vest', emoji: '🌸', slot: 'armor', rarity: 'epic', allowedClasses: ['monk'], description: 'Balanced defense in every stance.', bonus: { vitality: 4, spirit: 3 } },

  { id: 'x_warrior_signet', name: 'Lioncrest Signet', emoji: '💍', slot: 'accessory', rarity: 'rare', allowedClasses: ['warrior'], description: 'Symbol of command.', bonus: { strength: 1, vitality: 1 } },
  { id: 'x_warrior_banner', name: 'Warlord Banner Pin', emoji: '🚩', slot: 'accessory', rarity: 'epic', allowedClasses: ['warrior'], description: 'Inspires nearby allies to hold.', bonus: { vitality: 3, spirit: 2 } },
  { id: 'x_berserker_totem', name: 'Blood Totem', emoji: '🩸', slot: 'accessory', rarity: 'epic', allowedClasses: ['berserker'], description: 'Feeds relentless fury.', bonus: { strength: 2 } },
  { id: 'x_berserker_fang', name: 'Rift Fang', emoji: '🦷', slot: 'accessory', rarity: 'legendary', allowedClasses: ['berserker'], description: 'A fang from something ancient and cruel.', bonus: { strength: 5, agility: 2 } },
  { id: 'x_archer_charm', name: 'Windcharm', emoji: '🍃', slot: 'accessory', rarity: 'rare', allowedClasses: ['archer'], description: 'Sharper reflex and release.', bonus: { agility: 2 } },
  { id: 'x_archer_scope', name: 'Hawkeye Scope', emoji: '🔭', slot: 'accessory', rarity: 'epic', allowedClasses: ['archer'], description: 'Reads wind and distance in a blink.', bonus: { agility: 4, intelligence: 1 } },
  { id: 'x_mage_orb', name: 'Aether Orb', emoji: '🔵', slot: 'accessory', rarity: 'legendary', allowedClasses: ['mage'], description: 'Dense arcane focus.', bonus: { intelligence: 2 } },
  { id: 'x_mage_seal', name: 'Chronoseal', emoji: '⌛', slot: 'accessory', rarity: 'legendary', allowedClasses: ['mage'], description: 'Bends moments between spells.', bonus: { intelligence: 5, spirit: 3 } },
  { id: 'x_monk_talisman', name: 'Lotus Talisman', emoji: '🪷', slot: 'accessory', rarity: 'epic', allowedClasses: ['monk'], description: 'Calm aura under pressure.', bonus: { spirit: 2 } },
  { id: 'x_monk_knot', name: 'Celestial Knot', emoji: '🪢', slot: 'accessory', rarity: 'legendary', allowedClasses: ['monk'], description: 'A sacred knot with perfect tension.', bonus: { spirit: 5, vitality: 2 } },
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

export function getStarterEquipmentForClass(playerClass: PlayerClass): string[] {
  const rank: Record<EquipmentRarity, number> = {
    common: 0,
    rare: 1,
    epic: 2,
    legendary: 3,
  };

  const classItems = EQUIPMENT_CATALOG.filter(item => item.allowedClasses.includes(playerClass));
  const pickForSlot = (slot: EquipmentSlot): string | null => {
    const slotItems = classItems
      .filter(item => item.slot === slot)
      .sort((a, b) => rank[a.rarity] - rank[b.rarity]);
    return slotItems[0]?.id ?? null;
  };

  return (['weapon', 'armor', 'accessory'] as EquipmentSlot[])
    .map(slot => pickForSlot(slot))
    .filter((id): id is string => !!id);
}

export type UsableItemEffect = 'heal_team_percent' | 'gain_gold_flat' | 'gain_exp_flat' | 'gain_shards_flat';

export interface UsableItem {
  id: string;
  name: string;
  emoji: string;
  description: string;
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
    effect: 'heal_team_percent',
    value: 0.35,
    dropWeight: 45,
  },
  {
    id: 'gold_cache',
    name: 'Gold Cache',
    emoji: '💰',
    description: 'Instantly grants 350 gold.',
    effect: 'gain_gold_flat',
    value: 350,
    dropWeight: 28,
  },
  {
    id: 'exp_scroll',
    name: 'Training Scroll',
    emoji: '📜',
    description: 'Instantly grants 220 EXP.',
    effect: 'gain_exp_flat',
    value: 220,
    dropWeight: 20,
  },
  {
    id: 'shard_cluster',
    name: 'Shard Cluster',
    emoji: '💠',
    description: 'Instantly grants 60 hero shards.',
    effect: 'gain_shards_flat',
    value: 60,
    dropWeight: 7,
  },
];

export function getUsableItem(id: string): UsableItem | undefined {
  return USABLE_ITEMS.find(item => item.id === id);
}

export function rollUsableItem(random: number): UsableItem {
  const totalWeight = USABLE_ITEMS.reduce((sum, item) => sum + item.dropWeight, 0);
  let cursor = random * totalWeight;
  for (const item of USABLE_ITEMS) {
    cursor -= item.dropWeight;
    if (cursor <= 0) return item;
  }
  return USABLE_ITEMS[0];
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'godly';

export interface RarityConfig {
  id: Rarity;
  label: string;
  color: string;
  chance: number; // out of 1
  boostMultiplier: number;
}

export const RARITIES: RarityConfig[] = [
  { id: 'common', label: 'Common', color: '#B8B8B8', chance: 0.5, boostMultiplier: 1.0 },
  { id: 'uncommon', label: 'Uncommon', color: '#6DDB7B', chance: 0.25, boostMultiplier: 1.15 },
  { id: 'rare', label: 'Rare', color: '#5DA8FF', chance: 0.13, boostMultiplier: 1.35 },
  { id: 'epic', label: 'Epic', color: '#B66BFF', chance: 0.07, boostMultiplier: 1.6 },
  { id: 'legendary', label: 'Legendary', color: '#FFB347', chance: 0.03, boostMultiplier: 1.95 },
  { id: 'mythic', label: 'Mythic', color: '#FF5B8A', chance: 0.015, boostMultiplier: 2.35 },
  { id: 'godly', label: 'Godly', color: '#FFE76A', chance: 0.005, boostMultiplier: 3.0 },
];

export interface HeroTemplate {
  id: string;
  name: string;
  heroClass: PlayerClass;
  emoji: string;
  baseTeamBoost: number; // decimal (0.06 = +6% base)
}

export interface HeroUnit extends HeroTemplate {
  uid: string;
  rarity: Rarity;
  level: number;  // hero's individual level
  rank: number;   // hero's star rank (1-10), separate from level
  teamBoost: number; // effective decimal after rarity multiplier
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

export function getRankConfig(rank: number): RankConfig | null {
  return RANK_CONFIGS.find(r => r.rankNumber === rank) ?? null;
}

// Calculate shards earned when recycling a hero
export function calculateShardReward(rarity: Rarity, level: number): number {
  const rarityBaseValue = {
    common: 5,
    uncommon: 15,
    rare: 40,
    epic: 100,
    legendary: 250,
    mythic: 600,
    godly: 1500,
  }[rarity] ?? 5;
  
  const levelMultiplier = 1 + (Math.max(1, level - 1) * 0.15);
  return Math.floor(rarityBaseValue * levelMultiplier);
}

export const HERO_POOL: HeroTemplate[] = [
  { id: 'h1', name: 'Kael Ironheart', heroClass: 'warrior', emoji: '⚔️', baseTeamBoost: 0.05 },
  { id: 'h2', name: 'Mira Oathguard', heroClass: 'warrior', emoji: '🛡️', baseTeamBoost: 0.055 },
  { id: 'h3', name: 'Drogan Ashfury', heroClass: 'berserker', emoji: '🪓', baseTeamBoost: 0.06 },
  { id: 'h4', name: 'Thorn Bloodhide', heroClass: 'berserker', emoji: '🧱', baseTeamBoost: 0.05 },
  { id: 'h5', name: 'Sylvi Windmark', heroClass: 'archer', emoji: '🏹', baseTeamBoost: 0.055 },
  { id: 'h6', name: 'Riven Hawkeye', heroClass: 'archer', emoji: '🎯', baseTeamBoost: 0.06 },
  { id: 'h7', name: 'Lunara Frostweave', heroClass: 'mage', emoji: '❄️', baseTeamBoost: 0.065 },
  { id: 'h8', name: 'Aziel Embermind', heroClass: 'mage', emoji: '🔥', baseTeamBoost: 0.06 },
  { id: 'h9', name: 'Shen Dawnfist', heroClass: 'monk', emoji: '👊', baseTeamBoost: 0.055 },
  { id: 'h10', name: 'Iria Lotusveil', heroClass: 'monk', emoji: '🪷', baseTeamBoost: 0.06 },
  { id: 'h11', name: 'Borin Stonewall', heroClass: 'warrior', emoji: '⛰️', baseTeamBoost: 0.05 },
  { id: 'h12', name: 'Karra Rageborn', heroClass: 'berserker', emoji: '🩸', baseTeamBoost: 0.065 },
  { id: 'h13', name: 'Nyx Whisperleaf', heroClass: 'archer', emoji: '🌿', baseTeamBoost: 0.055 },
  { id: 'h14', name: 'Vex Starchant', heroClass: 'mage', emoji: '✨', baseTeamBoost: 0.07 },
  { id: 'h15', name: 'Tarin Sunstep', heroClass: 'monk', emoji: '☀️', baseTeamBoost: 0.06 },
];

export const MAX_EQUIPPED_HEROES = 5;
export const ACTIVE_TEAM_SIZE = 4;  // heroes in battle (+ player = 5 total)
export const GACHA_SUMMON_COST = 500;
export const HERO_LEVEL_EXP_FORMULA = (level: number) => Math.floor(50 * Math.pow(1.18, level - 1));
export const HERO_LEVEL_CAP = 999;

export function rollRarity(random: number): Rarity {
  let acc = 0;
  for (const r of RARITIES) {
    acc += r.chance;
    if (random <= acc) return r.id;
  }
  return 'common';
}

export function rarityConfig(rarity: Rarity): RarityConfig {
  return RARITIES.find(r => r.id === rarity) ?? RARITIES[0];
}

// ── Combat / Economy ───────────────────────────────────────────────────────

export type PartyId =
  | 'squire'
  | 'archer'
  | 'mage'
  | 'cleric'
  | 'paladin'
  | 'assassin'
  | 'dragonrider';

export interface PartyConfig {
  id: PartyId;
  name: string;
  emoji: string;
  description: string;
  baseCost: number;
  baseDps: number;
}

export interface SkillConfig {
  id: string;
  name: string;
  description: string;
  cost: number;
  targetId: PartyId | 'click';
  multiplier: number;
  requiresCount?: number;
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
  const base = Math.floor(30 * Math.pow(1.18, wave - 1));
  return isBoss ? base * 6 : base;
}

export function getMonsterGold(wave: number): number {
  const isBoss = wave % 10 === 0;
  const base = Math.max(8, Math.floor(8 * Math.pow(1.12, wave - 1)));
  return isBoss ? base * 6 : base;
}

export function getMonsterExp(wave: number): number {
  const isBoss = wave % 10 === 0;
  const base = Math.max(10, Math.floor(wave * 5));
  return isBoss ? base * 4 : base;
}

export function getMonsterDamage(wave: number): number {
  // Enemy damage per second based on wave
  const isBoss = wave % 10 === 0;
  const base = Math.max(0.5, Math.floor(0.8 * Math.pow(1.15, wave - 1)) / 10);
  return isBoss ? base * 3 : base;
}

export function expForLevel(level: number): number {
  return Math.floor(80 * Math.pow(1.22, level - 1));
}

export const PARTY: PartyConfig[] = [
  { id: 'squire', name: 'Squire', emoji: '⚔️', description: 'A loyal beginner warrior.', baseCost: 70, baseDps: 2 },
  { id: 'archer', name: 'Archer Squad', emoji: '🏹', description: 'Rain arrows from afar.', baseCost: 420, baseDps: 9 },
  { id: 'mage', name: 'Mage Circle', emoji: '🔮', description: 'Arcane artillery battery.', baseCost: 3_200, baseDps: 48 },
  { id: 'cleric', name: 'Cleric Order', emoji: '🙏', description: 'Holy pressure and support.', baseCost: 24_000, baseDps: 240 },
  { id: 'paladin', name: 'Paladin Guard', emoji: '🛡️', description: 'Elite divine frontline.', baseCost: 230_000, baseDps: 1_100 },
  { id: 'assassin', name: 'Assassin Cell', emoji: '🗡️', description: 'Silent burst specialists.', baseCost: 2_400_000, baseDps: 7_200 },
  { id: 'dragonrider', name: 'Dragon Riders', emoji: '🐉', description: 'Skyborne annihilation.', baseCost: 34_000_000, baseDps: 55_000 },
];

export const SKILLS: SkillConfig[] = [
  { id: 'click_1', name: 'Combat Drill', description: 'Manual attack ×2', cost: 300, targetId: 'click', multiplier: 2 },
  { id: 'click_2', name: 'Execution Stance', description: 'Manual attack ×2', cost: 12_000, targetId: 'click', multiplier: 2 },
  { id: 'click_3', name: 'Heroic Burst', description: 'Manual attack ×5', cost: 250_000, targetId: 'click', multiplier: 5 },
  { id: 'squire_1', name: 'Squire Bootcamp', description: 'Squires ×2', cost: 1_200, targetId: 'squire', multiplier: 2, requiresCount: 10 },
  { id: 'archer_1', name: 'Volley Doctrine', description: 'Archer Squad ×2', cost: 8_000, targetId: 'archer', multiplier: 2, requiresCount: 10 },
  { id: 'mage_1', name: 'Rune Matrix', description: 'Mage Circle ×2', cost: 80_000, targetId: 'mage', multiplier: 2, requiresCount: 10 },
  { id: 'cleric_1', name: 'Sanctified Chorus', description: 'Cleric Order ×2', cost: 650_000, targetId: 'cleric', multiplier: 2, requiresCount: 10 },
  { id: 'paladin_1', name: 'Vow of Steel', description: 'Paladin Guard ×2', cost: 6_500_000, targetId: 'paladin', multiplier: 2, requiresCount: 10 },
  { id: 'assassin_1', name: 'Night Protocol', description: 'Assassin Cell ×2', cost: 65_000_000, targetId: 'assassin', multiplier: 2, requiresCount: 10 },
  { id: 'dragon_1', name: 'Sky Dominion', description: 'Dragon Riders ×2', cost: 800_000_000, targetId: 'dragonrider', multiplier: 2, requiresCount: 10 },
];

export interface Achievement {
  id: string;
  name: string;
  description: string;
  emoji: string;
  condition: (s: {
    totalGold: number;
    totalKills: number;
    wave: number;
    level: number;
    prestigeCount: number;
    totalSummons: number;
    equippedCount: number;
  }) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_blood', name: 'First Blood', description: 'Defeat your first monster.', emoji: '🗡️', condition: s => s.totalKills >= 1 },
  { id: 'kills_100', name: 'Monster Slayer', description: 'Defeat 100 monsters.', emoji: '☠️', condition: s => s.totalKills >= 100 },
  { id: 'wave_50', name: 'Veteran Front', description: 'Reach wave 50.', emoji: '⚔️', condition: s => s.wave >= 50 },
  { id: 'level_25', name: 'Ascendant', description: 'Reach hero level 25.', emoji: '⭐', condition: s => s.level >= 25 },
  { id: 'gold_1m', name: 'Gold Baron', description: 'Earn 1,000,000 total gold.', emoji: '💰', condition: s => s.totalGold >= 1_000_000 },
  { id: 'summon_10', name: 'Collector', description: 'Summon 10 heroes.', emoji: '🎴', condition: s => s.totalSummons >= 10 },
  { id: 'equip_5', name: 'Dream Team', description: 'Equip 4 heroes.', emoji: '🧩', condition: s => s.equippedCount >= 4 },
  { id: 'rebirth_1', name: 'Reborn', description: 'Complete your first Rebirth.', emoji: '♾️', condition: s => s.prestigeCount >= 1 },
];

export const COST_SCALE = 1.15;
export const REBIRTH_BONUS = 1.5;
export const REBIRTH_WAVE_THRESHOLD = 100;
