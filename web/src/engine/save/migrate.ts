import type { PlayerClass } from '../../content/classes';
import { RARITY_BOOST_MULTIPLIER, RARITY_IDS, isRarity, type Rarity } from '../../content/rarities';
import { VALID_FORMATION_ROLES_FOR_CLASS, type FormationRole } from '../combat/formation';
import { PITY_THRESHOLD } from '../roster/summon';
import { readEquipment } from './equipmentSlice';
import { roundTo4 } from '../math/safe';
import {
  MAX_SAVE_COLLECTION,
  MAX_SAVE_PLAYER_LEVEL,
  MAX_SAVE_WAVE,
  SAFE_NUMBER_CAP,
  boundedBoolean,
  boundedFloat,
  boundedInt,
  boundedIntList,
  boundedString,
  boundedStringList,
  isRecord,
} from './guards';
import {
  SAVE_VERSION,
  type SaveContent,
  type SaveV3,
  type SavedHero,
  type SavedUniqueGear,
  type StatBlock,
} from './schema';

/**
 * v2 -> v3 save migration.
 *
 * The first thing to know about the shipped reader is that its version number
 * does nothing. `sanitizeSaveData` reads `saveVersion`, logs it, and then never
 * consults it again: every migration in the shipped game is driven by the
 * *shape* of a field, not by a version gate. Four of them are still live in
 * there, silently fixing up saves written years apart —
 * `highestLevelReached` -> `highestWaveReached`, `lastRiftRunDay` -> the rift
 * entry pair, day numbers -> millisecond stamps, and a bare number in
 * `heroUniqueGearByHeroId` -> a `{ rank, equippedByUid }` record.
 *
 * That is why this migration is also shape-driven and accepts a v2 payload
 * with `saveVersion` missing, wrong, or set to something from the future. A
 * dormant account is exactly the case where the marker is least trustworthy
 * and the shape is all there is.
 */

export const ACTIVE_TEAM_SIZE = 6;
export const MIN_TEAM_SLOTS = 4;
export const TEAM_LOADOUT_COUNT = 3;
export const HERO_LEVEL_CAP = 999;
export const HERO_RANK_CAP = 10;
export const UNIQUE_RANK_CAP = 10;
export const MAX_TEAM_BOOST = 10;
export const MAX_REBIRTH_STAT_MULT = 20;
export const MAX_PLAYER_NAME_LENGTH = 24;
export const MAX_HERO_UID_LENGTH = 64;
export const STAT_POINTS_PER_LEVEL = 5;

const PLAYER_CLASSES: readonly PlayerClass[] = ['warrior', 'berserker', 'archer', 'mage', 'monk'];

/** `Math.floor(80 * 1.16^(level-1))`, ported from `gameConfig.expForLevel`. */
export function expForLevel(level: number): number {
  return Math.floor(80 * Math.pow(1.16, level - 1));
}

function rarityRank(rarity: Rarity): number {
  return RARITY_IDS.indexOf(rarity);
}

export function isPlayerClass(value: unknown): value is PlayerClass {
  return typeof value === 'string' && (PLAYER_CLASSES as readonly string[]).includes(value);
}

/** The five allocated stats, each bounded. Shared with the v3 reader. */
export function readStatBlock(raw: unknown): StatBlock {
  const record = isRecord(raw) ? raw : {};
  return {
    strength: boundedInt(record.strength, 0, SAFE_NUMBER_CAP, 0),
    vitality: boundedInt(record.vitality, 0, SAFE_NUMBER_CAP, 0),
    agility: boundedInt(record.agility, 0, SAFE_NUMBER_CAP, 0),
    intelligence: boundedInt(record.intelligence, 0, SAFE_NUMBER_CAP, 0),
    spirit: boundedInt(record.spirit, 0, SAFE_NUMBER_CAP, 0),
  };
}

export function statPointsSpent(alloc: StatBlock): number {
  return alloc.strength + alloc.vitality + alloc.agility + alloc.intelligence + alloc.spirit;
}

/**
 * Stat points, preserved rather than rebalanced.
 *
 * The shipped rule keeps every point a player ever spent even when the current
 * level no longer justifies the total, and only tops up the unspent pool. That
 * matters more now than when it was written: an account dormant across two
 * balance passes is precisely the one whose spend exceeds its level budget,
 * and a "correct" recompute would confiscate the difference.
 *
 * Written as the shipped expression rather than its simplification
 * (`max(levelBudget, spent) - spent + unspent`) so the two can be diffed.
 */
