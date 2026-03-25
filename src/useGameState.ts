import { useEffect, useRef, useCallback, useReducer, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  PARTY,
  SKILLS,
  ACHIEVEMENTS,
  TUTORIAL_QUESTS,
  COST_SCALE,
  REBIRTH_BONUS,
  REBIRTH_WAVE_THRESHOLD,
  PartyId,
  PlayerClass,
  StatKey,
  StatBlock,
  EquipmentSlot,
  HeroUnit,
  Rarity,
  TutorialEvent,
  PermanentUnlockId,
  HeroPassiveTraitId,
  HeroActiveSkillArchetypeId,
  HERO_POOL,
  ACTIVE_TEAM_SIZE,
  HERO_LEVEL_EXP_FORMULA,
  HERO_LEVEL_CAP,
  WeeklyEventConfig,
  MissionBoardGoal,
  getMonsterMaxHp,
  getMonsterForWave,
  getMonsterGold,
  getMonsterExp,
  getMonsterDamage,
  WEEKLY_TRACK_MILESTONES,
  MISSION_BOARD_GOALS,
  getWeeklyEventByWeek,
  getWeeklyEventForTimestamp,
  weekNumberForTimestamp,
  getActForWave,
  getBossUnlockForWave,
  getClassPassive,
  getHeroActiveArchetypeInfo,
  getMonsterAffixes,
  expForLevel,
  getClassConfig,
  getEquipmentItem,
  getStarterEquipmentForClass,
  EQUIPMENT_CATALOG,
  equipmentRarityConfig,
  getUsableItem,
  rollUsableItem,
  rollEquipmentRarityByTier,
  rollRarity,
  rarityConfig,
  getRankUpShardCost,
  getRankStatMultiplier,
  calculateShardReward,
  unlockLabel,
} from './gameConfig';
import { buildingCost, bulkCost } from './utils';
import { trackEvent } from './telemetry';

const SAVE_KEY = 'idlerpg_save_v3';
const TICK_MS = 100;
const SAVE_INTERVAL_MS = 5000;
const STAT_POINTS_PER_LEVEL = 5;
const OFFLINE_PROGRESS_CAP_MS = 8 * 60 * 60 * 1000;
const PITY_THRESHOLD = 30;
const SAFE_INTEGER_CAP = Number.MAX_SAFE_INTEGER;
const MAX_SAVE_WAVE = 1_000_000;
const MAX_SAVE_PLAYER_LEVEL = 1_000_000;
const MAX_SAVE_COLLECTION = 500;
const MAX_SAVE_LOG_ENTRIES = 100;
const MAX_SAVE_SUMMON_HISTORY = 50;

const VALID_PLAYER_CLASSES = new Set<PlayerClass>(['warrior', 'berserker', 'archer', 'mage', 'monk']);
const VALID_RARITIES = new Set<Rarity>(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'godly']);
const VALID_AUTO_RECYCLE_RARITIES = new Set<Rarity>(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'godly']);
const VALID_PERMANENT_UNLOCKS = new Set<PermanentUnlockId>(['class_passive', 'advanced_consumables', 'mythic_equipment']);
const VALID_HERO_FORMATION_ROLES = new Set<HeroFormationRole>(['front', 'mid', 'back']);
const VALID_PARTY_IDS = new Set<PartyId>(PARTY.map(party => party.id));
const VALID_SKILL_IDS = new Set(SKILLS.map(skill => skill.id));
const VALID_ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map(achievement => achievement.id));
const VALID_MISSION_IDS = new Set(MISSION_BOARD_GOALS.map(mission => mission.id));
const VALID_WEEKLY_TRACK_MILESTONES = new Set(WEEKLY_TRACK_MILESTONES);
const VALID_TUTORIAL_QUEST_IDS = new Set(TUTORIAL_QUESTS.map(quest => quest.id));

export function getCharacterSaveSlot(accountName: string, playerClass: PlayerClass): string {
  return `${accountName}_${playerClass}`;
}

export function getSaveStorageKey(saveSlot: string): string {
  return `${SAVE_KEY}_${saveSlot}`;
}

interface RewardPopup {
  id: string;
  kind: 'gold' | 'item' | 'shard' | 'system';
  title: string;
  detail: string;
}

interface SummonHistoryEntry {
  id: string;
  heroName: string;
  heroEmoji: string;
  rarity: Rarity;
  ts: number;
  pityTriggered: boolean;
}

type HeroFormationRole = 'front' | 'mid' | 'back';
type CombatTempo = 1 | 2 | 4;

const ACHIEVEMENT_BONUS_PER_UNLOCK = 0.03;
const ACHIEVEMENT_BONUS_CAP = 0.75;

export interface GameState {
  playerName: string;
  playerClass: PlayerClass | null;
  characterCreated: boolean;

  gold: number;
  totalGold: number;
  exp: number;
  totalExp: number;
  level: number;
  highestWaveReached: number;
  unspentStatPoints: number;
  statsAlloc: StatBlock;

  totalKills: number;
  burstCharge: number;  // 0-25; increments on each kill, resets on BURST
  wave: number;
  monsterHp: number;
  monsterMaxHp: number;
  teamHp: number;
  teamMaxHp: number;

  party: Record<PartyId, number>;
  skills: Set<string>;

  heroRoster: HeroUnit[];
  activeTeamHeroIds: string[];  // 4 heroes in battle (+ player = 5 total)
  totalSummons: number;
  firstSummonGiven: boolean;  // track if free summon given on first kill
  freeSummonCharges: number;
  bossTears: number;  // drops 1 per boss kill; used as the gacha summon currency
  heroShards: number;  // currency used to rank up heroes
  essence: number;
  rebirthCores: number;
  rebirthDamagePath: number;
  rebirthEconomyPath: number;
  rebirthSurvivalPath: number;
  autoRecycleMaxRarity: Rarity;
  equipmentScrap: number;
  gachaPityCounter: number;
  summonHistory: SummonHistoryEntry[];
  teamLoadouts: string[][];
  heroFormationByUid: Record<string, HeroFormationRole>;
  classMasteryXp: Record<PlayerClass, number>;
  seasonPoints: number;
  bestSeasonPoints: number;
  dailyLoginStreak: number;
  lastDailyLoginDay: number | null;
  streakInsuranceCharges: number;
  weeklyEventWeek: number;
  weeklyEventId: string;
  weeklyKills: number;
  weeklyTrackClaimed: number[];
  claimedMissionIds: string[];
  seenHintIds: string[];
  permanentUnlocks: PermanentUnlockId[];
  metaDamageLevel: number;
  metaEconomyLevel: number;
  metaSurvivalLevel: number;

  inventoryItemIds: string[];
  equippedItems: Record<EquipmentSlot, string | null>;
  usableItemCounts: Record<string, number>;
  autoUsePotionEnabled: boolean;
  autoUsePotionThresholdPct: number;
  autoRecycleEnabled: boolean;
  autoSummonEnabled: boolean;
  autoSummonMode: 'single' | 'x10';
  combatTempo: CombatTempo;
  autoSummonReserveGold: number;
  autoSummonCooldownMs: number;
  lastActiveAt: number;

  tutorialEnabled: boolean;
  tutorialCurrentQuestIndex: number;
  tutorialCompletedQuestIds: string[];
  allocatedStatPoints: number;

  prestigeCount: number;
  achievements: Set<string>;
  newAchievement: string | null;
  rewardQueue: RewardPopup[];
  combatLog: string[];
  damageBuffPct: number;
  damageBuffMs: number;
  damageReductionBuffPct: number;
  damageReductionBuffMs: number;
  heroActiveCdMs: Record<string, number>;
}

const initialParty = (): Record<PartyId, number> =>
  Object.fromEntries(PARTY.map(p => [p.id, 0])) as Record<PartyId, number>;

const blankStats: StatBlock = {
  strength: 0,
  vitality: 0,
  agility: 0,
  intelligence: 0,
  spirit: 0,
};

const DEFAULT_STATE: GameState = {
  playerName: '',
  playerClass: null,
  characterCreated: false,

  gold: 0,
  totalGold: 0,
  exp: 0,
  totalExp: 0,
  level: 1,
  highestWaveReached: 1,
  unspentStatPoints: 0,
  statsAlloc: blankStats,

  totalKills: 0,
  burstCharge: 0,
  wave: 1,
  monsterHp: getMonsterMaxHp(1),
  monsterMaxHp: getMonsterMaxHp(1),
  teamHp: 100,
  teamMaxHp: 100,

  party: initialParty(),
  skills: new Set(),

  heroRoster: [],
  activeTeamHeroIds: [],
  totalSummons: 0,
  firstSummonGiven: false,
  freeSummonCharges: 0,
  bossTears: 0,
  heroShards: 0,
  essence: 0,
  rebirthCores: 0,
  rebirthDamagePath: 0,
  rebirthEconomyPath: 0,
  rebirthSurvivalPath: 0,
  autoRecycleMaxRarity: 'uncommon',
  equipmentScrap: 0,
  gachaPityCounter: 0,
  summonHistory: [],
  teamLoadouts: [[], [], []],
  heroFormationByUid: {},
  classMasteryXp: {
    warrior: 0,
    berserker: 0,
    archer: 0,
    mage: 0,
    monk: 0,
  },
  seasonPoints: 0,
  bestSeasonPoints: 0,
  dailyLoginStreak: 0,
  lastDailyLoginDay: null,
  streakInsuranceCharges: 1,
  weeklyEventWeek: weekNumberForTimestamp(Date.now()),
  weeklyEventId: getWeeklyEventForTimestamp(Date.now()).id,
  weeklyKills: 0,
  weeklyTrackClaimed: [],
  claimedMissionIds: [],
  seenHintIds: [],
  permanentUnlocks: [],
  metaDamageLevel: 0,
  metaEconomyLevel: 0,
  metaSurvivalLevel: 0,

  inventoryItemIds: [],
  equippedItems: {
    weapon: null,
    armor: null,
    accessory: null,
  },
  usableItemCounts: {},
  autoUsePotionEnabled: false,
  autoUsePotionThresholdPct: 0.35,
  autoRecycleEnabled: false,
  autoSummonEnabled: false,
  autoSummonMode: 'single',
  combatTempo: 1,
  autoSummonReserveGold: 5000,
  autoSummonCooldownMs: 0,
  lastActiveAt: Date.now(),

  tutorialEnabled: true,
  tutorialCurrentQuestIndex: 0,
  tutorialCompletedQuestIds: [],
  allocatedStatPoints: 0,

  prestigeCount: 0,
  achievements: new Set(),
  newAchievement: null,
  rewardQueue: [],
  combatLog: [],
  damageBuffPct: 0,
  damageBuffMs: 0,
  damageReductionBuffPct: 0,
  damageReductionBuffMs: 0,
  heroActiveCdMs: {},
};

function sumStats(a: StatBlock, b: StatBlock): StatBlock {
  return {
    strength: a.strength + b.strength,
    vitality: a.vitality + b.vitality,
    agility: a.agility + b.agility,
    intelligence: a.intelligence + b.intelligence,
    spirit: a.spirit + b.spirit,
  };
}

function getEquipmentBonusStats(state: GameState): StatBlock {
  const bonus: StatBlock = {
    strength: 0,
    vitality: 0,
    agility: 0,
    intelligence: 0,
    spirit: 0,
  };

  for (const itemId of Object.values(state.equippedItems)) {
    if (!itemId) continue;
    const item = getEquipmentItem(itemId);
    if (!item) continue;
    bonus.strength += item.bonus.strength ?? 0;
    bonus.vitality += item.bonus.vitality ?? 0;
    bonus.agility += item.bonus.agility ?? 0;
    bonus.intelligence += item.bonus.intelligence ?? 0;
    bonus.spirit += item.bonus.spirit ?? 0;
  }

  return bonus;
}

function derivedStats(state: GameState): StatBlock {
  const cls = getClassConfig(state.playerClass ?? 'warrior');
  return sumStats(sumStats(cls.baseStats, state.statsAlloc), getEquipmentBonusStats(state));
}

function getCurrentTutorialQuest(state: GameState) {
  if (!state.tutorialEnabled) return null;
  return TUTORIAL_QUESTS[state.tutorialCurrentQuestIndex] ?? null;
}

function isQuestCompleteForState(state: GameState, event?: TutorialEvent): boolean {
  const quest = getCurrentTutorialQuest(state);
  if (!quest) return false;

  if (quest.requiredEvent && quest.requiredEvent !== event) {
    return false;
  }

  const req = quest.requiredState;
  if (!req) return true;

  if ((req.minKills ?? 0) > state.totalKills) return false;
  if ((req.minSummons ?? 0) > state.totalSummons) return false;
  if ((req.minActiveTeam ?? 0) > state.activeTeamHeroIds.length) return false;
  if ((req.minAllocatedStats ?? 0) > state.allocatedStatPoints) return false;
  if ((req.minWave ?? 0) > state.wave) return false;

  return true;
}

function progressTutorial(state: GameState, event?: TutorialEvent): GameState {
  if (!state.tutorialEnabled) return state;

  let next = state;
  let consumedEvent = event;

  while (next.tutorialCurrentQuestIndex < TUTORIAL_QUESTS.length) {
    if (!isQuestCompleteForState(next, consumedEvent)) break;

    const quest = TUTORIAL_QUESTS[next.tutorialCurrentQuestIndex];
    const rewardGold = quest.rewardGold ?? 0;
    const nextIndex = next.tutorialCurrentQuestIndex + 1;

    next = {
      ...next,
      tutorialCurrentQuestIndex: nextIndex,
      tutorialCompletedQuestIds: [...next.tutorialCompletedQuestIds, quest.id],
      gold: next.gold + rewardGold,
      totalGold: next.totalGold + rewardGold,
      tutorialEnabled: nextIndex < TUTORIAL_QUESTS.length,
    };

    if (rewardGold > 0) {
      next = queueReward(next, {
        id: `quest_${quest.id}_${Date.now()}`,
        kind: 'gold',
        title: `Quest Complete: ${quest.title}`,
        detail: `+${rewardGold} gold`,
      });
    }

    // Event requirements should only satisfy a single quest at a time.
    consumedEvent = undefined;
  }

  return next;
}

function getTeamHeroBoost(state: GameState): number {
  const activeTeam = new Set(state.activeTeamHeroIds);
  return state.heroRoster
    .filter(h => activeTeam.has(h.uid))
    .reduce((sum, h) => sum + h.teamBoost, 0);
}

function getClassMasteryLevel(state: GameState, playerClass: PlayerClass | null): number {
  if (!playerClass) return 0;
  const xp = state.classMasteryXp[playerClass] ?? 0;
  return Math.floor(xp / 100);
}

function defaultFormationForClass(playerClass: PlayerClass): HeroFormationRole {
  if (playerClass === 'warrior' || playerClass === 'berserker') return 'front';
  if (playerClass === 'mage' || playerClass === 'archer') return 'back';
  return 'mid';
}

function getFormationRoleForHero(state: GameState, hero: HeroUnit): HeroFormationRole {
  return state.heroFormationByUid[hero.uid] ?? defaultFormationForClass(hero.heroClass);
}

function getFormationMultipliers(state: GameState): {
  dpsMult: number;
  hpMult: number;
  incomingMult: number;
  front: number;
  mid: number;
  back: number;
} {
  const active = new Set(state.activeTeamHeroIds);
  let front = 0;
  let mid = 0;
  let back = 0;
  let dpsMult = 1;
  let hpMult = 1;
  let incomingMult = 1;

  for (const hero of state.heroRoster) {
    if (!active.has(hero.uid)) continue;
    const role = getFormationRoleForHero(state, hero);
    if (role === 'front') {
      front += 1;
      hpMult *= 1.06;
      incomingMult *= 0.95;
      if (hero.heroClass === 'warrior' || hero.heroClass === 'berserker' || hero.heroClass === 'monk') {
        incomingMult *= 0.96;
      } else {
        dpsMult *= 0.98;
      }
    } else if (role === 'mid') {
      mid += 1;
      dpsMult *= 1.03;
      hpMult *= 1.02;
      incomingMult *= 0.99;
    } else {
      back += 1;
      dpsMult *= 1.05;
      incomingMult *= 1.03;
      if (hero.heroClass === 'archer' || hero.heroClass === 'mage') {
        dpsMult *= 1.04;
      } else {
        incomingMult *= 1.02;
      }
    }
  }

  dpsMult = Math.min(1.95, dpsMult);
  hpMult = Math.min(1.85, hpMult);
  incomingMult = Math.max(0.68, Math.min(1.35, incomingMult));

  return { dpsMult, hpMult, incomingMult, front, mid, back };
}

function factionForClass(playerClass: PlayerClass): 'vanguard' | 'ranger' | 'arcanum' | 'aegis' {
  if (playerClass === 'warrior' || playerClass === 'berserker') return 'vanguard';
  if (playerClass === 'archer') return 'ranger';
  if (playerClass === 'mage') return 'arcanum';
  return 'aegis';
}

