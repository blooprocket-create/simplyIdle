import type { PlayerClass } from '../../content/classes';
import type { EquipmentRarity, EquipmentSlot } from '../../content/equipment';
import type { Rarity } from '../../content/rarities';
import type { FormationRole } from '../combat/formation';
import type { EquipmentSource } from '../equipment/instance';
import type { SavedUsables } from './usablesSlice';
import type { SavedVip } from './vipSlice';
import type { SavedCalendar } from '../progression/calendar';
import type { SavedDungeons } from '../dungeons/run';
import type { SavedExpeditions } from '../expeditions/contracts';
import type { SavedMailbox } from '../mail/mailbox';
import type { FacilityId } from '../prestige/facilities';

/**
 * The v3 save.
 *
 * v2 is a flat bag of roughly 120 fields, most of which belong to menus this
 * revamp has not decided the fate of yet. Typing all of them now would mean
 * inventing a state shape ahead of the simulation that has to hold it, and
 * then migrating a second time when the simulation disagrees.
 *
 * So v3 types the slice the engine can already act on — identity, progression,
 * wallet, roster — and carries **everything else verbatim** in `legacy`. No
 * field is dropped, no dormant account loses anything, and a later phase can
 * claim a field out of `legacy` on its own schedule without a second migration
 * event. `claimedLegacyKeys` records which keys the typed slice took, so that
 * "what is left in legacy" is a question with an answer rather than a guess.
 */

export const SAVE_VERSION = 3;

/** The version the shipped game writes. */
export const LEGACY_SAVE_VERSION = 2;

export interface StatBlock {
  strength: number;
  vitality: number;
  agility: number;
  intelligence: number;
  spirit: number;
}

export const STAT_KEYS: readonly (keyof StatBlock)[] = ['strength', 'vitality', 'agility', 'intelligence', 'spirit'];

export interface SavedHero {
  /** Hero template id, e.g. `h1`. Several heroes may share one. */
  id: string;
  /** Unique instance id. The roster key, and what formations point at. */
  uid: string;
  rarity: Rarity;
  level: number;
  rank: number;
  teamBoost: number;
  rebirthStatMult: number;
}

/**
 * One owned item, as it is stored.
 *
 * The display strings are carried rather than rebuilt from the catalogue,
 * which looks redundant and is not: an item renamed in the catalogue keeps the
 * name the player earned it under, and — more to the point — `legacyPayload.ts`
 * has to write this back out and the engine may not read the catalogue to do
 * it. `slot` and `allowedClasses` are absent for the opposite reason: both
 * readers derive them from the base item and ignore anything stored, so
 * carrying them would be carrying two answers to one question.
 */
export interface SavedEquipment {
  /** The catalogue row this was rolled from. An instance with none is dropped. */
  baseItemId: string;
  name: string;
  emoji: string;
  description: string;
  /** May differ from the base item's: an upgrade builds from a different row. */
  rarity: EquipmentRarity;
  bonus: StatBlock;
  itemLevel: number;
  /** Where it came from. Decides what it is worth taken apart. */
  source: EquipmentSource;
}

/**
 * Everything the player owns and wears.
 *
 * `inventory` holds **both shapes at once**: a bare catalogue id and an id with
 * an instance behind it are both legal entries, because the shipped inventory
 * is a list of ids beside a separate record keyed by the same ids. The reducers
 * read either through one fallback. Converting the bare ones into instances is
 * a migration with dice in it, so it lives where the dice do rather than here.
 */
export interface SaveEquipment {
  /** Ids the player owns, in their stored order. No duplicates. */
  inventory: string[];
  /** The rolled items. Every key is also in `inventory`. */
  instances: Record<string, SavedEquipment>;
  /** What is worn. Every non-null id is in `inventory` and fits its slot. */
  equipped: Record<EquipmentSlot, string | null>;
  /** The rarity an automatic sweep takes at or below. */
  autoDismantleFloor: EquipmentRarity;
}

export interface SavedUniqueGear {
  rank: number;
  /** The roster uid carrying the relic, or null when it sits in the armoury. */
  equippedByUid: string | null;
}

export interface SaveV3 {
  version: typeof SAVE_VERSION;

  /**
   * Monotonic high-water mark of when this save was last live, in ms.
   * Not the same thing as v2's `lastActiveAt` — see `awayClock.ts`.
   */
  awayAtMs: number;

  identity: {
    name: string;
    playerClass: PlayerClass | null;
    created: boolean;
  };

  progression: {
    level: number;
    exp: number;
    totalExp: number;
    wave: number;
    highestWave: number;
    totalKills: number;
    prestigeCount: number;
    rebirthDamagePath: number;
    rebirthEconomyPath: number;
    rebirthSurvivalPath: number;
    metaDamageLevel: number;
    metaEconomyLevel: number;
    metaSurvivalLevel: number;
  };

  stats: {
    alloc: StatBlock;
    unspent: number;
  };

  /** How many of each usable item is held. Claimed out of `legacy` in Phase 10. */
  usables: SavedUsables;

  /**
   * VIP, claimed out of `legacy` in Phase 10 because this is the phase with a
   * shop to spend it in and a claim button to raise it with.
   *
   * Read out of the bag since Phase 8 — the summon discount is priced off it —
   * which is the arrangement `legacy` exists for: read a field on the phase
   * that needs it, claim it on the phase that owns it.
   */
  vip: SavedVip;