export function readStatAllocation(
  raw: unknown,
  level: number,
  savedUnspent: unknown,
): { alloc: StatBlock; unspent: number } {
  const levelBudget = Math.max(0, (level - 1) * STAT_POINTS_PER_LEVEL);
  const legacyUnspent = boundedInt(savedUnspent, 0, SAFE_NUMBER_CAP, 0);
  const alloc = readStatBlock(raw);

  const spent = statPointsSpent(alloc);
  const effectiveBudget = Math.max(levelBudget + legacyUnspent, spent + legacyUnspent);

  return { alloc, unspent: Math.max(0, effectiveBudget - spent) };
}

export function readHero(raw: unknown, index: number, content: SaveContent): SavedHero | null {
  if (!isRecord(raw) || typeof raw.id !== 'string') return null;
  const template = content.heroesById.get(raw.id);
  if (!template) return null;

  const rarity: Rarity = isRarity(raw.rarity) ? raw.rarity : 'common';
  const fallbackUid = `${raw.id}_${index}`;
  const baseBoost = roundTo4(template.baseTeamBoost * RARITY_BOOST_MULTIPLIER[rarity]);

  return {
    id: raw.id,
    uid: boundedString(raw.uid, fallbackUid, MAX_HERO_UID_LENGTH) || fallbackUid,
    rarity,
    level: boundedInt(raw.level, 1, HERO_LEVEL_CAP, 1),
    rank: boundedInt(raw.rank, 1, HERO_RANK_CAP, 1),
    // The floor is the hero's own base boost, so a save that under-reports it
    // is repaired upward rather than trusted.
    teamBoost: roundTo4(boundedFloat(raw.teamBoost, baseBoost, MAX_TEAM_BOOST, baseBoost)),
    rebirthStatMult: roundTo4(boundedFloat(raw.rebirthStatMult, 1, MAX_REBIRTH_STAT_MULT, 1)),
  };
}

/** Which copy of a hero carries their relic when the save only says "equipped". */
export function preferredUniqueBearer(heroes: readonly SavedHero[], templateId: string): SavedHero | null {
  let best: SavedHero | null = null;
  for (const hero of heroes) {
    if (hero.id !== templateId) continue;
    if (!best || isPreferredBearer(hero, best)) best = hero;
  }
  return best;
}

function isPreferredBearer(candidate: SavedHero, current: SavedHero): boolean {
  const rarityDiff = rarityRank(candidate.rarity) - rarityRank(current.rarity);
  if (rarityDiff !== 0) return rarityDiff > 0;
  if (candidate.level !== current.level) return candidate.level > current.level;
  if (candidate.rank !== current.rank) return candidate.rank > current.rank;
  if (candidate.teamBoost !== current.teamBoost) return candidate.teamBoost > current.teamBoost;
  // Ties break on uid so the choice is stable across reads of the same save.
  return candidate.uid.localeCompare(current.uid) < 0;
}

/**
 * Selection uses the same per-rank limit as the combat bonus. Re-declared here
 * rather than imported so that changing the combat cap cannot silently
 * invalidate teams people already have saved; `saveMigration.test.ts` asserts
 * the two are equal, which turns a divergence into a decision rather than a
 * side effect.
 */
export const MAX_FORMATION_ROLE_HEROES_IN_SELECTION = 2;

/**
 * Team selection, replayed through the rules rather than trusted.
 *
 * A stored team can be illegal in several ways at once — a hero who was
 * recycled, two copies of the same template, three heroes in a rank that holds
 * two, more heroes than the account has slots for. The shipped reader walks
 * the stored order and keeps the first entry that is still legal at each step,
 * which means the player's priority order survives even when their team does
 * not.
 */