function getTeamSynergy(state: GameState): {
  dpsMult: number;
  hpMult: number;
  incomingMult: number;
  goldMult: number;
  expMult: number;
  active: Array<{ id: string; name: string; effect: string }>;
} {
  const activeIds = new Set(state.activeTeamHeroIds);
  const activeHeroes = state.heroRoster.filter(hero => activeIds.has(hero.uid));
  const classCounts: Record<PlayerClass, number> = {
    warrior: 0,
    berserker: 0,
    archer: 0,
    mage: 0,
    monk: 0,
  };
  const factionCounts = {
    vanguard: 0,
    ranger: 0,
    arcanum: 0,
    aegis: 0,
  };

  for (const hero of activeHeroes) {
    classCounts[hero.heroClass] += 1;
    factionCounts[factionForClass(hero.heroClass)] += 1;
  }

  let dpsMult = 1;
  let hpMult = 1;
  let incomingMult = 1;
  let goldMult = 1;
  let expMult = 1;
  const active: Array<{ id: string; name: string; effect: string }> = [];

  if (factionCounts.vanguard >= 2) {
    hpMult *= 1.12;
    active.push({ id: 'vanguard_wall', name: 'Vanguard Wall', effect: '+12% team HP' });
  }

  if (factionCounts.ranger >= 1 && factionCounts.arcanum >= 1) {
    dpsMult *= 1.10;
    active.push({ id: 'spellshot', name: 'Spellshot Link', effect: '+10% team DPS' });
  }

  if ((classCounts.warrior + classCounts.berserker) >= 1 && classCounts.monk >= 1) {
    incomingMult *= 0.93;
    active.push({ id: 'iron_mandala', name: 'Iron Mandala', effect: '-7% incoming damage' });
  }

  const uniqueClassCount = (Object.values(classCounts) as number[]).filter(n => n > 0).length;
  if (uniqueClassCount >= 4) {
    dpsMult *= 1.08;
    expMult *= 1.08;
    active.push({ id: 'grand_coalition', name: 'Grand Coalition', effect: '+8% DPS, +8% EXP' });
  }

  const monoClass = (Object.values(classCounts) as number[]).some(n => n === activeHeroes.length && activeHeroes.length >= 3);
  if (monoClass) {
    goldMult *= 1.18;
    active.push({ id: 'warband_focus', name: 'Warband Focus', effect: '+18% gold gains' });
  }

  return { dpsMult, hpMult, incomingMult, goldMult, expMult, active };
}

function rarityRank(rarity: Rarity): number {
  return {
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
    mythic: 5,
    godly: 6,
  }[rarity] ?? 0;
}

function queueReward(state: GameState, reward: RewardPopup): GameState {
  return {
    ...state,
    rewardQueue: [...state.rewardQueue, reward],
  };
}

function queueCombatLog(state: GameState, line: string): GameState {
  return {
    ...state,
    combatLog: [`${new Date().toLocaleTimeString()} • ${line}`, ...state.combatLog].slice(0, 24),
  };
}

function getHeroPassiveMultipliers(state: GameState): {
  dpsMult: number;
  goldMult: number;
  expMult: number;
  incomingDmgMult: number;
} {
  const team = new Set(state.activeTeamHeroIds);
  let dpsMult = 1;
  let goldMult = 1;
  let expMult = 1;
  let incomingDmgMult = 1;

  for (const hero of state.heroRoster) {
    if (!team.has(hero.uid)) continue;
    const trait: HeroPassiveTraitId = hero.passiveTrait;
    if (trait === 'warpath_instinct') dpsMult *= 1.03;
    if (trait === 'fortune_hunter') goldMult *= 1.04;
    if (trait === 'sage_instinct') expMult *= 1.03;
    if (trait === 'bulwark_instinct') incomingDmgMult *= 0.98;
  }

  return {
    dpsMult: Math.min(1.4, dpsMult),
    goldMult: Math.min(1.6, goldMult),
    expMult: Math.min(1.45, expMult),
    incomingDmgMult: Math.max(0.72, incomingDmgMult),
  };
}

function decayBuffs(state: GameState, elapsedMs: number): GameState {
  const nextDmgMs = Math.max(0, state.damageBuffMs - elapsedMs);
  const nextDrMs = Math.max(0, state.damageReductionBuffMs - elapsedMs);
  const nextAutoSummonCd = Math.max(0, state.autoSummonCooldownMs - elapsedMs);
  return {
    ...state,
    damageBuffMs: nextDmgMs,
    damageReductionBuffMs: nextDrMs,
    damageBuffPct: nextDmgMs > 0 ? state.damageBuffPct : 0,
    damageReductionBuffPct: nextDrMs > 0 ? state.damageReductionBuffPct : 0,
    autoSummonCooldownMs: nextAutoSummonCd,
  };
}

function maybeAutoRecycleBackground(state: GameState): GameState {
  if (!state.autoRecycleEnabled) return state;
  const activeTeam = new Set(state.activeTeamHeroIds);
  const maxRank = rarityRank(state.autoRecycleMaxRarity);
  const toRecycle = state.heroRoster.filter(h => !activeTeam.has(h.uid) && rarityRank(h.rarity) <= maxRank);
  if (toRecycle.length === 0) return state;

  const recycledIds = new Set(toRecycle.map(h => h.uid));
  const weekly = getCurrentWeeklyEvent(state);
  const shardReward = Math.ceil(toRecycle.reduce((sum, hero) => sum + calculateShardReward(hero.rarity, hero.level), 0) * weekly.shardMultiplier);
  const newRoster = state.heroRoster.filter(h => !recycledIds.has(h.uid));
  const newMaxHp = getTeamMaxHp({ ...state, heroRoster: newRoster });

  return queueReward({
    ...state,
    heroRoster: newRoster,
    heroShards: state.heroShards + shardReward,
    teamMaxHp: newMaxHp,
    teamHp: Math.min(state.teamHp, newMaxHp),
  }, {
    id: `bg_auto_recycle_${Date.now()}`,
    kind: 'shard',
    title: 'Auto Recycle (Background)',
    detail: `+${shardReward} shards from ${toRecycle.length} heroes`,
  });
}

function maybeAutoSummonTick(state: GameState): GameState {
  if (!state.autoSummonEnabled) return state;
  if (state.autoSummonCooldownMs > 0) return state;
  const trySingle = (): GameState | null => {
    const canUseFree = state.freeSummonCharges > 0;
    if (!canUseFree && state.bossTears < 1) return null;

    const template = HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
    const roll = rollRarityWithPity(state.gachaPityCounter);
    const rarity = roll.rarity;
    const rarityMult = rarityConfig(rarity).boostMultiplier;
    const uid = `${template.id}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const hero: HeroUnit = {
      ...template,
      uid,
      rarity,
      level: 1,
      rank: 1,
      teamBoost: Number((template.baseTeamBoost * rarityMult).toFixed(4)),
    };
    const historyEntry: SummonHistoryEntry = {
      id: `hist_${uid}`,
      heroName: hero.name,
      heroEmoji: hero.emoji,
      rarity: hero.rarity,
      ts: Date.now(),
      pityTriggered: roll.pityTriggered,
    };
    let nextState = withAchievement(progressTutorial({
      ...state,
      bossTears: canUseFree ? state.bossTears : state.bossTears - 1,
      heroRoster: [hero, ...state.heroRoster],
      summonHistory: [historyEntry, ...state.summonHistory].slice(0, 60),
      totalSummons: state.totalSummons + 1,
      freeSummonCharges: canUseFree ? state.freeSummonCharges - 1 : state.freeSummonCharges,
      gachaPityCounter: roll.nextCounter,
      autoSummonCooldownMs: 1200,
    }));
    nextState = queueCombatLog(nextState, `Auto Summon: ${hero.emoji} ${hero.name} (${hero.rarity})`);
    return nextState;
  };

  const tryX10 = (): GameState | null => {
    const totalPulls = 10;
    const freeUses = Math.min(state.freeSummonCharges, totalPulls);
    const paidUses = totalPulls - freeUses;
    if (state.bossTears < paidUses) return null;

    const summoned: HeroUnit[] = [];
    const historyBatch: SummonHistoryEntry[] = [];
    let pityCounter = state.gachaPityCounter;
    for (let i = 0; i < totalPulls; i++) {
      const template = HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
      const roll = rollRarityWithPity(pityCounter);
      pityCounter = roll.nextCounter;
      const rarity = roll.rarity;
      const rarityMult = rarityConfig(rarity).boostMultiplier;
      const uid = `${template.id}_${Date.now()}_${i}_${Math.floor(Math.random() * 10000)}`;
      const summonedHero: HeroUnit = {
        ...template,
        uid,
        rarity,
        level: 1,
        rank: 1,
        teamBoost: Number((template.baseTeamBoost * rarityMult).toFixed(4)),
      };
      summoned.push(summonedHero);
      historyBatch.push({
        id: `hist_${uid}`,
        heroName: summonedHero.name,
        heroEmoji: summonedHero.emoji,
        rarity: summonedHero.rarity,
        ts: Date.now(),
        pityTriggered: roll.pityTriggered,
      });
    }

    let nextState = withAchievement(progressTutorial({
      ...state,
      bossTears: state.bossTears - paidUses,
      heroRoster: [...summoned, ...state.heroRoster],
      summonHistory: [...historyBatch, ...state.summonHistory].slice(0, 60),
      totalSummons: state.totalSummons + totalPulls,
      freeSummonCharges: state.freeSummonCharges - freeUses,
      gachaPityCounter: pityCounter,
      autoSummonCooldownMs: 1800,
    }));
    nextState = queueCombatLog(nextState, `Auto Summon x10 completed`);
    return nextState;
  };

  if (state.autoSummonMode === 'x10') {
    const x10 = tryX10();
    if (x10) return x10;
    const single = trySingle();
    if (single) return single;
    return state;
  }

  const single = trySingle();
  return single ?? state;
}

function tickHeroActives(state: GameState, elapsedMs: number): GameState {
  const team = new Set(state.activeTeamHeroIds);
  if (team.size === 0) return state;

  let nextState = state;
  const cooldowns: Record<string, number> = { ...state.heroActiveCdMs };

  for (const hero of state.heroRoster) {
    if (!team.has(hero.uid)) continue;
    cooldowns[hero.uid] = Math.max(0, (cooldowns[hero.uid] ?? 0) - elapsedMs);
    if (cooldowns[hero.uid] > 0) continue;

    const role = getFormationRoleForHero(nextState, hero);
    const roleTriggerMult = role === 'back' ? 1.22 : role === 'mid' ? 1.05 : 0.92;
    const triggerChance = Math.min(0.16, 0.015 + hero.level * 0.00012) * roleTriggerMult * (elapsedMs / 1000);
    if (Math.random() > triggerChance) continue;

    const archetype: HeroActiveSkillArchetypeId = hero.activeSkillArchetype;
    const info = getHeroActiveArchetypeInfo(archetype);

    if (archetype === 'frontline_ward') {
      nextState = {
        ...nextState,
        damageReductionBuffPct: Math.max(nextState.damageReductionBuffPct, 0.2),
        damageReductionBuffMs: Math.max(nextState.damageReductionBuffMs, 3500),
      };
      nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} cast ${info.name} (team guard up)`);
    }

    if (archetype === 'burst_volley') {
      const burst = Math.ceil(nextState.monsterMaxHp * 0.08);
      nextState = {
        ...nextState,
        monsterHp: Math.max(1, nextState.monsterHp - burst),
      };
      nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} used ${info.name} for ${burst} burst`);
    }

    if (archetype === 'battle_chant') {
      nextState = {
        ...nextState,
        damageBuffPct: Math.max(nextState.damageBuffPct, 0.18),
        damageBuffMs: Math.max(nextState.damageBuffMs, 4200),
      };
      nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} activated ${info.name} (+DPS)`);
    }

    if (archetype === 'mending_pulse') {
      const heal = Math.ceil(nextState.teamMaxHp * 0.1);
      nextState = {
        ...nextState,
        teamHp: Math.min(nextState.teamMaxHp, nextState.teamHp + heal),
      };
      nextState = queueCombatLog(nextState, `${hero.emoji} ${hero.name} triggered ${info.name} (+${heal} HP)`);
    }

    cooldowns[hero.uid] = 8000;
  }

  return {
    ...nextState,
    heroActiveCdMs: cooldowns,
  };
}

function getTeamMaxHp(state: GameState): number {
  // Player character HP
  const playerStats = derivedStats(state);
  let maxHp = (playerStats.vitality + 5) * 10;

  // Active team heroes HP
  const activeTeam = new Set(state.activeTeamHeroIds);
  for (const hero of state.heroRoster) {
    if (activeTeam.has(hero.uid)) {
      const heroClass = getClassConfig(hero.heroClass);
      const rankMult = getRankMultiplier(hero.rank, hero.rarity);
      const heroVit = (heroClass.baseStats.vitality + hero.level * 0.8) * rankMult;
      maxHp += (heroVit + 3) * 8;
    }
  }

  const survivalMult = getMetaSurvivalMultiplier(state);
  const formation = getFormationMultipliers(state);
  const synergy = getTeamSynergy(state);
  const masteryLevel = getClassMasteryLevel(state, state.playerClass);
  const masteryHpMult = 1 + Math.min(0.25, Math.floor(masteryLevel / 4) * 0.02);
  return Math.ceil(maxHp * survivalMult * getRebirthSurvivalMultiplier(state) * formation.hpMult * synergy.hpMult * masteryHpMult);
}

function getTeamDefense(state: GameState): number {
  // Damage reduction based on team defense stats
  const playerStats = derivedStats(state);
  let defense = playerStats.vitality * 0.3 + playerStats.spirit * 0.15;

  const activeTeam = new Set(state.activeTeamHeroIds);
  for (const hero of state.heroRoster) {
    if (activeTeam.has(hero.uid)) {
      const heroClass = getClassConfig(hero.heroClass);
      const rankMult = getRankMultiplier(hero.rank, hero.rarity);
      const heroVit = (heroClass.baseStats.vitality + hero.level * 0.8) * rankMult;
      const heroSpirit = (heroClass.baseStats.spirit + hero.level * 0.5) * rankMult;
      defense += heroVit * 0.2 + heroSpirit * 0.1;
    }
  }

  const formation = getFormationMultipliers(state);
  const synergy = getTeamSynergy(state);
  return Math.max(0, defense * getMetaSurvivalMultiplier(state) * getRebirthSurvivalMultiplier(state) * formation.hpMult * synergy.hpMult);
}

function getDps(state: GameState): number {
  const cls = getClassConfig(state.playerClass ?? 'warrior');
  const stats = derivedStats(state);
  const rebirthMult = Math.pow(REBIRTH_BONUS, state.prestigeCount);

  // Player damage contribution
  const physical = stats.strength * 2 + stats.agility * 1.2 + state.level * 0.8;
  const magic = stats.intelligence * 2 + stats.spirit * 1.1 + state.level * 0.8;

  let playerDps = ((physical * cls.physWeight * 0.4) + (magic * cls.magicWeight * 0.3)) / 2.5;

  // Active team heroes damage
  let heroDps = 0;
  const activeTeam = new Set(state.activeTeamHeroIds);
  for (const hero of state.heroRoster) {
    if (activeTeam.has(hero.uid)) {
      const heroClass = getClassConfig(hero.heroClass);
      const rankMult = getRankMultiplier(hero.rank, hero.rarity);
      const heroStr = (heroClass.baseStats.strength + hero.level * 0.9) * rankMult;
      const heroInt = (heroClass.baseStats.intelligence + hero.level * 0.85) * rankMult;
      const heroAgi = (heroClass.baseStats.agility + hero.level * 0.7) * rankMult;

      const heroPhy = heroStr * 2 + heroAgi * 1.2 + hero.level * 0.5;
      const heroMag = heroInt * 2 + ((heroClass.baseStats.spirit + hero.level * 0.6) * rankMult) * 1.1;

      const heroDmg = ((heroPhy * heroClass.physWeight * 0.4) + (heroMag * heroClass.magicWeight * 0.3)) / 3;
      heroDps += heroDmg;
    }
  }

  const passive = state.playerClass ? getClassPassive(state.playerClass) : null;
  const classPassiveMult = hasUnlock(state, 'class_passive') && passive ? passive.dpsMultiplier : 1;
  const heroPassive = getHeroPassiveMultipliers(state);
  const activeBuffMult = 1 + state.damageBuffPct;
  const formation = getFormationMultipliers(state);
  const synergy = getTeamSynergy(state);
  const masteryLevel = getClassMasteryLevel(state, state.playerClass);
  const masteryDpsMult = 1 + Math.min(0.4, masteryLevel * 0.01);
  const totalDps = (playerDps + heroDps)
    * rebirthMult
    * getAchievementBonusMultiplier(state)
    * getMetaDamageMultiplier(state)
    * getRebirthDamageMultiplier(state)
    * classPassiveMult
    * heroPassive.dpsMult
    * formation.dpsMult
    * synergy.dpsMult
    * masteryDpsMult
    * activeBuffMult;
  return Math.max(1, totalDps);
}

function getClickDamage(state: GameState): number {
  const cls = getClassConfig(state.playerClass ?? 'warrior');
  const stats = derivedStats(state);
  const rebirthMult = Math.pow(REBIRTH_BONUS, state.prestigeCount);

  const physical = stats.strength * 2 + stats.agility * 1.2 + state.level * 0.8;
  const magic = stats.intelligence * 2 + stats.spirit * 1.1 + state.level * 0.8;

  let manual = ((physical * cls.physWeight * 0.35) + (magic * cls.magicWeight * 0.2)) / 8;
  for (const sk of SKILLS) {
    if (sk.targetId === 'click' && state.skills.has(sk.id)) {
      manual *= sk.multiplier;
    }
  }

  // Manual input is intentionally secondary to team DPS.
  return Math.max(1, manual * rebirthMult * 0.75 * getAchievementBonusMultiplier(state));
}

function getAchievementBonusMultiplier(state: GameState): number {
  const pct = Math.min(ACHIEVEMENT_BONUS_CAP, state.achievements.size * ACHIEVEMENT_BONUS_PER_UNLOCK);
  return 1 + pct;
}