  /**
   * Mission goals already collected, claimed out of `legacy` in Phase 11
   * because this is the phase with a board to claim them on.
   */
  missions: { claimedIds: string[] };

  /**
   * The login streak and the week, claimed out of `legacy` in Phase 11.
   *
   * `weeklyEventWeek` has been *read* out of the bag since Phase 8 — it picks
   * which of the eight events multiplies the gold and EXP chains — which is
   * the arrangement `legacy` exists for. This is the phase that can move it.
   */
  calendar: SavedCalendar;

  /**
   * The two dungeons and the tickets that skip them, claimed out of `legacy`
   * in Phase 11. Phase 10's shop has been selling a ticket into the bag since
   * it had nowhere typed to put one.
   */
  dungeons: SavedDungeons;

  /**
   * Expeditions out on contract, claimed out of `legacy` in Phase 11. The
   * wait is enforced here and is not in the shipped game — see
   * `engine/expeditions/contracts.ts`, which is the one place that decision
   * is made.
   */
  expeditions: SavedExpeditions;

  /**
   * The mailbox, claimed out of `legacy` in Phase 11 so a v2 account's
   * unclaimed attachments survive the migration. Its sender is Phase 12's.
   */
  mail: SavedMailbox;

  wallet: {
    gold: number;
    totalGold: number;
    diamonds: number;
    heroShards: number;
    bossTears: number;
    essence: number;
    rebirthCores: number;
    equipmentScrap: number;
    sparkTokens: number;
  };

  /**
   * Summoning, claimed out of `legacy` in Phase 8 because a Summon screen has
   * to show a pity counter and a milestone track, and cannot read either from
   * an untyped bag.
   *
   * `summonHistory` is deliberately **not** claimed. It stores each pull's
   * hero *name and emoji* rather than a template id, and `toLegacyPayload`
   * would have to rebuild those to write the key back — which needs the
   * catalogue, which the engine may not read. It stays in `legacy`, carried
   * verbatim, until something needs it enough to solve that.
   */
  summon: {
    /** Pulls since the last legendary or better. */
    pityCounter: number;
    totalSummons: number;
    /** Pulls that cost nothing. Spent before any currency. */
    freeCharges: number;
    /** Milestone thresholds already collected, in the order they were. */
    claimedMilestones: number[];
    /** A floor promised by a milestone, spent on the next pull either way. */
    guaranteedMinRarity: Rarity | null;
    /** Whether the account's one-off first summon has been handed out. */
    firstGiven: boolean;
  };

  /**
   * The guildhall's four facility levels, claimed out of `legacy` in Phase 10
   * because this is the phase that can raise one.
   *
   * Two of them have been *read* out of the bag since earlier phases — tactics
   * multiplies team power in the health and defence chains, forge multiplies a
   * crafted item's stat budget — which is exactly the arrangement `legacy` is
   * for: read a field on the phase that needs it, claim it on the phase that
   * owns it.
   */
  facilities: Record<FacilityId, number>;

  /**
   * Equipment, claimed out of `legacy` in Phase 9 because `derivedStats` has
   * taken an equipment term as an argument since Phase 7 and nothing could
   * supply it: the stats a player wears cannot be read out of an untyped bag.
   */
  equipment: SaveEquipment;

  roster: {
    heroes: SavedHero[];
    activeUids: string[];
    /** Always three, padded with empties. Saved team presets. */
    loadouts: string[][];
    slotsUnlocked: number;
    formationByUid: Record<string, FormationRole>;
    uniqueByHeroId: Record<string, SavedUniqueGear>;
  };

  /** Every v2 key the typed slice above does not claim, exactly as stored. */
  legacy: Record<string, unknown>;

  /** Which v2 keys the typed slice consumed. Sorted, for a stable snapshot. */
  claimedLegacyKeys: string[];
}

/** The two facts the migration needs about a hero template. */
export interface SaveHeroTemplate {
  /** Decides which formation roles the hero may legally hold. */
  heroClass: PlayerClass;
  /** Authored team boost before rarity; the lower bound on a stored boost. */
  baseTeamBoost: number;
}

/** The five facts the save layer needs about an equipment row. */
export interface SaveEquipmentTemplate {
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  name: string;
  emoji: string;
  description: string;
}

/** What the migration needs to know about content to validate a save against it. */
export interface SaveContent {
  /**
   * Hero templates that still exist. Injected rather than imported so the
   * engine stays free of the catalog, and so a test can migrate a save against
   * a roster of three heroes instead of all sixty-five.
   *
   * A roster row whose template id is absent here is dropped, exactly as the
   * shipped reader drops it — that is the mechanism by which a retired hero
   * leaves old saves, so it has to keep working.
   */
  heroesById: ReadonlyMap<string, SaveHeroTemplate>;
  /**
   * Equipment rows that still exist, for the same reason and with the same
   * consequence: an instance whose base item is absent here is dropped, which
   * is how a retired item leaves old saves.
   */
  equipmentById: ReadonlyMap<string, SaveEquipmentTemplate>;
}
