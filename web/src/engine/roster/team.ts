import { VALID_FORMATION_ROLES_FOR_CLASS, type FormationRole } from '../combat/formation';
import type { PlayerClass } from '../../content/classes';
import { ACTIVE_TEAM_SIZE, MIN_TEAM_SLOTS, TEAM_LOADOUT_COUNT, normalizeTeamSelection } from '../save/migrate';
import type { SaveContent, SavedHero } from '../save/schema';
import { HERO_LEVEL_CAP, heroGoldLevelCost } from './progression';

/**
 * Managing a team: who is fielded, where they stand, the saved loadouts, the
 * slots the account has unlocked, and levelling a batch of heroes at once.
 *
 * Most of what is here is a *refusal* rather than a formula — a role the class
 * may not hold, a slot the account has not earned, a hero already in the line —
 * which is why the fixture drives the real reducer rather than recording
 * arithmetic.
 *
 * Selection itself is not reimplemented. `normalizeTeamSelection` already
 * exists in `engine/save/migrate.ts`, because the save reader has to replay a
 * stored team through the same rules, and calling it from here is what keeps
 * "the team you set" and "the team your save restores" from drifting apart.
 */

export interface TeamHero extends SavedHero {
  heroClass: PlayerClass;
}

/** What it costs to unlock the next team slot, and what it takes to qualify. */
export interface SlotUnlockRule {
  requiredWave: number;
  goldCost: number;
  shardCost: number;
}

export const TEAM_SLOT_UNLOCK_RULES: Readonly<Record<number, SlotUnlockRule>> = {
  5: { requiredWave: 50, goldCost: 125_000, shardCost: 450 },
  6: { requiredWave: 100, goldCost: 550_000, shardCost: 1_600 },
};

export function unlockedSlotCap(teamSlotsUnlocked: number): number {
  const safe = Number.isFinite(teamSlotsUnlocked) ? Math.floor(teamSlotsUnlocked) : MIN_TEAM_SLOTS;
  return Math.max(MIN_TEAM_SLOTS, Math.min(ACTIVE_TEAM_SIZE, safe));
}

export interface SlotUnlock {
  slotsUnlocked: number;
  gold: number;
  heroShards: number;
}

/**
 * Unlock one slot, or refuse.
 *
 * One at a time, and the sixth asks for twice the wave the fifth did — a
 * player at wave 60 can buy the fifth and not the sixth however rich they are.
 */
export function unlockNextSlot(current: {
  slotsUnlocked: number;
  gold: number;
  heroShards: number;
  highestWave: number;
}): SlotUnlock | null {
  const from = unlockedSlotCap(current.slotsUnlocked);
  if (from >= ACTIVE_TEAM_SIZE) return null;

  const target = from + 1;
  const rule = TEAM_SLOT_UNLOCK_RULES[target];
  if (!rule) return null;
  if (current.highestWave < rule.requiredWave) return null;
  if (current.gold < rule.goldCost || current.heroShards < rule.shardCost) return null;

  return {
    slotsUnlocked: target,
    gold: current.gold - rule.goldCost,
    heroShards: current.heroShards - rule.shardCost,
  };
}

/** Which heroes a request actually fields, after the selection rules. */
export function setActiveTeam(
  heroes: readonly TeamHero[],
  formationByUid: Readonly<Record<string, FormationRole>>,
  content: SaveContent,
  slotsUnlocked: number,
  requested: readonly string[],
): string[] {
  return normalizeTeamSelection(heroes, formationByUid, content, unlockedSlotCap(slotsUnlocked), requested);
}

/** How many of the active team stand in each rank. */
export function roleCounts(
  heroes: readonly TeamHero[],
  formationByUid: Readonly<Record<string, FormationRole>>,
  activeUids: readonly string[],
): Record<FormationRole, number> {
  const counts: Record<FormationRole, number> = { front: 0, mid: 0, back: 0 };
  for (const uid of activeUids) {
    const hero = heroes.find(candidate => candidate.uid === uid);
    if (!hero) continue;
    const role = formationByUid[uid] ?? VALID_FORMATION_ROLES_FOR_CLASS[hero.heroClass][0];
    counts[role] += 1;
  }
  return counts;
}

export const MAX_FORMATION_ROLE_HEROES = 2;

/**
 * Move a hero to a rank, or refuse.
 *
 * Two refusals and a subtlety. A role the hero's class may not hold is
 * refused outright. A rank already holding its two is refused **only for a
 * hero who is currently fielded** — a benched hero may be assigned any legal
 * role even when that rank is full on the active team, because the count is
 * taken against the line they are not in.
 *
 * That is not an oversight to tidy: it is what lets a player set up a bench
 * before swapping it in, and a port that checked the cap unconditionally would
 * make preparing a second formation impossible.
 */
export function setFormationRole(
  heroes: readonly TeamHero[],
  formationByUid: Readonly<Record<string, FormationRole>>,
  activeUids: readonly string[],
  uid: string,
  role: FormationRole,
): Record<string, FormationRole> | null {
  const hero = heroes.find(candidate => candidate.uid === uid);
  if (!hero) return null;
  if (!VALID_FORMATION_ROLES_FOR_CLASS[hero.heroClass].includes(role)) return null;

  if (activeUids.includes(uid)) {
    const withoutThem = activeUids.filter(candidate => candidate !== uid);
    if (roleCounts(heroes, formationByUid, withoutThem)[role] >= MAX_FORMATION_ROLE_HEROES) return null;
  }

  return { ...formationByUid, [uid]: role };
}