function hasUnlock(state: GameState, unlock: PermanentUnlockId): boolean {
  return state.permanentUnlocks.includes(unlock);
}

function getMetaDamageMultiplier(state: GameState): number {
  return 1 + state.metaDamageLevel * 0.05;
}

function getMetaEconomyMultiplier(state: GameState): number {
  return 1 + state.metaEconomyLevel * 0.05;
}

function getMetaSurvivalMultiplier(state: GameState): number {
  return 1 + state.metaSurvivalLevel * 0.05;
}

function getEssenceUpgradeCost(level: number): number {
  return 20 + (level + 1) * (level + 1) * 12;
}

function getRebirthPathCost(level: number): number {
  return 1 + Math.floor(level * 0.8) + Math.floor((level * level) / 8);
}

function getRebirthDamageMultiplier(state: GameState): number {
  return 1 + state.rebirthDamagePath * 0.07;
}

function getRebirthEconomyMultiplier(state: GameState): number {
  return 1 + state.rebirthEconomyPath * 0.07;
}

function getRebirthSurvivalMultiplier(state: GameState): number {
  return 1 + state.rebirthSurvivalPath * 0.07;
}

const EQUIP_RARITY_ORDER: Array<'common' | 'rare' | 'epic' | 'legendary' | 'mythic'> = ['common', 'rare', 'epic', 'legendary', 'mythic'];

/** Gold cost to manually level a hero from `level` to `level+1` via gold. */
export function getHeroGoldLevelCost(level: number): number {
  return Math.floor(100 * Math.pow(1.08, level - 1));
}

export function getEquipmentCraftCost(slot: EquipmentSlot): { scrap: number; gold: number } {
  const costBySlot: Record<EquipmentSlot, { scrap: number; gold: number }> = {
    weapon: { scrap: 130, gold: 1800 },
    armor: { scrap: 120, gold: 1500 },
    accessory: { scrap: 100, gold: 1200 },
  };
  return costBySlot[slot];
}

function getEquipmentUpgradePlan(state: GameState, itemId: string): {
  canUpgrade: boolean;
  targetItemId: string | null;
  targetRarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic' | null;
  scrapCost: number;
  essenceCost: number;
  goldCost: number;
  reason?: string;
} {
  const item = getEquipmentItem(itemId);
  if (!item) {
    return { canUpgrade: false, targetItemId: null, targetRarity: null, scrapCost: 0, essenceCost: 0, goldCost: 0, reason: 'Missing item' };
  }

  const idx = EQUIP_RARITY_ORDER.indexOf(item.rarity);
  if (idx < 0 || idx >= EQUIP_RARITY_ORDER.length - 1) {
    return { canUpgrade: false, targetItemId: null, targetRarity: null, scrapCost: 0, essenceCost: 0, goldCost: 0, reason: 'At max rarity' };
  }

  let step = 0;
  for (let i = idx + 1; i < EQUIP_RARITY_ORDER.length; i++) {
    const rarity = EQUIP_RARITY_ORDER[i];
    if (rarity === 'mythic' && !hasUnlock(state, 'mythic_equipment')) {
      return { canUpgrade: false, targetItemId: null, targetRarity: null, scrapCost: 0, essenceCost: 0, goldCost: 0, reason: 'Mythic tier locked' };
    }
    const pool = EQUIPMENT_CATALOG.filter(candidate =>
      candidate.slot === item.slot
      && candidate.rarity === rarity
      && candidate.allowedClasses.some(cls => item.allowedClasses.includes(cls)),
    );
    step++;
    if (pool.length > 0) {
      const baseCostByRarity: Record<string, { scrap: number; essence: number; gold: number }> = {
        common: { scrap: 80, essence: 0, gold: 1400 },
        rare: { scrap: 170, essence: 4, gold: 4200 },
        epic: { scrap: 300, essence: 8, gold: 12000 },
        legendary: { scrap: 500, essence: 14, gold: 32000 },
      };
      const base = baseCostByRarity[item.rarity] ?? { scrap: 0, essence: 0, gold: 0 };
      const scrapCost = Math.ceil(base.scrap * (1 + (step - 1) * 0.55));
      const essenceCost = Math.ceil(base.essence * (1 + (step - 1) * 0.5));
      const goldCost = Math.ceil(base.gold * (1 + (step - 1) * 0.75));
      const candidate = pool[Math.floor(Math.random() * pool.length)];
      return {
        canUpgrade: state.equipmentScrap >= scrapCost && state.essence >= essenceCost && state.gold >= goldCost,
        targetItemId: candidate.id,
        targetRarity: rarity,
        scrapCost,
        essenceCost,
        goldCost,
      };
    }
  }

  return { canUpgrade: false, targetItemId: null, targetRarity: null, scrapCost: 0, essenceCost: 0, goldCost: 0, reason: 'No higher tier candidate' };
}

function getShardToEssenceCost(state: GameState): number {
  return 600 + state.metaDamageLevel * 40 + state.metaEconomyLevel * 40 + state.metaSurvivalLevel * 40;
}

function getShardToScrapCost(): number {
  return 180;
}

function getCurrentWeeklyEvent(state: GameState): WeeklyEventConfig {
  return getWeeklyEventByWeek(state.weeklyEventWeek);
}

function getMissionProgressValue(state: GameState, mission: MissionBoardGoal): number {
  if (mission.metric === 'wave') return state.wave;
  if (mission.metric === 'kills') return state.totalKills;
  if (mission.metric === 'summons') return state.totalSummons;
  if (mission.metric === 'active_team') return state.activeTeamHeroIds.length;
  if (mission.metric === 'hero_shards') return state.heroShards;
  return state.essence;
}

function getRankMultiplier(rank: number, rarity: Rarity): number {
  return getRankStatMultiplier(rank, rarity);
}

function defaultTraitForClass(playerClass: PlayerClass): HeroPassiveTraitId {
  const map: Record<PlayerClass, HeroPassiveTraitId> = {
    warrior: 'bulwark_instinct',
    berserker: 'warpath_instinct',
    archer: 'fortune_hunter',
    mage: 'sage_instinct',
    monk: 'sage_instinct',
  };
  return map[playerClass];
}

function defaultActiveForClass(playerClass: PlayerClass): HeroActiveSkillArchetypeId {
  const map: Record<PlayerClass, HeroActiveSkillArchetypeId> = {
    warrior: 'frontline_ward',
    berserker: 'battle_chant',
    archer: 'burst_volley',
    mage: 'mending_pulse',
    monk: 'mending_pulse',
  };
  return map[playerClass];
}

function normalizeHero(hero: HeroUnit): HeroUnit {
  return {
    ...hero,
    passiveTrait: hero.passiveTrait ?? defaultTraitForClass(hero.heroClass),
    activeSkillArchetype: hero.activeSkillArchetype ?? defaultActiveForClass(hero.heroClass),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function clampFloat(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function clampBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clampString(value: unknown, fallback: string, maxLength: number): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLength);
}

function sanitizeStringList(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    sanitized.push(trimmed);
    if (sanitized.length >= maxItems) break;
  }

  return sanitized;
}

function sanitizeStatAllocation(raw: unknown, level: number): {
  statsAlloc: StatBlock;
  allocatedStatPoints: number;
  unspentStatPoints: number;
} {
  const record = isRecord(raw) ? raw : {};
  const budget = Math.max(0, (level - 1) * STAT_POINTS_PER_LEVEL);
  const requested: StatBlock = {
    strength: clampInt(record.strength, 0, budget, 0),
    vitality: clampInt(record.vitality, 0, budget, 0),
    agility: clampInt(record.agility, 0, budget, 0),
    intelligence: clampInt(record.intelligence, 0, budget, 0),
    spirit: clampInt(record.spirit, 0, budget, 0),
  };

  let remaining = budget;
  const statsAlloc: StatBlock = {
    strength: 0,
    vitality: 0,
    agility: 0,
    intelligence: 0,
    spirit: 0,
  };

  for (const key of ['strength', 'vitality', 'agility', 'intelligence', 'spirit'] as StatKey[]) {
    const next = Math.min(requested[key], remaining);
    statsAlloc[key] = next;
    remaining -= next;
  }

  return {
    statsAlloc,
    allocatedStatPoints: budget - remaining,
    unspentStatPoints: remaining,
  };
}

function sanitizeLoadedHero(raw: unknown, index: number): HeroUnit | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;

  const template = HERO_POOL.find(hero => hero.id === raw.id);
  if (!template) return null;

  const rarity = typeof raw.rarity === 'string' && VALID_RARITIES.has(raw.rarity as Rarity)
    ? raw.rarity as Rarity
    : 'common';
  const level = clampInt(raw.level, 1, HERO_LEVEL_CAP, 1);
  const rank = clampInt(raw.rank, 1, 10, 1);
  const uid = clampString(raw.uid, `${template.id}_${index}`, 64) || `${template.id}_${index}`;
  const rarityMult = rarityConfig(rarity).boostMultiplier;

  return normalizeHero({
    ...template,
    uid,
    rarity,
    level,
    rank,
    teamBoost: Number((template.baseTeamBoost * rarityMult).toFixed(4)),
  });
}

function sanitizeSaveData(payload: Partial<SaveData>) {
  const now = Date.now();
  const currentWeek = weekNumberForTimestamp(now);
  const currentDay = toDayNumber(now);
  const playerName = clampString(payload.playerName, '', 24);
  const playerClass = typeof payload.playerClass === 'string' && VALID_PLAYER_CLASSES.has(payload.playerClass as PlayerClass)
    ? payload.playerClass as PlayerClass
    : null;
  const characterCreated = clampBoolean(payload.characterCreated, false) && !!playerName && playerClass !== null;
  const level = clampInt(payload.level, 1, MAX_SAVE_PLAYER_LEVEL, 1);
  const wave = clampInt(payload.wave, 1, MAX_SAVE_WAVE, 1);
  const highestWaveReached = Math.max(
    wave,
    clampInt(payload.highestWaveReached ?? payload.highestLevelReached, 1, MAX_SAVE_WAVE, 1),
  );
  const { statsAlloc, allocatedStatPoints, unspentStatPoints } = sanitizeStatAllocation(payload.statsAlloc, level);
  const maxMonsterHp = getMonsterMaxHp(wave);
  const monsterHp = clampFloat(payload.monsterHp, 0, maxMonsterHp, maxMonsterHp);
  const teamMaxHp = Math.max(100, clampInt(payload.teamHp, 1, SAFE_INTEGER_CAP, 100));
  const teamHp = clampFloat(payload.teamHp, 0, teamMaxHp, teamMaxHp);

  const party = initialParty();
  if (isRecord(payload.party)) {
    for (const partyId of Object.keys(party) as PartyId[]) {
      party[partyId] = clampInt(payload.party[partyId], 0, SAFE_INTEGER_CAP, 0);
    }
  }

  const skills = sanitizeStringList(payload.skills, VALID_SKILL_IDS.size)
    .filter(skillId => VALID_SKILL_IDS.has(skillId));

  const heroRoster: HeroUnit[] = [];
  const heroUidSet = new Set<string>();
  if (Array.isArray(payload.heroRoster)) {
    for (const [index, rawHero] of payload.heroRoster.entries()) {
      if (heroRoster.length >= MAX_SAVE_COLLECTION) break;
      const hero = sanitizeLoadedHero(rawHero, index);
      if (!hero || heroUidSet.has(hero.uid)) continue;
      heroUidSet.add(hero.uid);
      heroRoster.push(hero);
    }
  }

  const activeTeamHeroIds = sanitizeStringList(payload.activeTeamHeroIds, ACTIVE_TEAM_SIZE)
    .filter(uid => heroUidSet.has(uid))
    .slice(0, ACTIVE_TEAM_SIZE);

  const teamLoadouts = Array.isArray(payload.teamLoadouts)
    ? payload.teamLoadouts.slice(0, 3).map(loadout => sanitizeStringList(loadout, ACTIVE_TEAM_SIZE)
      .filter(uid => heroUidSet.has(uid))
      .slice(0, ACTIVE_TEAM_SIZE))
    : [];
  while (teamLoadouts.length < 3) teamLoadouts.push([]);

  const heroFormationByUid: Record<string, HeroFormationRole> = {};
  if (isRecord(payload.heroFormationByUid)) {
    for (const uid of Object.keys(payload.heroFormationByUid)) {
      if (!heroUidSet.has(uid)) continue;
      const role = payload.heroFormationByUid[uid];
      if (typeof role === 'string' && VALID_HERO_FORMATION_ROLES.has(role as HeroFormationRole)) {
        heroFormationByUid[uid] = role as HeroFormationRole;
      }
    }
  }

  const classMasteryXp = {
    warrior: clampInt(payload.classMasteryXp?.warrior, 0, SAFE_INTEGER_CAP, 0),
    berserker: clampInt(payload.classMasteryXp?.berserker, 0, SAFE_INTEGER_CAP, 0),
    archer: clampInt(payload.classMasteryXp?.archer, 0, SAFE_INTEGER_CAP, 0),
    mage: clampInt(payload.classMasteryXp?.mage, 0, SAFE_INTEGER_CAP, 0),
    monk: clampInt(payload.classMasteryXp?.monk, 0, SAFE_INTEGER_CAP, 0),
  };

  const inventoryItemIds = sanitizeStringList(payload.inventoryItemIds, MAX_SAVE_COLLECTION)
    .filter(itemId => !!getEquipmentItem(itemId));

  const equippedItems = {
    weapon: null as string | null,
    armor: null as string | null,
    accessory: null as string | null,
  };
  for (const slot of ['weapon', 'armor', 'accessory'] as EquipmentSlot[]) {
    const itemId = payload.equippedItems?.[slot];
    if (typeof itemId !== 'string') continue;
    const item = getEquipmentItem(itemId);
    if (!item || item.slot !== slot) continue;
    equippedItems[slot] = itemId;
  }

  const usableItemCounts: Record<string, number> = {};
  if (isRecord(payload.usableItemCounts)) {
    for (const [itemId, count] of Object.entries(payload.usableItemCounts)) {
      if (!getUsableItem(itemId)) continue;
      const sanitizedCount = clampInt(count, 0, SAFE_INTEGER_CAP, 0);
      if (sanitizedCount > 0) {
        usableItemCounts[itemId] = sanitizedCount;
      }
    }
  }

  const summonHistory = Array.isArray(payload.summonHistory)
    ? payload.summonHistory
      .slice(-MAX_SAVE_SUMMON_HISTORY)
      .filter((entry): entry is SummonHistoryEntry => isRecord(entry))
      .map((entry, index) => ({
        id: clampString(entry.id, `summon_${index}`, 64) || `summon_${index}`,
        heroName: clampString(entry.heroName, 'Unknown Hero', 64),
        heroEmoji: clampString(entry.heroEmoji, '🛡️', 4),
        rarity: typeof entry.rarity === 'string' && VALID_RARITIES.has(entry.rarity as Rarity)
          ? entry.rarity as Rarity
          : 'common',
        ts: clampInt(entry.ts, 0, now, now),
        pityTriggered: clampBoolean(entry.pityTriggered, false),
      }))
    : [];

  const weeklyEventWeek = clampInt(payload.weeklyEventWeek, 0, 1_000_000, currentWeek);
  const weeklyEventId = getWeeklyEventByWeek(weeklyEventWeek).id;
  const seasonPoints = clampInt(payload.seasonPoints, 0, SAFE_INTEGER_CAP, 0);
  const bestSeasonPoints = Math.max(seasonPoints, clampInt(payload.bestSeasonPoints, 0, SAFE_INTEGER_CAP, 0));
  const autoSummonMode: 'single' | 'x10' = payload.autoSummonMode === 'x10' ? 'x10' : 'single';
  const heroActiveCdMs = Object.fromEntries(
    Object.entries(isRecord(payload.heroActiveCdMs) ? payload.heroActiveCdMs : {})
      .filter(([uid]) => heroUidSet.has(uid))
      .map(([uid, ms]) => [uid, clampInt(ms, 0, 600_000, 0)] as const)
      .filter((entry): entry is readonly [string, number] => entry[1] > 0),
  );

  return {
    playerName,
    playerClass,
    characterCreated,
    gold: clampInt(payload.gold, 0, SAFE_INTEGER_CAP, 0),
    totalGold: Math.max(clampInt(payload.gold, 0, SAFE_INTEGER_CAP, 0), clampInt(payload.totalGold, 0, SAFE_INTEGER_CAP, 0)),
    exp: clampInt(payload.exp, 0, Math.max(0, expForLevel(level) - 1), 0),
    totalExp: clampInt(payload.totalExp, 0, SAFE_INTEGER_CAP, 0),
    level,
    highestWaveReached,
    unspentStatPoints,
    statsAlloc,
    totalKills: clampInt(payload.totalKills, 0, SAFE_INTEGER_CAP, 0),
    wave,
    monsterHp,
    monsterMaxHp: maxMonsterHp,
    teamHp,
    teamMaxHp,
    party,
    skills,
    heroRoster,
    activeTeamHeroIds,
    totalSummons: clampInt(payload.totalSummons, 0, SAFE_INTEGER_CAP, 0),
    firstSummonGiven: clampBoolean(payload.firstSummonGiven, false),
    freeSummonCharges: clampInt(payload.freeSummonCharges, 0, SAFE_INTEGER_CAP, 0),
    bossTears: clampInt(payload.bossTears, 0, SAFE_INTEGER_CAP, 0),
    heroShards: clampInt(payload.heroShards, 0, SAFE_INTEGER_CAP, 0),
    essence: clampInt(payload.essence, 0, SAFE_INTEGER_CAP, 0),
    rebirthCores: clampInt(payload.rebirthCores, 0, SAFE_INTEGER_CAP, 0),
    rebirthDamagePath: clampInt(payload.rebirthDamagePath, 0, SAFE_INTEGER_CAP, 0),
    rebirthEconomyPath: clampInt(payload.rebirthEconomyPath, 0, SAFE_INTEGER_CAP, 0),
    rebirthSurvivalPath: clampInt(payload.rebirthSurvivalPath, 0, SAFE_INTEGER_CAP, 0),
    autoRecycleMaxRarity: typeof payload.autoRecycleMaxRarity === 'string' && VALID_AUTO_RECYCLE_RARITIES.has(payload.autoRecycleMaxRarity as Rarity)
      ? payload.autoRecycleMaxRarity as Rarity
      : 'uncommon',
    equipmentScrap: clampInt(payload.equipmentScrap, 0, SAFE_INTEGER_CAP, 0),
    gachaPityCounter: clampInt(payload.gachaPityCounter, 0, PITY_THRESHOLD - 1, 0),
    summonHistory,
    teamLoadouts,
    heroFormationByUid,
    classMasteryXp,
    seasonPoints,
    bestSeasonPoints,
    dailyLoginStreak: clampInt(payload.dailyLoginStreak, 0, 100_000, 0),
    lastDailyLoginDay: payload.lastDailyLoginDay == null ? null : clampInt(payload.lastDailyLoginDay, 0, currentDay, currentDay),
    streakInsuranceCharges: clampInt(payload.streakInsuranceCharges, 0, SAFE_INTEGER_CAP, 1),
    weeklyEventWeek,
    weeklyEventId,
    weeklyKills: clampInt(payload.weeklyKills, 0, SAFE_INTEGER_CAP, 0),
    weeklyTrackClaimed: sanitizeStringList(payload.weeklyTrackClaimed, WEEKLY_TRACK_MILESTONES.length)
      .map(value => Number(value))
      .filter((value): value is number => Number.isFinite(value) && VALID_WEEKLY_TRACK_MILESTONES.has(value))
      .map(value => Math.floor(value)),
    claimedMissionIds: sanitizeStringList(payload.claimedMissionIds, VALID_MISSION_IDS.size)
      .filter(id => VALID_MISSION_IDS.has(id)),
    seenHintIds: sanitizeStringList(payload.seenHintIds, MAX_SAVE_LOG_ENTRIES),
    permanentUnlocks: sanitizeStringList(payload.permanentUnlocks, VALID_PERMANENT_UNLOCKS.size)
      .filter((id): id is PermanentUnlockId => VALID_PERMANENT_UNLOCKS.has(id as PermanentUnlockId)),
    metaDamageLevel: clampInt(payload.metaDamageLevel, 0, SAFE_INTEGER_CAP, 0),
    metaEconomyLevel: clampInt(payload.metaEconomyLevel, 0, SAFE_INTEGER_CAP, 0),
    metaSurvivalLevel: clampInt(payload.metaSurvivalLevel, 0, SAFE_INTEGER_CAP, 0),
    inventoryItemIds,
    equippedItems,
    usableItemCounts,
    autoUsePotionEnabled: clampBoolean(payload.autoUsePotionEnabled, false),
    autoUsePotionThresholdPct: clampFloat(payload.autoUsePotionThresholdPct, 0.05, 1, 0.35),
    autoRecycleEnabled: clampBoolean(payload.autoRecycleEnabled, false),
    autoSummonEnabled: clampBoolean(payload.autoSummonEnabled, false),
    autoSummonMode,
    combatTempo: payload.combatTempo === 2 || payload.combatTempo === 4 ? payload.combatTempo : 1,
    autoSummonReserveGold: clampInt(payload.autoSummonReserveGold, 0, SAFE_INTEGER_CAP, 5000),
    lastActiveAt: clampInt(payload.lastActiveAt, 0, now, now),
    tutorialEnabled: clampBoolean(payload.tutorialEnabled, true),
    tutorialCurrentQuestIndex: clampInt(payload.tutorialCurrentQuestIndex, 0, TUTORIAL_QUESTS.length, 0),
    tutorialCompletedQuestIds: sanitizeStringList(payload.tutorialCompletedQuestIds, TUTORIAL_QUESTS.length)
      .filter(id => VALID_TUTORIAL_QUEST_IDS.has(id)),
    allocatedStatPoints,
    prestigeCount: clampInt(payload.prestigeCount, 0, SAFE_INTEGER_CAP, 0),
    achievements: sanitizeStringList(payload.achievements, VALID_ACHIEVEMENT_IDS.size)
      .filter(id => VALID_ACHIEVEMENT_IDS.has(id)),
    combatLog: sanitizeStringList(payload.combatLog, MAX_SAVE_LOG_ENTRIES),
    damageBuffPct: clampFloat(payload.damageBuffPct, 0, 1, 0),
    damageBuffMs: clampInt(payload.damageBuffMs, 0, 600_000, 0),
    damageReductionBuffPct: clampFloat(payload.damageReductionBuffPct, 0, 1, 0),
    damageReductionBuffMs: clampInt(payload.damageReductionBuffMs, 0, 600_000, 0),
    heroActiveCdMs,
  };
}