export function normalizeTeamSelection(
  heroes: readonly SavedHero[],
  formationByUid: Readonly<Record<string, FormationRole>>,
  content: SaveContent,
  slotCap: number,
  requested: readonly string[],
): string[] {
  const accepted: string[] = [];
  const seenUids = new Set<string>();
  const seenTemplateIds = new Set<string>();
  const roleCounts: Record<FormationRole, number> = { front: 0, mid: 0, back: 0 };

  for (const uid of requested) {
    if (accepted.length >= slotCap) break;
    if (seenUids.has(uid)) continue;
    const hero = heroes.find(candidate => candidate.uid === uid);
    if (!hero) continue;
    if (seenTemplateIds.has(hero.id)) continue;
    const heroClass = content.heroesById.get(hero.id)?.heroClass;
    if (!heroClass) continue;

    const role = formationByUid[uid] ?? VALID_FORMATION_ROLES_FOR_CLASS[heroClass][0];
    if (roleCounts[role] >= MAX_FORMATION_ROLE_HEROES_IN_SELECTION) continue;

    accepted.push(uid);
    seenUids.add(uid);
    seenTemplateIds.add(hero.id);
    roleCounts[role] += 1;
  }

  return accepted;
}

/**
 * The summon counters, from whichever payload shape carries them.
 *
 * Takes the values already picked out rather than a payload, because the two
 * readers spell them differently — v2 has a flat `gachaPityCounter` and v3 has
 * `summon.pityCounter` — and the *bounds* are the part worth sharing. A second
 * copy of them is a second thing to get wrong on one side only.
 */
export function readSummonProgress(raw: {
  pityCounter: unknown;
  totalSummons: unknown;
  freeCharges: unknown;
  claimedMilestones: unknown;
  guaranteedMinRarity: unknown;
  firstGiven: unknown;
}): SaveV3['summon'] {
  return {
    // Capped at the hard threshold rather than at a large number: the counter
    // resets the moment it would reach it, so a stored value above it is
    // either tampering or a bug, and either way the next pull is free
    // legendary. Clamping keeps that to one pull instead of standing forever.
    pityCounter: boundedInt(raw.pityCounter, 0, PITY_THRESHOLD, 0),
    totalSummons: boundedInt(raw.totalSummons, 0, SAFE_NUMBER_CAP, 0),
    freeCharges: boundedInt(raw.freeCharges, 0, SAFE_NUMBER_CAP, 0),
    // Order is preserved rather than sorted. `claimMilestones` only tests
    // membership, and rewriting the order would make the round trip visible in
    // a diff for no gain.
    claimedMilestones: boundedIntList(raw.claimedMilestones, MAX_SAVE_COLLECTION),
    guaranteedMinRarity: isRarity(raw.guaranteedMinRarity) ? raw.guaranteedMinRarity : null,
    firstGiven: boundedBoolean(raw.firstGiven, false),
  };
}

/** Keys the typed slice of `SaveV3` claims out of a v2 payload. */
export const CLAIMED_V2_KEYS: readonly string[] = [
  'saveVersion',
  'playerName',
  'playerClass',
  'characterCreated',
  'level',
  'exp',
  'totalExp',
  'wave',
  'highestWaveReached',
  'highestLevelReached',
  'totalKills',
  'prestigeCount',
  'rebirthDamagePath',
  'rebirthEconomyPath',
  'rebirthSurvivalPath',
  'metaDamageLevel',
  'metaEconomyLevel',
  'metaSurvivalLevel',
  'statsAlloc',
  'unspentStatPoints',
  'gold',
  'totalGold',
  'diamonds',
  'heroShards',
  'bossTears',
  'essence',
  'rebirthCores',
  'equipmentScrap',
  'sparkTokens',
  'gachaPityCounter',
  'totalSummons',
  'freeSummonCharges',
  'claimedSummonMilestones',
  'guaranteedMinRarity',
  'firstSummonGiven',
  'heroRoster',
  'activeTeamHeroIds',
  'heroFormationByUid',
  'heroUniqueGearByHeroId',
  'teamLoadouts',
  'teamSlotsUnlocked',
  'lastActiveAt',
  'inventoryItemIds',
  'equipmentInventory',
  'equippedItems',
  'autoDismantleRarityFloor',
];

export interface MigrateOptions {
  /** Wall clock at read time. Injected so the engine stays deterministic. */
  nowMs: number;
  content: SaveContent;
  /**
   * The away high-water mark already on record for this account, if any.
   * See `awayClock.ts` — passing it is what stops a rolled-back device clock
   * from manufacturing offline time.
   */
  knownAwayAtMs?: number;
}