/**
 * Save the fielded team into a loadout slot.
 *
 * The slot index is **clamped** rather than rejected, which is the shipped
 * behaviour: asking for slot 99 writes slot 2. Rejecting would be safer, and
 * a port that rejected would silently drop a save the shipped app accepted.
 */
export function saveLoadout(
  loadouts: readonly (readonly string[])[],
  slot: number,
  activeUids: readonly string[],
): string[][] {
  const index = Math.max(0, Math.min(TEAM_LOADOUT_COUNT - 1, Math.floor(slot)));
  const next = loadouts.map(entry => [...entry]);
  while (next.length < TEAM_LOADOUT_COUNT) next.push([]);
  next[index] = [...activeUids];
  return next;
}

/** Field a saved loadout, replayed through the selection rules. */
export function loadLoadout(
  heroes: readonly TeamHero[],
  formationByUid: Readonly<Record<string, FormationRole>>,
  content: SaveContent,
  slotsUnlocked: number,
  loadouts: readonly (readonly string[])[],
  slot: number,
): string[] {
  const index = Math.max(0, Math.min(TEAM_LOADOUT_COUNT - 1, Math.floor(slot)));
  return setActiveTeam(heroes, formationByUid, content, slotsUnlocked, loadouts[index] ?? []);
}

export interface BatchLevelResult {
  levelByUid: Record<string, number>;
  gold: number;
}

/**
 * Level a batch of heroes.
 *
 * Two things here decide who actually gets the levels, and a port can get the
 * total right while getting both wrong.
 *
 * **Order is the roster's, not the caller's.** The shipped loop builds its
 * working set by walking `heroRoster` and keeping the selected uids, so when
 * gold runs out partway it is a hero's position in the roster that decides
 * whether they got the last level — not where the player put them in the
 * request. `selected` is therefore a set and `heroes` the ordering.
 *
 * **A step that cannot be paid for is skipped, not fatal.** The fixed-count
 * mode walks every hero once per step and continues past one it cannot afford,
 * so a short purse does not stop the batch: the heroes who stay cheap keep
 * levelling while the expensive one stalls. `break` is the obvious reading and
 * would leave the cheap heroes unlevelled.
 *
 * `'max'` is a different algorithm rather than a large count: it repeatedly
 * buys the single cheapest next level across the whole selection, which
 * maximises total levels rather than any one hero's.
 */
export function batchLevel(
  heroes: readonly TeamHero[],
  selectedUids: readonly string[],
  addLevels: number | 'max',
  gold: number,
): BatchLevelResult {
  const selected = new Set(selectedUids);
  const levelByUid: Record<string, number> = {};
  for (const hero of heroes) {
    if (selected.has(hero.uid)) levelByUid[hero.uid] = hero.level;
  }

  let purse = gold;
  if (Object.keys(levelByUid).length === 0) return { levelByUid, gold: purse };

  if (addLevels === 'max') {
    for (;;) {
      let cheapestUid: string | null = null;
      let cheapestCost = Number.POSITIVE_INFINITY;
      for (const uid of Object.keys(levelByUid)) {
        const level = levelByUid[uid];
        if (level >= HERO_LEVEL_CAP) continue;
        const cost = heroGoldLevelCost(level);
        if (cost < cheapestCost) {
          cheapestCost = cost;
          cheapestUid = uid;
        }
      }
      if (!cheapestUid || !Number.isFinite(cheapestCost) || purse < cheapestCost) break;
      purse -= cheapestCost;
      levelByUid[cheapestUid] += 1;
    }
    return { levelByUid, gold: purse };
  }

  const steps = Math.max(0, Math.floor(addLevels));
  for (let step = 0; step < steps; step += 1) {
    for (const uid of Object.keys(levelByUid)) {
      const level = levelByUid[uid];
      if (level >= HERO_LEVEL_CAP) continue;
      const cost = heroGoldLevelCost(level);
      if (purse < cost) continue;
      purse -= cost;
      levelByUid[uid] = level + 1;
    }
  }

  return { levelByUid, gold: purse };
}

export interface SparkExchangeOption {
  id: string;
  sparkCost: number;
  kind: 'free_summon' | 'targeted_hero' | 'guaranteed_transcendent';
  minRarity?: string;
  minTier?: number;
}

export const SPARK_EXCHANGE_OPTIONS: readonly SparkExchangeOption[] = [
  { id: 'spark_free_charge', sparkCost: 50, kind: 'free_summon' },
  { id: 'spark_rare', sparkCost: 150, kind: 'targeted_hero', minRarity: 'rare' },
  { id: 'spark_epic', sparkCost: 500, kind: 'targeted_hero', minRarity: 'epic' },
  { id: 'spark_legendary', sparkCost: 1500, kind: 'targeted_hero', minRarity: 'legendary' },
  { id: 'spark_mythic', sparkCost: 5000, kind: 'targeted_hero', minRarity: 'mythic' },
  {
    id: 'spark_transcendent_t4t5',
    sparkCost: 75_000,
    kind: 'guaranteed_transcendent',
    minRarity: 'transcendent',
    minTier: 4,
  },
];

/**
 * Spend spark tokens on an exchange option, or refuse.
 *
 * Returns what the exchange costs and which option was bought; granting the
 * hero is the caller's, because it needs the catalogue and the dice and this
 * does not.
 */
export function spendSpark(
  sparkTokens: number,
  optionId: string,
): { option: SparkExchangeOption; left: number } | null {
  const option = SPARK_EXCHANGE_OPTIONS.find(entry => entry.id === optionId);
  if (!option) return null;
  if (sparkTokens < option.sparkCost) return null;
  return { option, left: sparkTokens - option.sparkCost };
}