export function computeStats(state: GameState) {
  const cls = getClassConfig(state.playerClass ?? 'warrior');
  const combined = derivedStats(state);
  const teamBoost = getTeamHeroBoost(state);
  const equipmentBonus = getEquipmentBonusStats(state);
  const formation = getFormationMultipliers(state);
  const synergy = getTeamSynergy(state);

  // Per-hero derived stats for display in the heroes tab
  const heroDetails: Record<string, {
    dps: number; hp: number;
    str: number; vit: number; agi: number; int: number; spr: number;
  }> = {};
  for (const hero of state.heroRoster) {
    const heroClass = getClassConfig(hero.heroClass);
    const rankMult = getRankMultiplier(hero.rank, hero.rarity);
    const hStr = (heroClass.baseStats.strength + hero.level * 0.9) * rankMult;
    const hInt = (heroClass.baseStats.intelligence + hero.level * 0.85) * rankMult;
    const hAgi = (heroClass.baseStats.agility + hero.level * 0.7) * rankMult;
    const hVit = (heroClass.baseStats.vitality + hero.level * 0.8) * rankMult;
    const hSpr = (heroClass.baseStats.spirit + hero.level * 0.6) * rankMult;
    const heroPhy = hStr * 2 + hAgi * 1.2 + hero.level * 0.5;
    const heroMag = hInt * 2 + hSpr * 1.1;
    const heroDps = ((heroPhy * heroClass.physWeight * 0.4) + (heroMag * heroClass.magicWeight * 0.3)) / 3;
    heroDetails[hero.uid] = {
      dps: heroDps,
      hp: Math.ceil((hVit + 3) * 8),
      str: Math.ceil(hStr), vit: Math.ceil(hVit), agi: Math.ceil(hAgi),
      int: Math.ceil(hInt), spr: Math.ceil(hSpr),
    };
  }

  return {
    className: cls.name,
    dps: getDps(state),
    teamDefense: getTeamDefense(state),
    damageBuffPct: state.damageBuffMs > 0 ? state.damageBuffPct : 0,
    damageReductionBuffPct: state.damageReductionBuffMs > 0 ? state.damageReductionBuffPct : 0,
    clickDmg: getClickDamage(state),
    achievementBonusPercent: getAchievementBonusMultiplier(state) - 1,
    expNeeded: expForLevel(state.level),
    expProgress: Math.min(1, state.exp / expForLevel(state.level)),
    // Return decimal (e.g. 0.06 = 6%) so UI can multiply by 100 once
    teamBoostPercent: teamBoost,
    combined,
    equipmentBonus,
    heroDetails,
    formation: {
      front: formation.front,
      mid: formation.mid,
      back: formation.back,
      dpsBonusPct: (formation.dpsMult - 1) * 100,
      hpBonusPct: (formation.hpMult - 1) * 100,
      incomingDeltaPct: (1 - formation.incomingMult) * 100,
    },
    synergies: synergy.active,
  };
}

function processLevelUp(exp: number, level: number): { exp: number; level: number; gainedLevels: number } {
  let remaining = exp;
  let lvl = level;
  let gainedLevels = 0;
  while (remaining >= expForLevel(lvl)) {
    remaining -= expForLevel(lvl);
    lvl++;
    gainedLevels++;
  }
  return { exp: remaining, level: lvl, gainedLevels };
}

function addUsableItemCount(counts: Record<string, number>, itemId: string, amount: number): Record<string, number> {
  const next = { ...counts };
  next[itemId] = Math.max(0, (next[itemId] ?? 0) + amount);
  if (next[itemId] === 0) delete next[itemId];
  return next;
}

function rollRarityWithPity(counter: number): { rarity: Rarity; nextCounter: number; pityTriggered: boolean } {
  const pityTriggered = counter + 1 >= PITY_THRESHOLD;
  if (pityTriggered) {
    const r = Math.random();
    const rarity: Rarity = r < 0.75 ? 'legendary' : r < 0.95 ? 'mythic' : 'godly';
    return { rarity, nextCounter: 0, pityTriggered: true };
  }

  const rarity = rollRarity(Math.random());
  const nextCounter = rarityRank(rarity) >= rarityRank('legendary') ? 0 : counter + 1;
  return { rarity, nextCounter, pityTriggered: false };
}

function equipmentScrapValue(rarity: ReturnType<typeof equipmentRarityConfig>['id']): number {
  return {
    common: 10,
    rare: 24,
    epic: 60,
    legendary: 160,
    mythic: 360,
  }[rarity] ?? 10;
}

function maybeAutoUsePotion(state: GameState): GameState {
  if (!state.autoUsePotionEnabled) return state;
  if (state.teamMaxHp <= 0) return state;
  if (state.teamHp / state.teamMaxHp > state.autoUsePotionThresholdPct) return state;
  const qty = state.usableItemCounts['small_potion'] ?? 0;
  if (qty <= 0) return state;

  const item = getUsableItem('small_potion');
  if (!item || item.effect !== 'heal_team_percent') return state;
  const healed = Math.ceil(state.teamMaxHp * item.value);
  return queueReward({
    ...state,
    usableItemCounts: addUsableItemCount(state.usableItemCounts, 'small_potion', -1),
    teamHp: Math.min(state.teamMaxHp, state.teamHp + healed),
  }, {
    id: `auto_potion_${Date.now()}`,
    kind: 'item',
    title: `Auto Used ${item.emoji} ${item.name}`,
    detail: `Restored ${healed} team HP`,
  });
}

function getMonsterAffixModifiers(wave: number) {
  const affixes = getMonsterAffixes(wave);
  return affixes.reduce(
    (acc, a) => ({
      hpMult: acc.hpMult * a.enemyHpMultiplier,
      dmgMult: acc.dmgMult * a.enemyDamageMultiplier,
      goldMult: acc.goldMult * a.goldMultiplier,
      expMult: acc.expMult * a.expMultiplier,
    }),
    { hpMult: 1, dmgMult: 1, goldMult: 1, expMult: 1 },
  );
}

function toDayNumber(ts: number): number {
  return Math.floor(ts / 86_400_000);
}

function killMonster(state: GameState): GameState {
  const weekly = getCurrentWeeklyEvent(state);
  const affix = getMonsterAffixModifiers(state.wave);
  const achievementMult = getAchievementBonusMultiplier(state);
  const economyMult = getMetaEconomyMultiplier(state);
  const heroPassive = getHeroPassiveMultipliers(state);
  const synergy = getTeamSynergy(state);
  const masteryLevel = getClassMasteryLevel(state, state.playerClass);
  const masteryEconomyMult = 1 + Math.min(0.25, Math.floor(masteryLevel / 5) * 0.01);
  const goldReward = Math.ceil(getMonsterGold(state.wave) * Math.pow(REBIRTH_BONUS, state.prestigeCount) * achievementMult * affix.goldMult * economyMult * getRebirthEconomyMultiplier(state) * heroPassive.goldMult * synergy.goldMult * masteryEconomyMult * weekly.goldMultiplier);
  const expReward = Math.ceil(getMonsterExp(state.wave) * achievementMult * affix.expMult * heroPassive.expMult * synergy.expMult * weekly.expMultiplier);
  const lvl = processLevelUp(state.exp + expReward, state.level);
  const isBoss = state.wave % 10 === 0;
  const act = getActForWave(state.wave);
  const essenceReward = isBoss ? Math.max(2, act.id + Math.floor(state.wave / 20)) : 0;

  // Level up active team heroes
  let updatedRoster = state.heroRoster;
  const activeTeam = new Set(state.activeTeamHeroIds);
  updatedRoster = updatedRoster.map(hero => {
    if (activeTeam.has(hero.uid) && hero.level < HERO_LEVEL_CAP) {
      return { ...hero, level: hero.level + 1 };
    }
    return hero;
  });

  const newWave = state.wave + 1;
  const nextMaxHp = getMonsterMaxHp(newWave);
  const newTeamMaxHp = getTeamMaxHp({ ...state, heroRoster: updatedRoster });

  let newState: GameState = {
    ...state,
    gold: state.gold + goldReward,
    totalGold: state.totalGold + goldReward,
    essence: state.essence + essenceReward,
    exp: lvl.exp,
    totalExp: state.totalExp + expReward,
    level: lvl.level,
    highestWaveReached: Math.max(state.highestWaveReached, newWave),
    unspentStatPoints: state.unspentStatPoints + lvl.gainedLevels * STAT_POINTS_PER_LEVEL,
    totalKills: state.totalKills + 1,
    burstCharge: Math.min(25, state.burstCharge + 1),
    weeklyKills: state.weeklyKills + 1,
    seasonPoints: state.seasonPoints + 12 + (isBoss ? 80 : 0),
    bestSeasonPoints: Math.max(state.bestSeasonPoints, state.seasonPoints + 12 + (isBoss ? 80 : 0)),
    wave: newWave,
    monsterHp: nextMaxHp,
    monsterMaxHp: nextMaxHp,
    teamHp: newTeamMaxHp,  // Heal team after win
    teamMaxHp: newTeamMaxHp,
    heroRoster: updatedRoster,
  };

  if (state.playerClass) {
    const gain = isBoss ? 8 : 2;
    const nextXp = (newState.classMasteryXp[state.playerClass] ?? 0) + gain;
    const prevLevel = Math.floor((newState.classMasteryXp[state.playerClass] ?? 0) / 100);
    const nextLevel = Math.floor(nextXp / 100);
    newState = {
      ...newState,
      classMasteryXp: {
        ...newState.classMasteryXp,
        [state.playerClass]: nextXp,
      },
    };
    if (nextLevel > prevLevel) {
      newState = queueReward(newState, {
        id: `mastery_${state.playerClass}_${Date.now()}`,
        kind: 'system',
        title: `${getClassConfig(state.playerClass).name} Mastery Up`,
        detail: `Mastery Lv ${nextLevel}`,
      });
    }
  }
  newState = queueCombatLog(newState, `Defeated ${getMonsterForWave(state.wave).name} • +${goldReward} gold +${expReward} EXP (${weekly.name})`);

  // Grant one free summon charge on first kill.
  if (state.totalKills === 0 && !state.firstSummonGiven) {
    newState = {
      ...newState,
      firstSummonGiven: true,
      freeSummonCharges: newState.freeSummonCharges + 1,
    };
  }

  // Chance to drop class-compatible equipment on kill.
  const mythicUnlocked = hasUnlock(newState, 'mythic_equipment');
  const dropChance = Math.min(0.4, 0.10 + state.wave * 0.003 + (isBoss ? 0.12 : 0));
  if (newState.playerClass && Math.random() <= dropChance) {
    const droppedRarity = rollEquipmentRarityByTier(Math.random(), mythicUnlocked);
    const pool = EQUIPMENT_CATALOG.filter(item =>
      item.allowedClasses.includes(newState.playerClass as PlayerClass) &&
      item.rarity === droppedRarity,
    );
    const fallbackPool = EQUIPMENT_CATALOG.filter(item =>
      item.allowedClasses.includes(newState.playerClass as PlayerClass),
    );
    const source = pool.length > 0 ? pool : fallbackPool;
    if (source.length > 0) {
      const item = source[Math.floor(Math.random() * source.length)];
      if (!newState.inventoryItemIds.includes(item.id)) {
        newState = queueReward({
          ...newState,
          inventoryItemIds: [...newState.inventoryItemIds, item.id],
        }, {
          id: `item_${item.id}_${Date.now()}`,
          kind: 'item',
          title: `Equipment Drop: ${item.emoji} ${item.name}`,
          detail: `${equipmentRarityConfig(item.rarity).label} ${item.slot}`,
        });
        newState = queueCombatLog(newState, `Loot drop: ${item.emoji} ${item.name}`);
        if (item.rarity === 'mythic') {
          newState = queueReward(newState, {
            id: `mythic_flash_${Date.now()}`,
            kind: 'system',
            title: 'MYTHIC DROP!',
            detail: `${item.emoji} ${item.name} • Arc flash triggered`,
          });
        }
      } else {
        const duplicateScrap = equipmentScrapValue(item.rarity) + Math.floor(state.wave * 0.4);
        newState = queueReward({
          ...newState,
          equipmentScrap: newState.equipmentScrap + duplicateScrap,
        }, {
          id: `dup_${item.id}_${Date.now()}`,
          kind: 'item',
          title: `Duplicate ${item.name}`,
          detail: `Converted to +${duplicateScrap} scrap`,
        });
        newState = queueCombatLog(newState, `Duplicate ${item.name} converted into ${duplicateScrap} scrap`);
      }
    }
  }

  // Chance to drop a usable consumable.
  const usableDropChance = Math.min(0.32, 0.12 + state.wave * 0.0015 + (isBoss ? 0.08 : 0));
  if (Math.random() <= usableDropChance) {
    const usable = rollUsableItem(Math.random(), hasUnlock(newState, 'advanced_consumables'));
    const nextCounts = addUsableItemCount(newState.usableItemCounts, usable.id, 1);
    newState = queueReward({
      ...newState,
      usableItemCounts: nextCounts,
    }, {
      id: `usable_${usable.id}_${Date.now()}`,
      kind: 'item',
      title: `Found ${usable.emoji} ${usable.name}`,
      detail: usable.description,
    });
    newState = queueCombatLog(newState, `Item drop: ${usable.emoji} ${usable.name}`);
  }

  if (isBoss) {
    newState = { ...newState, bossTears: newState.bossTears + 1 };
    newState = queueReward(newState, {
      id: `boss_stinger_${Date.now()}`,
      kind: 'system',
      title: 'Boss Defeated',
      detail: `${act.emoji} ${act.name} collapsed • Stinger triggered`,
    });
    const unlock = getBossUnlockForWave(state.wave);
    if (unlock && !newState.permanentUnlocks.includes(unlock)) {
      newState = queueReward({
        ...newState,
        permanentUnlocks: [...newState.permanentUnlocks, unlock],
      }, {
        id: `unlock_${unlock}_${Date.now()}`,
        kind: 'system',
        title: `Act Boss Defeated • ${act.name}`,
        detail: unlockLabel(unlock),
      });
    }

    newState = queueReward(newState, {
      id: `essence_${Date.now()}`,
      kind: 'system',
      title: 'Boss Essence Acquired',
      detail: `+${essenceReward} essence`,
    });
    newState = queueCombatLog(newState, `Boss reward: +${essenceReward} essence`);
    newState = queueCombatLog(newState, `Boss drop: +1 Boss Tear 💧`);
  }

  return withAchievement(progressTutorial(newState));
}