export function migrateSave(payload: unknown, options: MigrateOptions): SaveV3 {
  const raw = isRecord(payload) ? payload : {};
  const { nowMs, content } = options;

  const name = boundedString(raw.playerName, '', MAX_PLAYER_NAME_LENGTH);
  const playerClass = isPlayerClass(raw.playerClass) ? raw.playerClass : null;
  // A save can claim a created character while carrying neither a name nor a
  // class; the shipped reader disbelieves it, and so does this one.
  const created = boundedBoolean(raw.characterCreated, false) && !!name && playerClass !== null;

  const level = boundedInt(raw.level, 1, MAX_SAVE_PLAYER_LEVEL, 1);
  const wave = boundedInt(raw.wave, 1, MAX_SAVE_WAVE, 1);
  // `highestLevelReached` is the pre-v2 name for this field.
  const highestWave = Math.max(
    wave,
    boundedInt(raw.highestWaveReached ?? raw.highestLevelReached, 1, MAX_SAVE_WAVE, 1),
  );

  const { alloc, unspent } = readStatAllocation(raw.statsAlloc, level, raw.unspentStatPoints);

  const heroes: SavedHero[] = [];
  const uids = new Set<string>();
  if (Array.isArray(raw.heroRoster)) {
    for (const [index, entry] of raw.heroRoster.entries()) {
      if (heroes.length >= MAX_SAVE_COLLECTION) break;
      const hero = readHero(entry, index, content);
      if (!hero || uids.has(hero.uid)) continue;
      uids.add(hero.uid);
      heroes.push(hero);
    }
  }

  const formationByUid: Record<string, FormationRole> = {};
  if (isRecord(raw.heroFormationByUid)) {
    for (const [uid, role] of Object.entries(raw.heroFormationByUid)) {
      if (!uids.has(uid)) continue;
      const hero = heroes.find(candidate => candidate.uid === uid);
      const heroClass = hero && content.heroesById.get(hero.id)?.heroClass;
      if (!heroClass) continue;
      // A role the class may not hold is dropped, not coerced — the hero then
      // falls back to their class default, which is where they would sit anyway.
      if (typeof role !== 'string') continue;
      if (!VALID_FORMATION_ROLES_FOR_CLASS[heroClass].includes(role as FormationRole)) continue;
      formationByUid[uid] = role as FormationRole;
    }
  }

  const uniqueByHeroId: Record<string, SavedUniqueGear> = {};
  if (isRecord(raw.heroUniqueGearByHeroId)) {
    for (const [heroId, entry] of Object.entries(raw.heroUniqueGearByHeroId)) {
      if (!content.heroesById.has(heroId)) continue;
      // Pre-v2 saves stored a bare rank number where v2 stores a record.
      const rank = isRecord(entry)
        ? boundedInt(entry.rank, 1, UNIQUE_RANK_CAP, 1)
        : boundedInt(entry, 1, UNIQUE_RANK_CAP, 1);
      const shouldEquip = isRecord(entry)
        ? typeof entry.equippedByUid === 'string'
          ? entry.equippedByUid.length > 0
          : boundedBoolean(entry.equipped, true)
        : true;
      // The stored bearer uid is deliberately not trusted: that copy of the
      // hero may have been recycled since. The bearer is re-derived instead.
      uniqueByHeroId[heroId] = {
        rank,
        equippedByUid: shouldEquip ? (preferredUniqueBearer(heroes, heroId)?.uid ?? null) : null,
      };
    }
  }

  const slotsUnlocked = boundedInt(raw.teamSlotsUnlocked, MIN_TEAM_SLOTS, ACTIVE_TEAM_SIZE, MIN_TEAM_SLOTS);
  const selectTeam = (requested: readonly string[]): string[] =>
    normalizeTeamSelection(heroes, formationByUid, content, slotsUnlocked, requested);

  const activeUids = selectTeam(
    boundedStringList(raw.activeTeamHeroIds, ACTIVE_TEAM_SIZE).filter(uid => uids.has(uid)),
  );

  // Always three loadouts, padded with empties, so slot two staying empty
  // cannot shift what the player saved in slot three.
  const storedLoadouts = Array.isArray(raw.teamLoadouts) ? raw.teamLoadouts.slice(0, TEAM_LOADOUT_COUNT) : [];
  const loadouts: string[][] = [];
  for (let slot = 0; slot < TEAM_LOADOUT_COUNT; slot += 1) {
    loadouts.push(selectTeam(boundedStringList(storedLoadouts[slot], ACTIVE_TEAM_SIZE).filter(uid => uids.has(uid))));
  }

  const gold = boundedInt(raw.gold, 0, SAFE_NUMBER_CAP, 0);
  const exp = boundedInt(raw.exp, 0, Math.max(0, expForLevel(level) - 1), 0);

  const equipment = readEquipment({
    inventoryItemIds: raw.inventoryItemIds,
    equipmentInventory: raw.equipmentInventory,
    equippedItems: raw.equippedItems,
    autoDismantleRarityFloor: raw.autoDismantleRarityFloor,
    content,
    level,
  });

  const legacy: Record<string, unknown> = {};
  const claimed = new Set(CLAIMED_V2_KEYS);
  for (const [key, value] of Object.entries(raw)) {
    if (claimed.has(key)) continue;
    legacy[key] = value;
  }

  return {
    version: SAVE_VERSION,
    awayAtMs: Math.max(options.knownAwayAtMs ?? 0, boundedInt(raw.lastActiveAt, 0, nowMs, nowMs)),
    identity: { name, playerClass, created },
    progression: {
      level,
      exp,
      // Note the asymmetry with `totalGold` below: the shipped reader floors
      // lifetime gold at current gold but does not floor lifetime exp at
      // current exp, so a save can report less exp earned than it holds.
      // Ported as-is; `saveMigration.test.ts` pins it as a known divergence.
      totalExp: boundedInt(raw.totalExp, 0, SAFE_NUMBER_CAP, 0),
      wave,
      highestWave,
      totalKills: boundedInt(raw.totalKills, 0, SAFE_NUMBER_CAP, 0),
      prestigeCount: boundedInt(raw.prestigeCount, 0, SAFE_NUMBER_CAP, 0),
      rebirthDamagePath: boundedInt(raw.rebirthDamagePath, 0, SAFE_NUMBER_CAP, 0),
      rebirthEconomyPath: boundedInt(raw.rebirthEconomyPath, 0, SAFE_NUMBER_CAP, 0),
      rebirthSurvivalPath: boundedInt(raw.rebirthSurvivalPath, 0, SAFE_NUMBER_CAP, 0),
      metaDamageLevel: boundedInt(raw.metaDamageLevel, 0, SAFE_NUMBER_CAP, 0),
      metaEconomyLevel: boundedInt(raw.metaEconomyLevel, 0, SAFE_NUMBER_CAP, 0),
      metaSurvivalLevel: boundedInt(raw.metaSurvivalLevel, 0, SAFE_NUMBER_CAP, 0),
    },
    stats: { alloc, unspent },
    equipment,
    wallet: {
      gold,
      totalGold: Math.max(gold, boundedInt(raw.totalGold, 0, SAFE_NUMBER_CAP, 0)),
      diamonds: boundedInt(raw.diamonds, 0, SAFE_NUMBER_CAP, 0),
      heroShards: boundedInt(raw.heroShards, 0, SAFE_NUMBER_CAP, 0),
      bossTears: boundedInt(raw.bossTears, 0, SAFE_NUMBER_CAP, 0),
      essence: boundedInt(raw.essence, 0, SAFE_NUMBER_CAP, 0),
      rebirthCores: boundedInt(raw.rebirthCores, 0, SAFE_NUMBER_CAP, 0),
      equipmentScrap: boundedInt(raw.equipmentScrap, 0, SAFE_NUMBER_CAP, 0),
      sparkTokens: boundedInt(raw.sparkTokens, 0, SAFE_NUMBER_CAP, 0),
    },
    summon: readSummonProgress({
      pityCounter: raw.gachaPityCounter,
      totalSummons: raw.totalSummons,
      freeCharges: raw.freeSummonCharges,
      claimedMilestones: raw.claimedSummonMilestones,
      guaranteedMinRarity: raw.guaranteedMinRarity,
      firstGiven: raw.firstSummonGiven,
    }),
    roster: { heroes, activeUids, loadouts, slotsUnlocked, formationByUid, uniqueByHeroId },
    legacy,
    claimedLegacyKeys: [...CLAIMED_V2_KEYS].sort(),
  };
}