function checkAchievements(state: GameState): string | null {
  const ctx = {
    totalGold: state.totalGold,
    totalKills: state.totalKills,
    wave: state.wave,
    highestWaveReached: state.highestWaveReached,
    level: state.level,
    prestigeCount: state.prestigeCount,
    totalSummons: state.totalSummons,
    equippedCount: state.activeTeamHeroIds.length,
    heroRosterCount: state.heroRoster.length,
    heroShards: state.heroShards,
    essence: state.essence,
    unlockedCount: state.achievements.size,
    dailyLoginStreak: state.dailyLoginStreak,
  };

  for (const ach of ACHIEVEMENTS) {
    if (!state.achievements.has(ach.id) && ach.condition(ctx)) {
      return ach.id;
    }
  }
  return null;
}

function withAchievement(state: GameState): GameState {
  if (state.newAchievement) return state;
  const achId = checkAchievements(state);
  if (!achId) return state;
  const achievements = new Set(state.achievements);
  achievements.add(achId);
  return { ...state, achievements, newAchievement: achId };
}

type Action =
  | { type: 'CREATE_CHARACTER'; name: string; playerClass: PlayerClass }
  | { type: 'QUEST_EVENT'; event: TutorialEvent }
  | { type: 'TICK'; elapsed: number }
  | { type: 'ATTACK' }
  | { type: 'BUY_PARTY'; id: PartyId; amount: number }
  | { type: 'BUY_SKILL'; id: string }
  | { type: 'ALLOCATE_STAT'; stat: StatKey }
  | { type: 'ALLOCATE_STAT_MAX'; stat: StatKey }
  | { type: 'ALLOCATE_STAT_N'; stat: StatKey; amount: number }
  | { type: 'BURST'; hits: number }
  | { type: 'LEVEL_UP_HERO_GOLD'; uid: string }
  | { type: 'EQUIP_ITEM'; itemId: string }
  | { type: 'SUMMON_HERO' }
  | { type: 'SUMMON_HERO_X10' }
  | { type: 'AUTO_EQUIP_BEST_HEROES' }
  | { type: 'SAVE_TEAM_LOADOUT'; slot: number }
  | { type: 'LOAD_TEAM_LOADOUT'; slot: number }
  | { type: 'TOGGLE_EQUIP_HERO'; uid: string }
  | { type: 'SET_ACTIVE_TEAM'; heroIds: string[] }
  | { type: 'SET_HERO_FORMATION'; uid: string; role: HeroFormationRole }
  | { type: 'RECYCLE_HERO'; uid: string }
  | { type: 'AUTO_RECYCLE_HEROES' }
  | { type: 'SET_AUTO_RECYCLE_MAX_RARITY'; rarity: Rarity }
  | { type: 'SET_AUTO_RECYCLE_ENABLED'; enabled: boolean }
  | { type: 'RANK_UP_HERO'; uid: string }
  | { type: 'CONVERT_SHARDS_TO_ESSENCE' }
  | { type: 'CONVERT_SHARDS_TO_SCRAP' }
  | { type: 'SPEND_REBIRTH_CORE'; path: 'damage' | 'economy' | 'survival' }
  | { type: 'SET_AUTO_SUMMON_ENABLED'; enabled: boolean }
  | { type: 'SET_AUTO_SUMMON_MODE'; mode: 'single' | 'x10' }
  | { type: 'SET_COMBAT_TEMPO'; tempo: CombatTempo }
  | { type: 'SET_AUTO_SUMMON_RESERVE_GOLD'; reserveGold: number }
  | { type: 'USE_USABLE_ITEM'; itemId: string }
  | { type: 'DISMANTLE_EQUIPMENT'; itemId: string }
  | { type: 'CRAFT_EQUIPMENT'; slot: EquipmentSlot }
  | { type: 'UPGRADE_EQUIPMENT_RARITY'; itemId: string }
  | { type: 'SET_AUTO_USE_POTION'; enabled: boolean }
  | { type: 'SET_AUTO_USE_POTION_THRESHOLD'; thresholdPct: number }
  | { type: 'SPEND_ESSENCE_UPGRADE'; path: 'damage' | 'economy' | 'survival' }
  | { type: 'APPLY_WEEKLY_ROLLOVER'; nowMs: number }
  | { type: 'CLAIM_WEEKLY_TRACK'; milestone: number }
  | { type: 'CLAIM_MISSION'; missionId: string }
  | { type: 'MARK_HINT_SEEN'; hintId: string }
  | { type: 'APPLY_OFFLINE_PROGRESS'; elapsedMs: number }
  | { type: 'APPLY_DAILY_LOGIN'; nowMs: number }
  | { type: 'REBIRTH' }
  | { type: 'CLEAR_ACHIEVEMENT' }
  | { type: 'CLEAR_REWARD_POPUP' }
  | { type: 'LOAD'; payload: Partial<SaveData> };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case 'CREATE_CHARACTER': {
      const name = action.name.trim().slice(0, 24);
      if (!name) return state;
      const starterItemIds = getStarterEquipmentForClass(action.playerClass);
      const starterEquip: Record<EquipmentSlot, string | null> = {
        weapon: null,
        armor: null,
        accessory: null,
      };
      for (const itemId of starterItemIds) {
        const item = getEquipmentItem(itemId);
        if (item) starterEquip[item.slot] = item.id;
      }

      const newState: GameState = {
        ...state,
        characterCreated: true,
        playerName: name,
        playerClass: action.playerClass,
        unspentStatPoints: 10,   // starting stat points to customise immediately
        gold: 100,               // starting gold to feel snappy
        inventoryItemIds: starterItemIds,
        equippedItems: starterEquip,
      };
      const maxHp = getTeamMaxHp(newState);
      return progressTutorial({ ...newState, teamHp: maxHp, teamMaxHp: maxHp });
    }

    case 'QUEST_EVENT':
      return progressTutorial(state, action.event);

    case 'TICK': {
      if (!state.characterCreated) return state;
      const scaledElapsed = action.elapsed * state.combatTempo;
      let working = decayBuffs(state, scaledElapsed);
      working = tickHeroActives(working, scaledElapsed);
      const weekly = getCurrentWeeklyEvent(working);

      const dps = getDps(working);
      if (dps <= 0) return state;
      const affix = getMonsterAffixModifiers(working.wave);

      // Team deals damage to enemy
      const damage = (dps * (scaledElapsed / 1000)) / (affix.hpMult * weekly.enemyHpMultiplier);
      const hp = working.monsterHp - damage;

      // Enemy deals damage to team (reduced by defense)
      const enemyDmg = getMonsterDamage(working.wave) * affix.dmgMult * weekly.enemyDamageMultiplier;
      const defense = getTeamDefense(working);
      const damageReduction = Math.min(0.8, defense / (defense + 100));  // max 80% reduction
      const passive = working.playerClass ? getClassPassive(working.playerClass) : null;
      const passiveIncomingMult = hasUnlock(working, 'class_passive') && passive
        ? passive.incomingDamageMultiplier
        : 1;
      const heroPassive = getHeroPassiveMultipliers(working);
      const formation = getFormationMultipliers(working);
      const synergy = getTeamSynergy(working);
      const activeReductionMult = 1 - Math.max(0, Math.min(0.7, working.damageReductionBuffPct));
      const actualEnemyDamage = enemyDmg
        * (1 - damageReduction)
        * passiveIncomingMult
        * heroPassive.incomingDmgMult
        * formation.incomingMult
        * synergy.incomingMult
        * activeReductionMult
        * (scaledElapsed / 1000);
      const teamHp = working.teamHp - actualEnemyDamage;

      // Check if monster is defeated
      if (hp <= 0) return withAchievement(killMonster(working));

      // Check if team dies
      if (teamHp <= 0) {
        // Retreat to wave 1, lose 50% of current gold, keep exp and heroes
        return {
          ...working,
          wave: 1,
          monsterHp: getMonsterMaxHp(1),
          monsterMaxHp: getMonsterMaxHp(1),
          teamHp: getTeamMaxHp(working),
          teamMaxHp: getTeamMaxHp(working),
          gold: Math.floor(working.gold * 0.5),
          lastActiveAt: Date.now(),
          combatLog: [`${new Date().toLocaleTimeString()} • Team collapsed and retreated to Wave 1`, ...working.combatLog].slice(0, 24),
        };
      }

      const withPotions = maybeAutoUsePotion({ ...working, monsterHp: hp, teamHp, lastActiveAt: Date.now() });
      const withRecycle = maybeAutoRecycleBackground(withPotions);
      return maybeAutoSummonTick(withRecycle);
    }

    case 'ATTACK': {
      if (!state.characterCreated) return state;
      const affix = getMonsterAffixModifiers(state.wave);
      const crit = Math.random() < 0.2;
      const dmg = (getClickDamage(state) * (crit ? 1.8 : 1)) / affix.hpMult;
      const hp = state.monsterHp - dmg;
      const logged = queueCombatLog(state, `${crit ? 'CRIT' : 'Hit'} for ${Math.ceil(dmg)} dmg`);
      if (hp <= 0) return withAchievement(killMonster(logged));
      return { ...logged, monsterHp: hp };
    }

    case 'BURST': {
      if (state.burstCharge < 25) return state;
      let working: GameState = { ...state, burstCharge: 0 };
      for (let i = 0; i < action.hits; i++) {
        const affix = getMonsterAffixModifiers(working.wave);
        const crit = Math.random() < 0.2;
        const dmg = (getClickDamage(working) * 8 * (crit ? 1.8 : 1)) / affix.hpMult;
        const hp = working.monsterHp - dmg;
        if (hp <= 0) {
          working = withAchievement(killMonster(working));
        } else {
          working = { ...working, monsterHp: hp };
        }
      }
      return queueCombatLog(working, `Burst unleashed for ${action.hits} amplified strikes`);
    }

    case 'BUY_PARTY': {
      const cfg = PARTY.find(p => p.id === action.id);
      if (!cfg) return state;
      const owned = state.party[action.id] ?? 0;
      const cost = action.amount === 1
        ? buildingCost(cfg.baseCost, owned, COST_SCALE)
        : bulkCost(cfg.baseCost, owned, action.amount, COST_SCALE);
      if (state.gold < cost) return state;
      const party = { ...state.party, [action.id]: owned + action.amount };
      return { ...state, gold: state.gold - cost, party };
    }

    case 'BUY_SKILL': {
      const skill = SKILLS.find(s => s.id === action.id);
      if (!skill || state.skills.has(skill.id) || state.gold < skill.cost) return state;
      const skills = new Set(state.skills);
      skills.add(skill.id);
      return { ...state, gold: state.gold - skill.cost, skills };
    }

    case 'ALLOCATE_STAT': {
      if (state.unspentStatPoints <= 0) return state;
      const statsAlloc = {
        ...state.statsAlloc,
        [action.stat]: state.statsAlloc[action.stat] + 1,
      };
      return progressTutorial({
        ...state,
        statsAlloc,
        unspentStatPoints: state.unspentStatPoints - 1,
        allocatedStatPoints: state.allocatedStatPoints + 1,
      });
    }

    case 'ALLOCATE_STAT_MAX': {
      if (state.unspentStatPoints <= 0) return state;
      const spend = state.unspentStatPoints;
      const statsAlloc = {
        ...state.statsAlloc,
        [action.stat]: state.statsAlloc[action.stat] + spend,
      };
      return progressTutorial({
        ...state,
        statsAlloc,
        unspentStatPoints: 0,
        allocatedStatPoints: state.allocatedStatPoints + spend,
      });
    }

    case 'ALLOCATE_STAT_N': {
      if (state.unspentStatPoints <= 0) return state;
      const spend = Math.min(action.amount, state.unspentStatPoints);
      const statsAlloc = {
        ...state.statsAlloc,
        [action.stat]: state.statsAlloc[action.stat] + spend,
      };
      return progressTutorial({
        ...state,
        statsAlloc,
        unspentStatPoints: state.unspentStatPoints - spend,
        allocatedStatPoints: state.allocatedStatPoints + spend,
      });
    }

    case 'EQUIP_ITEM': {
      if (!state.playerClass) return state;
      const item = getEquipmentItem(action.itemId);
      if (!item) return state;
      if (!item.allowedClasses.includes(state.playerClass)) return state;
      if (!state.inventoryItemIds.includes(item.id)) return state;

      return {
        ...state,
        equippedItems: {
          ...state.equippedItems,
          [item.slot]: item.id,
        },
      };
    }

    case 'SUMMON_HERO': {
      const canUseFree = state.freeSummonCharges > 0;
      if (!canUseFree && state.bossTears < 1) return state;

      const template = HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
      const roll = rollRarityWithPity(state.gachaPityCounter);
      const rarity = roll.rarity;
      const rarityMult = rarityConfig(rarity).boostMultiplier;
      const uid = `${template.id}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const hero: HeroUnit = {
        ...template,
        uid,
        rarity,
        level: 1,
        rank: 1,
        teamBoost: Number((template.baseTeamBoost * rarityMult).toFixed(4)),
      };

      const historyEntry: SummonHistoryEntry = {
        id: `hist_${uid}`,
        heroName: hero.name,
        heroEmoji: hero.emoji,
        rarity: hero.rarity,
        ts: Date.now(),
        pityTriggered: roll.pityTriggered,
      };

      let nextState = withAchievement(progressTutorial({
        ...state,
        bossTears: canUseFree ? state.bossTears : state.bossTears - 1,
        heroRoster: [hero, ...state.heroRoster],
        summonHistory: [historyEntry, ...state.summonHistory].slice(0, 60),
        totalSummons: state.totalSummons + 1,
        freeSummonCharges: canUseFree ? state.freeSummonCharges - 1 : state.freeSummonCharges,
        gachaPityCounter: roll.nextCounter,
      }));
      if (roll.pityTriggered) {
        nextState = queueReward(nextState, {
          id: `pity_single_${Date.now()}`,
          kind: 'system',
          title: 'Pity Triggered',
          detail: `${hero.emoji} ${hero.name} arrived at ${rarity.toUpperCase()}!`,
        });
      }
      return nextState;
    }

    case 'SUMMON_HERO_X10': {
      const totalPulls = 10;
      const freeUses = Math.min(state.freeSummonCharges, totalPulls);
      const paidUses = totalPulls - freeUses;
      if (state.bossTears < paidUses) return state;

      const summoned: HeroUnit[] = [];
      const historyBatch: SummonHistoryEntry[] = [];
      let pityCounter = state.gachaPityCounter;
      let pityHits = 0;
      for (let i = 0; i < totalPulls; i++) {
        const template = HERO_POOL[Math.floor(Math.random() * HERO_POOL.length)];
        const roll = rollRarityWithPity(pityCounter);
        pityCounter = roll.nextCounter;
        if (roll.pityTriggered) pityHits++;
        const rarity = roll.rarity;
        const rarityMult = rarityConfig(rarity).boostMultiplier;
        const uid = `${template.id}_${Date.now()}_${i}_${Math.floor(Math.random() * 10000)}`;
        const summonedHero: HeroUnit = {
          ...template,
          uid,
          rarity,
          level: 1,
          rank: 1,
          teamBoost: Number((template.baseTeamBoost * rarityMult).toFixed(4)),
        };
        summoned.push(summonedHero);
        historyBatch.push({
          id: `hist_${uid}`,
          heroName: summonedHero.name,
          heroEmoji: summonedHero.emoji,
          rarity: summonedHero.rarity,
          ts: Date.now(),
          pityTriggered: roll.pityTriggered,
        });
      }

      let nextState = withAchievement(progressTutorial({
        ...state,
        bossTears: state.bossTears - paidUses,
        heroRoster: [...summoned, ...state.heroRoster],
        summonHistory: [...historyBatch, ...state.summonHistory].slice(0, 60),
        totalSummons: state.totalSummons + totalPulls,
        freeSummonCharges: state.freeSummonCharges - freeUses,
        gachaPityCounter: pityCounter,
      }));
      if (pityHits > 0) {
        nextState = queueReward(nextState, {
          id: `pity_x10_${Date.now()}`,
          kind: 'system',
          title: 'Pity Triggered',
          detail: `${pityHits} pity hit${pityHits > 1 ? 's' : ''} in this x10 summon.`,
        });
      }
      return nextState;
    }

    case 'AUTO_EQUIP_BEST_HEROES': {
      const sorted = [...state.heroRoster].sort((a, b) => {
        const rarityDiff = rarityRank(b.rarity) - rarityRank(a.rarity);
        if (rarityDiff !== 0) return rarityDiff;
        if (b.level !== a.level) return b.level - a.level;
        return b.teamBoost - a.teamBoost;
      });
      const newTeam = sorted.slice(0, ACTIVE_TEAM_SIZE).map(h => h.uid);
      const newMaxHp = getTeamMaxHp({ ...state, activeTeamHeroIds: newTeam });
      return progressTutorial({
        ...state,
        activeTeamHeroIds: newTeam,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      });
    }

    case 'SAVE_TEAM_LOADOUT': {
      const slot = Math.max(0, Math.min(2, action.slot));
      const next = [...state.teamLoadouts];
      next[slot] = [...state.activeTeamHeroIds];
      return queueReward({
        ...state,
        teamLoadouts: next,
      }, {
        id: `save_loadout_${slot}_${Date.now()}`,
        kind: 'system',
        title: `Saved Loadout ${slot + 1}`,
        detail: `${next[slot].length} heroes saved`,
      });
    }

    case 'LOAD_TEAM_LOADOUT': {
      const slot = Math.max(0, Math.min(2, action.slot));
      const source = state.teamLoadouts[slot] ?? [];
      const validIds = source
        .filter(uid => state.heroRoster.some(h => h.uid === uid))
        .slice(0, ACTIVE_TEAM_SIZE);
      const newMaxHp = getTeamMaxHp({ ...state, activeTeamHeroIds: validIds });
      return queueReward(progressTutorial({
        ...state,
        activeTeamHeroIds: validIds,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      }), {
        id: `load_loadout_${slot}_${Date.now()}`,
        kind: 'system',
        title: `Loaded Loadout ${slot + 1}`,
        detail: `${validIds.length} heroes equipped`,
      });
    }

    case 'TOGGLE_EQUIP_HERO': {
      const exists = state.heroRoster.some(h => h.uid === action.uid);
      if (!exists) return state;
      const active = state.activeTeamHeroIds;
      let newTeam: string[];
      if (active.includes(action.uid)) {
        newTeam = active.filter(id => id !== action.uid);
      } else {
        if (active.length >= ACTIVE_TEAM_SIZE) return state;
        newTeam = [...active, action.uid];
      }
      const newMaxHp = getTeamMaxHp({ ...state, activeTeamHeroIds: newTeam });
      return withAchievement(progressTutorial({
        ...state,
        activeTeamHeroIds: newTeam,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      }));
    }

    case 'SET_ACTIVE_TEAM': {
      // Validate that all hero IDs exist and limit to ACTIVE_TEAM_SIZE
      const validIds = action.heroIds
        .filter(uid => state.heroRoster.some(h => h.uid === uid))
        .slice(0, ACTIVE_TEAM_SIZE);
      const newMaxHp = getTeamMaxHp({ ...state, activeTeamHeroIds: validIds });
      return progressTutorial({
        ...state,
        activeTeamHeroIds: validIds,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),  // Cap current HP at new max
      });
    }

    case 'USE_USABLE_ITEM': {
      const qty = state.usableItemCounts[action.itemId] ?? 0;
      if (qty <= 0) return state;

      const item = getUsableItem(action.itemId);
      if (!item) return state;

      let nextState: GameState = {
        ...state,
        usableItemCounts: addUsableItemCount(state.usableItemCounts, action.itemId, -1),
      };

      if (item.effect === 'heal_team_percent') {
        const healed = Math.ceil(nextState.teamMaxHp * item.value);
        nextState = queueReward({
          ...nextState,
          teamHp: Math.min(nextState.teamMaxHp, nextState.teamHp + healed),
        }, {
          id: `use_${item.id}_${Date.now()}`,
          kind: 'item',
          title: `Used ${item.emoji} ${item.name}`,
          detail: `Restored ${healed} team HP`,
        });
      }

      if (item.effect === 'gain_gold_flat') {
        const gain = Math.ceil(item.value * Math.pow(REBIRTH_BONUS, nextState.prestigeCount));
        nextState = queueReward({
          ...nextState,
          gold: nextState.gold + gain,
          totalGold: nextState.totalGold + gain,
        }, {
          id: `use_${item.id}_${Date.now()}`,
          kind: 'gold',
          title: `Used ${item.emoji} ${item.name}`,
          detail: `+${gain} gold`,
        });
      }

      if (item.effect === 'gain_exp_flat') {
        const gain = Math.ceil(item.value * getAchievementBonusMultiplier(nextState));
        const lvl = processLevelUp(nextState.exp + gain, nextState.level);
        nextState = queueReward({
          ...nextState,
          exp: lvl.exp,
          totalExp: nextState.totalExp + gain,
          level: lvl.level,
          unspentStatPoints: nextState.unspentStatPoints + lvl.gainedLevels * STAT_POINTS_PER_LEVEL,
        }, {
          id: `use_${item.id}_${Date.now()}`,
          kind: 'item',
          title: `Used ${item.emoji} ${item.name}`,
          detail: `+${gain} EXP`,
        });
      }

      if (item.effect === 'gain_shards_flat') {
        const weekly = getCurrentWeeklyEvent(nextState);
        const gain = Math.ceil(item.value * (1 + nextState.prestigeCount * 0.04) * weekly.shardMultiplier);
        nextState = queueReward({
          ...nextState,
          heroShards: nextState.heroShards + gain,
        }, {
          id: `use_${item.id}_${Date.now()}`,
          kind: 'shard',
          title: `Used ${item.emoji} ${item.name}`,
          detail: `+${gain} shards`,
        });
      }

      return withAchievement(progressTutorial(nextState));
    }

    case 'DISMANTLE_EQUIPMENT': {
      if (!state.inventoryItemIds.includes(action.itemId)) return state;
      if (Object.values(state.equippedItems).includes(action.itemId)) return state;
      const item = getEquipmentItem(action.itemId);
      if (!item) return state;
      const gain = equipmentScrapValue(item.rarity);
      return queueReward({
        ...state,
        inventoryItemIds: state.inventoryItemIds.filter(id => id !== action.itemId),
        equipmentScrap: state.equipmentScrap + gain,
      }, {
        id: `dismantle_${action.itemId}_${Date.now()}`,
        kind: 'item',
        title: `Dismantled ${item.emoji} ${item.name}`,
        detail: `+${gain} scrap`,
      });
    }

    case 'CRAFT_EQUIPMENT': {
      if (!state.playerClass) return state;
      const cost = getEquipmentCraftCost(action.slot);
      if (state.equipmentScrap < cost.scrap || state.gold < cost.gold) return state;

      const classSlotItems = EQUIPMENT_CATALOG.filter(item =>
        item.allowedClasses.includes(state.playerClass as PlayerClass) && item.slot === action.slot,
      );
      if (classSlotItems.length === 0) return state;

      const rolledRarity = rollEquipmentRarityByTier(Math.random(), hasUnlock(state, 'mythic_equipment'));
      const rarityPool = classSlotItems.filter(i => i.rarity === rolledRarity);
      const source = rarityPool.length > 0 ? rarityPool : classSlotItems;
      const item = source[Math.floor(Math.random() * source.length)];
      const alreadyOwned = state.inventoryItemIds.includes(item.id);

      if (alreadyOwned) {
        const refund = Math.ceil(equipmentScrapValue(item.rarity) * 0.75);
        return queueReward({
          ...state,
          equipmentScrap: state.equipmentScrap - cost.scrap + refund,
          gold: state.gold - cost.gold,
        }, {
          id: `craft_dup_${item.id}_${Date.now()}`,
          kind: 'item',
          title: `Crafted Duplicate ${item.name}`,
          detail: `Spent ${cost.gold} gold, recovered +${refund} scrap`,
        });
      }

      return queueReward({
        ...state,
        equipmentScrap: state.equipmentScrap - cost.scrap,
        gold: state.gold - cost.gold,
        inventoryItemIds: [...state.inventoryItemIds, item.id],
      }, {
        id: `craft_${item.id}_${Date.now()}`,
        kind: 'item',
        title: `Crafted ${item.emoji} ${item.name}`,
        detail: `${equipmentRarityConfig(item.rarity).label} ${item.slot} • -${cost.gold} gold`,
      });
    }

    case 'UPGRADE_EQUIPMENT_RARITY': {
      if (!state.inventoryItemIds.includes(action.itemId)) return state;
      const item = getEquipmentItem(action.itemId);
      if (!item) return state;
      const plan = getEquipmentUpgradePlan(state, action.itemId);
      if (!plan.targetItemId || !plan.targetRarity) return state;
      if (state.equipmentScrap < plan.scrapCost || state.essence < plan.essenceCost || state.gold < plan.goldCost) return state;
      const target = getEquipmentItem(plan.targetItemId);
      if (!target) return state;

      const alreadyOwned = state.inventoryItemIds.includes(target.id);
      const withReplacedInventory = state.inventoryItemIds.filter(id => id !== item.id);
      const nextInventory = alreadyOwned ? withReplacedInventory : [...withReplacedInventory, target.id];
      const refund = alreadyOwned ? Math.floor(equipmentScrapValue(target.rarity) * 0.8) : 0;

      return queueReward({
        ...state,
        inventoryItemIds: nextInventory,
        equipmentScrap: state.equipmentScrap - plan.scrapCost + refund,
        essence: state.essence - plan.essenceCost,
        gold: state.gold - plan.goldCost,
        equippedItems: Object.fromEntries(
          Object.entries(state.equippedItems).map(([slot, equippedId]) => [slot, equippedId === item.id ? target.id : equippedId]),
        ) as Record<EquipmentSlot, string | null>,
      }, {
        id: `upgrade_${item.id}_${Date.now()}`,
        kind: 'item',
        title: `Upgraded ${item.name}`,
        detail: `Now ${target.emoji} ${target.name} (${plan.targetRarity.toUpperCase()}) • -${plan.goldCost} gold`,
      });
    }

    case 'SET_AUTO_USE_POTION': {
      return {
        ...state,
        autoUsePotionEnabled: action.enabled,
      };
    }

    case 'SET_AUTO_USE_POTION_THRESHOLD': {
      const clamped = Math.max(0.1, Math.min(0.9, action.thresholdPct));
      return {
        ...state,
        autoUsePotionThresholdPct: clamped,
      };
    }

    case 'SPEND_ESSENCE_UPGRADE': {
      const currentLevel = action.path === 'damage'
        ? state.metaDamageLevel
        : action.path === 'economy'
          ? state.metaEconomyLevel
          : state.metaSurvivalLevel;
      const cost = getEssenceUpgradeCost(currentLevel);
      if (state.essence < cost) return state;

      const base = {
        ...state,
        essence: state.essence - cost,
      };

      if (action.path === 'damage') {
        return queueReward({ ...base, metaDamageLevel: state.metaDamageLevel + 1 }, {
          id: `meta_damage_${Date.now()}`,
          kind: 'system',
          title: 'Meta Upgrade: Damage Path',
          detail: `Level ${state.metaDamageLevel + 1}`,
        });
      }

      if (action.path === 'economy') {
        return queueReward({ ...base, metaEconomyLevel: state.metaEconomyLevel + 1 }, {
          id: `meta_econ_${Date.now()}`,
          kind: 'system',
          title: 'Meta Upgrade: Economy Path',
          detail: `Level ${state.metaEconomyLevel + 1}`,
        });
      }

      return queueReward({ ...base, metaSurvivalLevel: state.metaSurvivalLevel + 1 }, {
        id: `meta_survival_${Date.now()}`,
        kind: 'system',
        title: 'Meta Upgrade: Survival Path',
        detail: `Level ${state.metaSurvivalLevel + 1}`,
      });
    }

    case 'APPLY_WEEKLY_ROLLOVER': {
      if (!state.characterCreated) return state;
      const week = weekNumberForTimestamp(action.nowMs);
      if (week === state.weeklyEventWeek) return state;
      const event = getWeeklyEventByWeek(week);
      return queueReward({
        ...state,
        weeklyEventWeek: week,
        weeklyEventId: event.id,
        weeklyKills: 0,
        weeklyTrackClaimed: [],
      }, {
        id: `weekly_rollover_${week}`,
        kind: 'system',
        title: `Weekly Event: ${event.name}`,
        detail: event.description,
      });
    }

    case 'CLAIM_WEEKLY_TRACK': {
      if (state.weeklyTrackClaimed.includes(action.milestone)) return state;
      if (!WEEKLY_TRACK_MILESTONES.includes(action.milestone)) return state;
      if (state.weeklyKills < action.milestone) return state;

      const gold = 220 + action.milestone * 12;
      const shards = 18 + Math.floor(action.milestone * 1.8);
      const essence = action.milestone >= 150 ? 4 : action.milestone >= 75 ? 2 : 1;

      return queueReward({
        ...state,
        weeklyTrackClaimed: [...state.weeklyTrackClaimed, action.milestone],
        gold: state.gold + gold,
        totalGold: state.totalGold + gold,
        heroShards: state.heroShards + shards,
        essence: state.essence + essence,
      }, {
        id: `weekly_track_${action.milestone}_${Date.now()}`,
        kind: 'system',
        title: 'Weekly Track Claimed',
        detail: `+${gold} gold, +${shards} shards, +${essence} essence`,
      });
    }

    case 'CLAIM_MISSION': {
      if (state.claimedMissionIds.includes(action.missionId)) return state;
      const mission = MISSION_BOARD_GOALS.find(m => m.id === action.missionId);
      if (!mission) return state;
      const progress = getMissionProgressValue(state, mission);
      if (progress < mission.target) return state;

      const rewardGold = mission.rewardGold ?? 0;
      const rewardShards = mission.rewardShards ?? 0;
      const rewardEssence = mission.rewardEssence ?? 0;
      return queueReward({
        ...state,
        claimedMissionIds: [...state.claimedMissionIds, mission.id],
        gold: state.gold + rewardGold,
        totalGold: state.totalGold + rewardGold,
        heroShards: state.heroShards + rewardShards,
        essence: state.essence + rewardEssence,
      }, {
        id: `mission_${mission.id}_${Date.now()}`,
        kind: 'system',
        title: `Mission Complete: ${mission.title}`,
        detail: `+${rewardGold} gold, +${rewardShards} shards, +${rewardEssence} essence`,
      });
    }

    case 'MARK_HINT_SEEN': {
      if (state.seenHintIds.includes(action.hintId)) return state;
      return {
        ...state,
        seenHintIds: [...state.seenHintIds, action.hintId],
      };
    }

    case 'APPLY_OFFLINE_PROGRESS': {
      if (!state.characterCreated) return state;
      const elapsed = Math.max(0, Math.min(action.elapsedMs, OFFLINE_PROGRESS_CAP_MS));
      if (elapsed < 5000) return { ...state, lastActiveAt: Date.now() };

      const MAX_OFFLINE_KILLS = 4000;
      const MIN_KILL_MS = 35;
      let remainingMs = elapsed;
      let working = state;
      const startWave = state.wave;
      const startKills = state.totalKills;
      const startGold = state.gold;
      const startExp = state.totalExp;
      const baseRewardQueue = state.rewardQueue;
      const baseCombatLog = state.combatLog;

      while (remainingMs > 0 && working.characterCreated && (working.totalKills - startKills) < MAX_OFFLINE_KILLS) {
        const weekly = getCurrentWeeklyEvent(working);
        const affix = getMonsterAffixModifiers(working.wave);
        const dps = Math.max(1, getDps(working));
        const killMs = Math.max(
          MIN_KILL_MS,
          Math.ceil((working.monsterHp * affix.hpMult * weekly.enemyHpMultiplier / dps) * 1000),
        );

        if (killMs > remainingMs) {
          const dealt = (dps * (remainingMs / 1000)) / (affix.hpMult * weekly.enemyHpMultiplier);
          working = {
            ...working,
            monsterHp: Math.max(1, working.monsterHp - dealt),
          };
          remainingMs = 0;
          break;
        }

        working = killMonster(working);
        remainingMs -= killMs;
      }

      const killsGained = working.totalKills - startKills;
      const wavesGained = Math.max(0, working.wave - startWave);
      const goldGain = Math.max(0, working.gold - startGold);
      const expGain = Math.max(0, working.totalExp - startExp);
      working = {
        ...working,
        rewardQueue: baseRewardQueue,
        combatLog: baseCombatLog,
      };

      const next = queueReward({
        ...working,
        lastActiveAt: Date.now(),
      }, {
        id: `offline_${Date.now()}`,
        kind: 'system',
        title: 'Offline Progress',
        detail: `+${killsGained} kills • +${wavesGained} waves • +${goldGain} gold • +${expGain} EXP`,
      });
      return withAchievement(progressTutorial(next));
    }

    case 'APPLY_DAILY_LOGIN': {
      if (!state.characterCreated) return state;
      const today = toDayNumber(action.nowMs);
      if (state.lastDailyLoginDay === today) return state;

      const daysSinceLast = state.lastDailyLoginDay === null ? null : today - state.lastDailyLoginDay;
      const usedInsurance = daysSinceLast === 2 && state.streakInsuranceCharges > 0;
      const continued = (daysSinceLast === 1) || usedInsurance;
      const streak = continued ? state.dailyLoginStreak + 1 : 1;
      const goldReward = 250 + Math.min(9, streak - 1) * 80;
      const shardReward = 20 + Math.min(9, streak - 1) * 6;
      const freeSummonBonus = streak % 3 === 0 ? 1 : 0;
      const insuranceEarned = streak % 7 === 0 ? 1 : 0;
      const nextInsurance = Math.min(3, state.streakInsuranceCharges - (usedInsurance ? 1 : 0) + insuranceEarned);

      const next = queueReward({
        ...state,
        gold: state.gold + goldReward,
        totalGold: state.totalGold + goldReward,
        heroShards: state.heroShards + shardReward,
        freeSummonCharges: state.freeSummonCharges + freeSummonBonus,
        dailyLoginStreak: streak,
        lastDailyLoginDay: today,
        streakInsuranceCharges: nextInsurance,
      }, {
        id: `daily_login_${today}`,
        kind: 'system',
        title: `Daily Login • Day ${streak}`,
        detail: `+${goldReward} gold, +${shardReward} shards${freeSummonBonus > 0 ? ', +1 free summon' : ''}${usedInsurance ? ', streak insurance consumed' : ''}${insuranceEarned > 0 ? ', +1 streak insurance' : ''}`,
      });

      return withAchievement(progressTutorial(next));
    }

    case 'REBIRTH': {
      if (state.wave < REBIRTH_WAVE_THRESHOLD) return state;
      const gainedCores = Math.max(1, Math.floor((state.wave - REBIRTH_WAVE_THRESHOLD) / 25) + 1);
      return queueReward({
        ...state,
        gold: 0,
        exp: 0,
        level: 1,
        unspentStatPoints: state.unspentStatPoints,
        wave: 1,
        monsterHp: getMonsterMaxHp(1),
        monsterMaxHp: getMonsterMaxHp(1),
        teamHp: 100,
        teamMaxHp: 100,
        party: initialParty(),
        skills: new Set(),
        activeTeamHeroIds: [],
        prestigeCount: state.prestigeCount + 1,
        newAchievement: null,
        damageBuffPct: 0,
        damageBuffMs: 0,
        damageReductionBuffPct: 0,
        damageReductionBuffMs: 0,
        heroActiveCdMs: {},
        lastActiveAt: Date.now(),
        seasonPoints: state.seasonPoints + 250,
        bestSeasonPoints: Math.max(state.bestSeasonPoints, state.seasonPoints + 250),
        rebirthCores: state.rebirthCores + gainedCores,
      }, {
        id: `rebirth_cores_${Date.now()}`,
        kind: 'system',
        title: 'Rebirth Complete',
        detail: `+${gainedCores} rebirth cores • shockwave triggered`,
      });
    }

    case 'CLEAR_ACHIEVEMENT':
      return { ...state, newAchievement: null };

    case 'CLEAR_REWARD_POPUP':
      return {
        ...state,
        rewardQueue: state.rewardQueue.slice(1),
      };

    case 'RECYCLE_HERO': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero) return state;
      
      // Calculate shard reward and remove hero from roster
      const weekly = getCurrentWeeklyEvent(state);
      const shardReward = Math.ceil(calculateShardReward(hero.rarity, hero.level) * weekly.shardMultiplier);
      const newRoster = state.heroRoster.filter(h => h.uid !== action.uid);
      const newActiveTeam = state.activeTeamHeroIds.filter(id => id !== action.uid);
      const newMaxHp = getTeamMaxHp({ ...state, heroRoster: newRoster, activeTeamHeroIds: newActiveTeam });
      
      return {
        ...state,
        heroRoster: newRoster,
        activeTeamHeroIds: newActiveTeam,
        heroShards: state.heroShards + shardReward,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      };
    }

    case 'AUTO_RECYCLE_HEROES': {
      const activeTeam = new Set(state.activeTeamHeroIds);
      const maxRank = rarityRank(state.autoRecycleMaxRarity);
      const toRecycle = state.heroRoster.filter(
        h => !activeTeam.has(h.uid) && rarityRank(h.rarity) <= maxRank,
      );
      if (toRecycle.length === 0) return state;

      const recycledIds = new Set(toRecycle.map(h => h.uid));
      const weekly = getCurrentWeeklyEvent(state);
      const shardReward = Math.ceil(toRecycle.reduce((sum, hero) => sum + calculateShardReward(hero.rarity, hero.level), 0) * weekly.shardMultiplier);
      const newRoster = state.heroRoster.filter(h => !recycledIds.has(h.uid));
      const newMaxHp = getTeamMaxHp({ ...state, heroRoster: newRoster });

      const nextState: GameState = {
        ...state,
        heroRoster: newRoster,
        heroShards: state.heroShards + shardReward,
        teamMaxHp: newMaxHp,
        teamHp: Math.min(state.teamHp, newMaxHp),
      };

      return queueReward(nextState, {
        id: `auto_recycle_${Date.now()}`,
        kind: 'shard',
        title: 'Auto Recycle Complete',
        detail: `+${shardReward} shards from ${toRecycle.length} heroes (${state.autoRecycleMaxRarity} and below)`,
      });
    }

    case 'SET_AUTO_RECYCLE_MAX_RARITY': {
      return {
        ...state,
        autoRecycleMaxRarity: action.rarity,
      };
    }

    case 'SET_HERO_FORMATION': {
      if (!state.heroRoster.some(h => h.uid === action.uid)) return state;
      return {
        ...state,
        heroFormationByUid: {
          ...state.heroFormationByUid,
          [action.uid]: action.role,
        },
      };
    }

    case 'SET_AUTO_RECYCLE_ENABLED': {
      return {
        ...state,
        autoRecycleEnabled: action.enabled,
      };
    }

    case 'RANK_UP_HERO': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero || hero.rank >= 10) return state;
      
      const nextRankCost = getRankUpShardCost(hero.rarity, hero.rank + 1);
      if (!Number.isFinite(nextRankCost) || state.heroShards < nextRankCost) return state;
      
      // Rank up the hero
      const updatedHero = { ...hero, rank: hero.rank + 1 };
      const newRoster = state.heroRoster.map(h => h.uid === action.uid ? updatedHero : h);
      
      return {
        ...state,
        heroRoster: newRoster,
        heroShards: state.heroShards - nextRankCost,
      };
    }

    case 'LEVEL_UP_HERO_GOLD': {
      const hero = state.heroRoster.find(h => h.uid === action.uid);
      if (!hero || hero.level >= HERO_LEVEL_CAP) return state;
      const cost = getHeroGoldLevelCost(hero.level);
      if (state.gold < cost) return state;
      const newRoster = state.heroRoster.map(h =>
        h.uid === action.uid ? { ...h, level: h.level + 1 } : h
      );
      return {
        ...state,
        gold: state.gold - cost,
        heroRoster: newRoster,
      };
    }

    case 'CONVERT_SHARDS_TO_ESSENCE': {
      const cost = getShardToEssenceCost(state);
      if (state.heroShards < cost) return state;
      return queueReward({
        ...state,
        heroShards: state.heroShards - cost,
        essence: state.essence + 1,
      }, {
        id: `shard_to_essence_${Date.now()}`,
        kind: 'system',
        title: 'Shard Forge',
        detail: `Converted ${cost} shards into +1 essence`,
      });
    }

    case 'CONVERT_SHARDS_TO_SCRAP': {
      const cost = getShardToScrapCost();
      if (state.heroShards < cost) return state;
      return queueReward({
        ...state,
        heroShards: state.heroShards - cost,
        equipmentScrap: state.equipmentScrap + 140,
      }, {
        id: `shard_to_scrap_${Date.now()}`,
        kind: 'system',
        title: 'Shard Forge',
        detail: `Converted ${cost} shards into +140 scrap`,
      });
    }

    case 'SPEND_REBIRTH_CORE': {
      const currentLevel = action.path === 'damage'
        ? state.rebirthDamagePath
        : action.path === 'economy'
          ? state.rebirthEconomyPath
          : state.rebirthSurvivalPath;
      const cost = getRebirthPathCost(currentLevel);
      if (state.rebirthCores < cost) return state;

      const base = {
        ...state,
        rebirthCores: state.rebirthCores - cost,
      };

      if (action.path === 'damage') {
        return queueReward({ ...base, rebirthDamagePath: state.rebirthDamagePath + 1 }, {
          id: `rebirth_path_dmg_${Date.now()}`,
          kind: 'system',
          title: 'Rebirth Tree: Damage Path',
          detail: `Level ${state.rebirthDamagePath + 1}`,
        });
      }
      if (action.path === 'economy') {
        return queueReward({ ...base, rebirthEconomyPath: state.rebirthEconomyPath + 1 }, {
          id: `rebirth_path_econ_${Date.now()}`,
          kind: 'system',
          title: 'Rebirth Tree: Economy Path',
          detail: `Level ${state.rebirthEconomyPath + 1}`,
        });
      }
      return queueReward({ ...base, rebirthSurvivalPath: state.rebirthSurvivalPath + 1 }, {
        id: `rebirth_path_surv_${Date.now()}`,
        kind: 'system',
        title: 'Rebirth Tree: Survival Path',
        detail: `Level ${state.rebirthSurvivalPath + 1}`,
      });
    }

    case 'SET_AUTO_SUMMON_ENABLED': {
      return {
        ...state,
        autoSummonEnabled: action.enabled,
      };
    }

    case 'SET_AUTO_SUMMON_MODE': {
      return {
        ...state,
        autoSummonMode: action.mode,
      };
    }

    case 'SET_COMBAT_TEMPO': {
      return {
        ...state,
        combatTempo: action.tempo,
      };
    }

    case 'SET_AUTO_SUMMON_RESERVE_GOLD': {
      return {
        ...state,
        autoSummonReserveGold: Math.max(0, action.reserveGold),
      };
    }

    case 'LOAD': {
      const p = sanitizeSaveData(action.payload);
      return {
        ...DEFAULT_STATE,
        playerName: p.playerName,
        playerClass: p.playerClass,
        characterCreated: p.characterCreated,

        gold: p.gold,
        totalGold: p.totalGold,
        exp: p.exp,
        totalExp: p.totalExp,
        level: p.level,
        highestWaveReached: p.highestWaveReached,
        unspentStatPoints: p.unspentStatPoints,
        statsAlloc: p.statsAlloc,

        totalKills: p.totalKills,
        wave: p.wave,
        monsterHp: p.monsterHp,
        monsterMaxHp: p.monsterMaxHp,
        teamHp: p.teamHp,
        teamMaxHp: p.teamMaxHp,

        party: p.party,
        skills: new Set(p.skills),

        heroRoster: p.heroRoster,
        activeTeamHeroIds: p.activeTeamHeroIds,
        totalSummons: p.totalSummons,
        firstSummonGiven: p.firstSummonGiven,
        freeSummonCharges: p.freeSummonCharges,
        heroShards: p.heroShards,
        essence: p.essence,
        rebirthCores: p.rebirthCores,
        rebirthDamagePath: p.rebirthDamagePath,
        rebirthEconomyPath: p.rebirthEconomyPath,
        rebirthSurvivalPath: p.rebirthSurvivalPath,
        autoRecycleMaxRarity: p.autoRecycleMaxRarity,
        equipmentScrap: p.equipmentScrap,
        gachaPityCounter: p.gachaPityCounter,
        summonHistory: p.summonHistory,
        teamLoadouts: p.teamLoadouts,
        heroFormationByUid: p.heroFormationByUid,
        classMasteryXp: p.classMasteryXp,
        seasonPoints: p.seasonPoints,
        bestSeasonPoints: p.bestSeasonPoints,
        dailyLoginStreak: p.dailyLoginStreak,
        lastDailyLoginDay: p.lastDailyLoginDay,
        streakInsuranceCharges: p.streakInsuranceCharges,
        weeklyEventWeek: p.weeklyEventWeek,
        weeklyEventId: p.weeklyEventId,
        weeklyKills: p.weeklyKills,
        weeklyTrackClaimed: p.weeklyTrackClaimed,
        claimedMissionIds: p.claimedMissionIds,
        seenHintIds: p.seenHintIds,
        permanentUnlocks: p.permanentUnlocks,
        metaDamageLevel: p.metaDamageLevel,
        metaEconomyLevel: p.metaEconomyLevel,
        metaSurvivalLevel: p.metaSurvivalLevel,

        inventoryItemIds: p.inventoryItemIds,
        equippedItems: p.equippedItems,
        usableItemCounts: p.usableItemCounts,
        autoUsePotionEnabled: p.autoUsePotionEnabled,
        autoUsePotionThresholdPct: p.autoUsePotionThresholdPct,
        autoRecycleEnabled: p.autoRecycleEnabled,
        autoSummonEnabled: p.autoSummonEnabled,
        autoSummonMode: p.autoSummonMode,
        autoSummonReserveGold: p.autoSummonReserveGold,
        autoSummonCooldownMs: 0,
        lastActiveAt: p.lastActiveAt,

        tutorialEnabled: p.tutorialEnabled,
        tutorialCurrentQuestIndex: p.tutorialCurrentQuestIndex,
        tutorialCompletedQuestIds: p.tutorialCompletedQuestIds,
        allocatedStatPoints: p.allocatedStatPoints,

        prestigeCount: p.prestigeCount,
        achievements: new Set(p.achievements),
        newAchievement: null,
        rewardQueue: [],
        combatLog: p.combatLog,
        damageBuffPct: p.damageBuffPct,
        damageBuffMs: p.damageBuffMs,
        damageReductionBuffPct: p.damageReductionBuffPct,
        damageReductionBuffMs: p.damageReductionBuffMs,
        heroActiveCdMs: p.heroActiveCdMs,
      };
    }

    default:
      return state;
  }
}

interface SaveData {
  playerName: string;
  playerClass: PlayerClass | null;
  characterCreated: boolean;

  gold: number;
  totalGold: number;
  exp: number;
  totalExp: number;
  level: number;
  highestWaveReached: number;
  highestLevelReached?: number;
  unspentStatPoints: number;
  statsAlloc: StatBlock;

  totalKills: number;
  wave: number;
  monsterHp: number;
  teamHp: number;

  party: Record<string, number>;
  skills: string[];

  heroRoster: HeroUnit[];
  activeTeamHeroIds: string[];
  totalSummons: number;
  firstSummonGiven: boolean;
  freeSummonCharges: number;
  heroShards: number;
  bossTears: number;
  essence: number;
  rebirthCores: number;
  rebirthDamagePath: number;
  rebirthEconomyPath: number;
  rebirthSurvivalPath: number;
  autoRecycleMaxRarity: Rarity;
  equipmentScrap: number;
  gachaPityCounter: number;
  summonHistory: SummonHistoryEntry[];
  teamLoadouts: string[][];
  heroFormationByUid: Record<string, HeroFormationRole>;
  classMasteryXp: Record<PlayerClass, number>;
  seasonPoints: number;
  bestSeasonPoints: number;
  dailyLoginStreak: number;
  lastDailyLoginDay: number | null;
  streakInsuranceCharges: number;
  weeklyEventWeek: number;
  weeklyEventId: string;
  weeklyKills: number;
  weeklyTrackClaimed: number[];
  claimedMissionIds: string[];
  seenHintIds: string[];
  permanentUnlocks: PermanentUnlockId[];
  metaDamageLevel: number;
  metaEconomyLevel: number;
  metaSurvivalLevel: number;

  inventoryItemIds: string[];
  equippedItems: Record<EquipmentSlot, string | null>;
  usableItemCounts: Record<string, number>;
  autoUsePotionEnabled: boolean;
  autoUsePotionThresholdPct: number;
  autoRecycleEnabled: boolean;
  autoSummonEnabled: boolean;
  autoSummonMode: 'single' | 'x10';
  combatTempo?: CombatTempo;
  autoSummonReserveGold: number;
  lastActiveAt: number;

  tutorialEnabled: boolean;
  tutorialCurrentQuestIndex: number;
  tutorialCompletedQuestIds: string[];
  allocatedStatPoints: number;

  prestigeCount: number;
  achievements: string[];
  combatLog: string[];
  damageBuffPct: number;
  damageBuffMs: number;
  damageReductionBuffPct: number;
  damageReductionBuffMs: number;
  heroActiveCdMs: Record<string, number>;
}

function serialize(state: GameState): SaveData {
  return {
    playerName: state.playerName,
    playerClass: state.playerClass,
    characterCreated: state.characterCreated,

    gold: state.gold,
    totalGold: state.totalGold,
    exp: state.exp,
    totalExp: state.totalExp,
    level: state.level,
    highestWaveReached: state.highestWaveReached,
    unspentStatPoints: state.unspentStatPoints,
    statsAlloc: state.statsAlloc,

    totalKills: state.totalKills,
    wave: state.wave,
    monsterHp: state.monsterHp,
    teamHp: state.teamHp,

    party: state.party,
    skills: Array.from(state.skills),

    heroRoster: state.heroRoster,
    activeTeamHeroIds: state.activeTeamHeroIds,
    totalSummons: state.totalSummons,
    firstSummonGiven: state.firstSummonGiven,
    freeSummonCharges: state.freeSummonCharges,
    bossTears: state.bossTears,
    heroShards: state.heroShards,
    essence: state.essence,
    rebirthCores: state.rebirthCores,
    rebirthDamagePath: state.rebirthDamagePath,
    rebirthEconomyPath: state.rebirthEconomyPath,
    rebirthSurvivalPath: state.rebirthSurvivalPath,
    autoRecycleMaxRarity: state.autoRecycleMaxRarity,
    equipmentScrap: state.equipmentScrap,
    gachaPityCounter: state.gachaPityCounter,
    summonHistory: state.summonHistory,
    teamLoadouts: state.teamLoadouts,
    heroFormationByUid: state.heroFormationByUid,
    classMasteryXp: state.classMasteryXp,
    seasonPoints: state.seasonPoints,
    bestSeasonPoints: state.bestSeasonPoints,
    dailyLoginStreak: state.dailyLoginStreak,
    lastDailyLoginDay: state.lastDailyLoginDay,
    streakInsuranceCharges: state.streakInsuranceCharges,
    weeklyEventWeek: state.weeklyEventWeek,
    weeklyEventId: state.weeklyEventId,
    weeklyKills: state.weeklyKills,
    weeklyTrackClaimed: state.weeklyTrackClaimed,
    claimedMissionIds: state.claimedMissionIds,
    seenHintIds: state.seenHintIds,
    permanentUnlocks: state.permanentUnlocks,
    metaDamageLevel: state.metaDamageLevel,
    metaEconomyLevel: state.metaEconomyLevel,
    metaSurvivalLevel: state.metaSurvivalLevel,

    inventoryItemIds: state.inventoryItemIds,
    equippedItems: state.equippedItems,
    usableItemCounts: state.usableItemCounts,
    autoUsePotionEnabled: state.autoUsePotionEnabled,
    autoUsePotionThresholdPct: state.autoUsePotionThresholdPct,
    autoRecycleEnabled: state.autoRecycleEnabled,
    autoSummonEnabled: state.autoSummonEnabled,
    autoSummonMode: state.autoSummonMode,
    combatTempo: state.combatTempo,
    autoSummonReserveGold: state.autoSummonReserveGold,
    lastActiveAt: Date.now(),

    tutorialEnabled: state.tutorialEnabled,
    tutorialCurrentQuestIndex: state.tutorialCurrentQuestIndex,
    tutorialCompletedQuestIds: state.tutorialCompletedQuestIds,
    allocatedStatPoints: state.allocatedStatPoints,

    prestigeCount: state.prestigeCount,
    achievements: Array.from(state.achievements),
    combatLog: state.combatLog,
    damageBuffPct: state.damageBuffPct,
    damageBuffMs: state.damageBuffMs,
    damageReductionBuffPct: state.damageReductionBuffPct,
    damageReductionBuffMs: state.damageReductionBuffMs,
    heroActiveCdMs: state.heroActiveCdMs,
  };
}

export function useGameState(saveSlot: string = 'default') {
  const saveKey = getSaveStorageKey(saveSlot);
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const lastTickRef = useRef(Date.now());
  const lastSaveRef = useRef(Date.now());
  const stateRef = useRef(state);
  const sessionStartedRef = useRef(false);
  const sessionStartedAtRef = useRef(0);
  const prevSummonsRef = useRef(0);
  const prevHighestWaveRef = useRef(1);
  const prevPrestigeRef = useRef(0);
  const prevFtueCountRef = useRef(0);
  stateRef.current = state;

  useEffect(() => {
    setHydrated(false);
    dispatch({ type: 'LOAD', payload: {} });
    sessionStartedRef.current = false;
    sessionStartedAtRef.current = 0;
    prevSummonsRef.current = 0;
    prevHighestWaveRef.current = 1;
    prevPrestigeRef.current = 0;
    prevFtueCountRef.current = 0;
    lastTickRef.current = Date.now();
    lastSaveRef.current = Date.now();

    AsyncStorage.getItem(saveKey)
      .then(raw => {
        if (!raw) return;
        try {
          const data: SaveData = JSON.parse(raw);
          dispatch({ type: 'LOAD', payload: data });
          const elapsed = Date.now() - (data.lastActiveAt ?? Date.now());
          dispatch({ type: 'APPLY_OFFLINE_PROGRESS', elapsedMs: elapsed });
          dispatch({ type: 'APPLY_DAILY_LOGIN', nowMs: Date.now() });
          dispatch({ type: 'APPLY_WEEKLY_ROLLOVER', nowMs: Date.now() });
        } catch {
          // Ignore corrupted save and continue fresh.
        }
      })
      .finally(() => setHydrated(true));
  }, [saveKey]);

  useEffect(() => {
    if (!state.characterCreated) return;
    const today = toDayNumber(Date.now());
    if (state.lastDailyLoginDay !== today) {
      dispatch({ type: 'APPLY_DAILY_LOGIN', nowMs: Date.now() });
    }
  }, [state.characterCreated, state.lastDailyLoginDay]);

  useEffect(() => {
    if (!state.characterCreated) return;
    const week = weekNumberForTimestamp(Date.now());
    if (state.weeklyEventWeek !== week) {
      dispatch({ type: 'APPLY_WEEKLY_ROLLOVER', nowMs: Date.now() });
    }
  }, [state.characterCreated, state.weeklyEventWeek]);

  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastTickRef.current;
      lastTickRef.current = now;
      dispatch({ type: 'TICK', elapsed });

      if (stateRef.current.characterCreated && now - lastSaveRef.current >= SAVE_INTERVAL_MS) {
        lastSaveRef.current = now;
        AsyncStorage.setItem(saveKey, JSON.stringify(serialize(stateRef.current)));
      }
    }, TICK_MS);
    return () => clearInterval(id);
  }, [saveKey]);

  useEffect(() => {
    if (!state.characterCreated || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    sessionStartedAtRef.current = Date.now();
    prevSummonsRef.current = state.totalSummons;
    prevHighestWaveRef.current = state.highestWaveReached;
    prevPrestigeRef.current = state.prestigeCount;
    prevFtueCountRef.current = state.tutorialCompletedQuestIds.length;
    void trackEvent('session_start', {
      saveSlot,
      level: state.level,
      wave: state.wave,
      highestWave: state.highestWaveReached,
    });
  }, [state.characterCreated, state.level, state.wave, state.highestWaveReached, state.prestigeCount, state.totalSummons, state.tutorialCompletedQuestIds.length, saveSlot]);

  useEffect(() => {
    return () => {
      if (!sessionStartedRef.current) return;
      const durationSec = Math.max(1, Math.floor((Date.now() - sessionStartedAtRef.current) / 1000));
      void trackEvent('session_end', {
        saveSlot,
        durationSec,
        level: stateRef.current.level,
        wave: stateRef.current.wave,
        highestWave: stateRef.current.highestWaveReached,
      });
    };
  }, [saveSlot]);

  useEffect(() => {
    if (!sessionStartedRef.current) return;

    if (state.totalSummons > prevSummonsRef.current) {
      const delta = state.totalSummons - prevSummonsRef.current;
      prevSummonsRef.current = state.totalSummons;
      void trackEvent('summon_used', {
        count: delta,
        totalSummons: state.totalSummons,
      });
    }

    if (state.highestWaveReached > prevHighestWaveRef.current) {
      prevHighestWaveRef.current = state.highestWaveReached;
      void trackEvent('wave_reached', {
        wave: state.highestWaveReached,
      });
    }

    if (state.prestigeCount > prevPrestigeRef.current) {
      prevPrestigeRef.current = state.prestigeCount;
      void trackEvent('rebirth_done', {
        prestigeCount: state.prestigeCount,
        wave: state.wave,
      });
    }

    if (state.tutorialCompletedQuestIds.length > prevFtueCountRef.current) {
      const newQuestIds = state.tutorialCompletedQuestIds.slice(prevFtueCountRef.current);
      prevFtueCountRef.current = state.tutorialCompletedQuestIds.length;
      newQuestIds.forEach(questId => {
        void trackEvent('ftue_step_completed', {
          questId,
          stepIndex: state.tutorialCompletedQuestIds.indexOf(questId) + 1,
        });
      });
    }
  }, [state.totalSummons, state.highestWaveReached, state.prestigeCount, state.wave, state.tutorialCompletedQuestIds]);

  const createCharacter = useCallback((name: string, playerClass: PlayerClass) => {
    dispatch({ type: 'CREATE_CHARACTER', name, playerClass });
  }, []);

  const notifyQuestEvent = useCallback((event: TutorialEvent) => {
    dispatch({ type: 'QUEST_EVENT', event });
  }, []);

  const attack = useCallback(() => dispatch({ type: 'ATTACK' }), []);
  const buyParty = useCallback((id: PartyId, amount: number) => {
    dispatch({ type: 'BUY_PARTY', id, amount });
  }, []);
  const buySkill = useCallback((id: string) => dispatch({ type: 'BUY_SKILL', id }), []);
  const allocateStat = useCallback((stat: StatKey) => dispatch({ type: 'ALLOCATE_STAT', stat }), []);
  const allocateStatMax = useCallback((stat: StatKey) => dispatch({ type: 'ALLOCATE_STAT_MAX', stat }), []);
  const allocateStatN = useCallback((stat: StatKey, amount: number) => dispatch({ type: 'ALLOCATE_STAT_N', stat, amount }), []);
  const burst = useCallback((hits: number) => dispatch({ type: 'BURST', hits }), []);
  const equipItem = useCallback((itemId: string) => dispatch({ type: 'EQUIP_ITEM', itemId }), []);
  const summonHero = useCallback(() => dispatch({ type: 'SUMMON_HERO' }), []);
  const summonHeroX10 = useCallback(() => dispatch({ type: 'SUMMON_HERO_X10' }), []);
  const autoEquipBestHeroes = useCallback(() => dispatch({ type: 'AUTO_EQUIP_BEST_HEROES' }), []);
  const saveTeamLoadout = useCallback((slot: number) => dispatch({ type: 'SAVE_TEAM_LOADOUT', slot }), []);
  const loadTeamLoadout = useCallback((slot: number) => dispatch({ type: 'LOAD_TEAM_LOADOUT', slot }), []);
  const toggleEquipHero = useCallback((uid: string) => dispatch({ type: 'TOGGLE_EQUIP_HERO', uid }), []);
  const setActiveTeam = useCallback((heroIds: string[]) => dispatch({ type: 'SET_ACTIVE_TEAM', heroIds }), []);
  const setHeroFormation = useCallback((uid: string, role: HeroFormationRole) => {
    dispatch({ type: 'SET_HERO_FORMATION', uid, role });
  }, []);
  const recycleHero = useCallback((uid: string) => dispatch({ type: 'RECYCLE_HERO', uid }), []);
  const autoRecycleHeroes = useCallback(() => dispatch({ type: 'AUTO_RECYCLE_HEROES' }), []);
  const setAutoRecycleMaxRarity = useCallback((rarity: Rarity) => {
    dispatch({ type: 'SET_AUTO_RECYCLE_MAX_RARITY', rarity });
  }, []);
  const setAutoRecycleEnabled = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_AUTO_RECYCLE_ENABLED', enabled });
  }, []);
  const rankUpHero = useCallback((uid: string) => dispatch({ type: 'RANK_UP_HERO', uid }), []);
  const levelUpHeroGold = useCallback((uid: string) => dispatch({ type: 'LEVEL_UP_HERO_GOLD', uid }), []);
  const convertShardsToEssence = useCallback(() => dispatch({ type: 'CONVERT_SHARDS_TO_ESSENCE' }), []);
  const convertShardsToScrap = useCallback(() => dispatch({ type: 'CONVERT_SHARDS_TO_SCRAP' }), []);
  const spendRebirthCore = useCallback((path: 'damage' | 'economy' | 'survival') => {
    dispatch({ type: 'SPEND_REBIRTH_CORE', path });
  }, []);
  const useUsableItem = useCallback((itemId: string) => dispatch({ type: 'USE_USABLE_ITEM', itemId }), []);
  const dismantleEquipment = useCallback((itemId: string) => dispatch({ type: 'DISMANTLE_EQUIPMENT', itemId }), []);
  const craftEquipment = useCallback((slot: EquipmentSlot) => dispatch({ type: 'CRAFT_EQUIPMENT', slot }), []);
  const upgradeEquipmentRarity = useCallback((itemId: string) => dispatch({ type: 'UPGRADE_EQUIPMENT_RARITY', itemId }), []);
  const setAutoUsePotion = useCallback((enabled: boolean) => dispatch({ type: 'SET_AUTO_USE_POTION', enabled }), []);
  const setAutoUsePotionThreshold = useCallback((thresholdPct: number) => dispatch({ type: 'SET_AUTO_USE_POTION_THRESHOLD', thresholdPct }), []);
  const setAutoSummonEnabled = useCallback((enabled: boolean) => dispatch({ type: 'SET_AUTO_SUMMON_ENABLED', enabled }), []);
  const setAutoSummonMode = useCallback((mode: 'single' | 'x10') => dispatch({ type: 'SET_AUTO_SUMMON_MODE', mode }), []);
  const setCombatTempo = useCallback((tempo: CombatTempo) => dispatch({ type: 'SET_COMBAT_TEMPO', tempo }), []);
  const setAutoSummonReserveGold = useCallback((reserveGold: number) => {
    dispatch({ type: 'SET_AUTO_SUMMON_RESERVE_GOLD', reserveGold });
  }, []);
  const spendEssenceUpgrade = useCallback((path: 'damage' | 'economy' | 'survival') => {
    dispatch({ type: 'SPEND_ESSENCE_UPGRADE', path });
  }, []);
  const claimWeeklyTrack = useCallback((milestone: number) => {
    dispatch({ type: 'CLAIM_WEEKLY_TRACK', milestone });
  }, []);
  const claimMission = useCallback((missionId: string) => {
    dispatch({ type: 'CLAIM_MISSION', missionId });
  }, []);
  const markHintSeen = useCallback((hintId: string) => {
    dispatch({ type: 'MARK_HINT_SEEN', hintId });
  }, []);
  const rebirth = useCallback(() => dispatch({ type: 'REBIRTH' }), []);
  const clearAchievement = useCallback(() => dispatch({ type: 'CLEAR_ACHIEVEMENT' }), []);
  const clearRewardPopup = useCallback(() => dispatch({ type: 'CLEAR_REWARD_POPUP' }), []);

  const getPartyCost = useCallback((id: PartyId, amount: number) => {
    const cfg = PARTY.find(p => p.id === id)!;
    const owned = state.party[id] ?? 0;
    return amount === 1
      ? buildingCost(cfg.baseCost, owned, COST_SCALE)
      : bulkCost(cfg.baseCost, owned, amount, COST_SCALE);
  }, [state.party]);

  const getEssenceCost = useCallback((path: 'damage' | 'economy' | 'survival') => {
    const currentLevel = path === 'damage'
      ? state.metaDamageLevel
      : path === 'economy'
        ? state.metaEconomyLevel
        : state.metaSurvivalLevel;
    return getEssenceUpgradeCost(currentLevel);
  }, [state.metaDamageLevel, state.metaEconomyLevel, state.metaSurvivalLevel]);

  const getRebirthCoreCost = useCallback((path: 'damage' | 'economy' | 'survival') => {
    const level = path === 'damage'
      ? state.rebirthDamagePath
      : path === 'economy'
        ? state.rebirthEconomyPath
        : state.rebirthSurvivalPath;
    return getRebirthPathCost(level);
  }, [state.rebirthDamagePath, state.rebirthEconomyPath, state.rebirthSurvivalPath]);

  const getShardForgeCosts = useCallback(() => ({
    essenceCost: getShardToEssenceCost(state),
    scrapCost: getShardToScrapCost(),
  }), [state]);

  const getUpgradePlan = useCallback((itemId: string) => getEquipmentUpgradePlan(state, itemId), [state]);

  const getWeeklyEvent = useCallback(() => getCurrentWeeklyEvent(state), [state]);
  const getMissionProgress = useCallback((mission: MissionBoardGoal) => {
    const value = getMissionProgressValue(state, mission);
    return {
      value,
      done: value >= mission.target,
    };
  }, [state]);

  const stats = computeStats(state);

  return {
    hydrated,
    state,
    stats,
    createCharacter,
    notifyQuestEvent,
    attack,
    buyParty,
    buySkill,
    allocateStat,
    allocateStatMax,
    allocateStatN,
    burst,
    equipItem,
    summonHero,
    summonHeroX10,
    autoEquipBestHeroes,
    saveTeamLoadout,
    loadTeamLoadout,
    toggleEquipHero,
    setActiveTeam,
    setHeroFormation,
    recycleHero,
    autoRecycleHeroes,
    setAutoRecycleMaxRarity,
    setAutoRecycleEnabled,
    rankUpHero,
    levelUpHeroGold,
    convertShardsToEssence,
    convertShardsToScrap,
    spendRebirthCore,
    useUsableItem,
    dismantleEquipment,
    craftEquipment,
    upgradeEquipmentRarity,
    setAutoUsePotion,
    setAutoUsePotionThreshold,
    setAutoSummonEnabled,
    setAutoSummonMode,
    setCombatTempo,
    setAutoSummonReserveGold,
    spendEssenceUpgrade,
    claimWeeklyTrack,
    claimMission,
    markHintSeen,
    rebirth,
    clearAchievement,
    clearRewardPopup,
    getPartyCost,
    getEssenceCost,
    getRebirthCoreCost,
    getShardForgeCosts,
    getUpgradePlan,
    getWeeklyEvent,
    getMissionProgress,
  };
}
