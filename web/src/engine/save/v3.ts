import type { FormationRole } from '../combat/formation';
import { readEquipment } from './equipmentSlice';
import { readUsables } from './usablesSlice';
import { readVip } from './vipSlice';
import { readMissions } from '../progression/missions';
import { readCalendar } from '../progression/calendar';
import { readDungeons } from '../dungeons/run';
import { readExpeditions } from '../expeditions/contracts';
import { readMailbox } from '../mail/mailbox';
import { readFacilityLevels } from './facilitiesSlice';
import { VALID_FORMATION_ROLES_FOR_CLASS } from '../combat/formation';
import {
  ACTIVE_TEAM_SIZE,
  CLAIMED_V2_KEYS,
  migrateSave,
  MAX_PLAYER_NAME_LENGTH,
  MIN_TEAM_SLOTS,
  TEAM_LOADOUT_COUNT,
  UNIQUE_RANK_CAP,
  expForLevel,
  isPlayerClass,
  STAT_POINTS_PER_LEVEL,
  normalizeTeamSelection,
  preferredUniqueBearer,
  readHero,
  readStatBlock,
  readSummonProgress,
  statPointsSpent,
  type MigrateOptions,
} from './migrate';
import {
  MAX_SAVE_COLLECTION,
  MAX_SAVE_PLAYER_LEVEL,
  MAX_SAVE_WAVE,
  SAFE_NUMBER_CAP,
  boundedBoolean,
  boundedInt,
  boundedString,
  boundedStringList,
  isRecord,
} from './guards';
import { SAVE_VERSION, type SaveV3, type SavedHero, type SavedUniqueGear, type StatBlock } from './schema';

/**
 * Reading and writing a v3 save.
 *
 * `migrateSave` reads the shipped v2 shape and is the only reader this rewrite
 * had, which is why `saveStore.ts` shipped without a writer: a `SaveV3` keeps
 * its roster at `roster.heroes` where v2 keeps it at `heroRoster`, so writing
 * one and migrating it back returned an *empty* save. A writer whose output
 * the reader silently empties is worse than no writer, so there was none.
 *
 * This is the reader that pairs with one. Two things about it are deliberate.
 *
 * **It trusts a stored v3 payload exactly as little as the migration trusts a
 * v2 one.** `version: 3` in local storage is a claim by whoever last edited
 * that string, not a fact — and after the Firebase adapter lands it is a claim
 * by whoever last wrote to that document. So every field goes through the same
 * guard the migration uses, and the shared work is *imported* from `migrate.ts`
 * rather than reimplemented: `readHero`, `readStatBlock`,
 * `normalizeTeamSelection` and `preferredUniqueBearer` are the same functions,
 * so "bounds it as hard as the migration does" is a fact about the call graph
 * instead of a claim in a comment. `v3.test.ts` asserts the two agree field by
 * field on a payload built to violate every bound at once.
 *
 * Exactly one rule could not be shared, and it is the interesting one — see
 * `readStats`, where reusing the v2 rule inflates a player's unspent points on
 * every single load.
 *
 * **Reading is idempotent.** `read(write(read(x)))` equals `read(x)` for every
 * input, which is the property that makes a writer safe to ship: whatever the
 * reader decides a save means, writing that meaning back and reading it again
 * cannot change it. It is not free — the two re-derivations below exist
 * precisely to hold it — and it is the first thing `v3.test.ts` checks, over
 * every shipped v2 fixture.
 */

/**
 * Does this payload claim to be v3?
 *
 * Shape *and* marker, unlike the v2 migration, which is shape-driven because
 * the shipped game logs its `saveVersion` and then ignores it. Here the marker
 * is worth something for the one reason it is not on the v2 side: every v3
 * payload in existence was written by `writeSaveV3` below, so a missing `3` is
 * evidence rather than noise. The nested roster is accepted as well so that a
 * payload whose marker was stripped is still read as what it plainly is.
 *
 * Neither signal exists in a v2 save — v2 spells its marker `saveVersion` and
 * keeps its roster flat — so the two readers cannot claim the same payload.
 * `v3.test.ts` asserts that over every shipped fixture rather than trusting it.
 */
export function looksLikeV3(payload: unknown): boolean {
  if (!isRecord(payload)) return false;
  if (payload.version === SAVE_VERSION) return true;
  return isRecord(payload.roster) && Array.isArray(payload.roster.heroes);
}

function readRoster(raw: unknown, content: MigrateOptions['content']): SavedHero[] {
  const rows = isRecord(raw) && Array.isArray(raw.heroes) ? raw.heroes : [];
  const heroes: SavedHero[] = [];
  const uids = new Set<string>();

  for (const [index, entry] of rows.entries()) {
    if (heroes.length >= MAX_SAVE_COLLECTION) break;
    const hero = readHero(entry, index, content);
    if (!hero || uids.has(hero.uid)) continue;
    uids.add(hero.uid);
    heroes.push(hero);
  }

  return heroes;
}

function readFormation(
  raw: unknown,
  heroes: readonly SavedHero[],
  content: MigrateOptions['content'],
): Record<string, FormationRole> {
  const out: Record<string, FormationRole> = {};
  if (!isRecord(raw)) return out;

  for (const [uid, role] of Object.entries(raw)) {
    const hero = heroes.find(candidate => candidate.uid === uid);
    const heroClass = hero && content.heroesById.get(hero.id)?.heroClass;
    if (!heroClass || typeof role !== 'string') continue;
    if (!VALID_FORMATION_ROLES_FOR_CLASS[heroClass].includes(role as FormationRole)) continue;
    out[uid] = role as FormationRole;
  }

  return out;
}

/**
 * Relics, with their bearer re-derived rather than believed.
 *
 * The migration does not trust a stored bearer uid because the copy of the
 * hero carrying the relic may have been recycled since. That reasoning does
 * not weaken on the v3 side: the uid is still a claim, and a hand-edited save
 * naming a hero who is not in the roster would otherwise equip a ghost.
 *
 * What the stored value *is* trusted for is the armoury: `null` means the
 * player took the relic off, and re-deriving a bearer would put it back on.
 * So the null-ness is read and the identity is not, which is also what makes
 * the round trip stable — the migration's own output already carries a
 * re-derived bearer, so reading it again finds the same one.
 */
function readUniqueGear(
  raw: unknown,
  heroes: readonly SavedHero[],
  content: MigrateOptions['content'],
): Record<string, SavedUniqueGear> {
  const out: Record<string, SavedUniqueGear> = {};
  if (!isRecord(raw)) return out;

  for (const [heroId, entry] of Object.entries(raw)) {
    if (!content.heroesById.has(heroId)) continue;
    const record = isRecord(entry) ? entry : {};
    const equipped = record.equippedByUid !== null && record.equippedByUid !== undefined;
    out[heroId] = {
      rank: boundedInt(record.rank, 1, UNIQUE_RANK_CAP, 1),
      equippedByUid: equipped ? (preferredUniqueBearer(heroes, heroId)?.uid ?? null) : null,
    };
  }

  return out;
}

/**
 * Stat points, and the one place the v2 rule could not be reused.
 *
 * `readStatAllocation` treats its `savedUnspent` as a pool held *on top of*
 * the level budget, because that is what v2's `unspentStatPoints` is: a
 * separately stored number the shipped reader adds to whatever the level
 * entitles the player to. A `SaveV3` has already done that sum — `stats.unspent`
 * *is* the pool — so passing it back through the v2 rule adds the level budget
 * a second time.
 *
 * Not a rounding error. A level-100 character reading their own save would
 * gain 495 unspent points, and gain them again on every load, for as long as
 * they kept playing. The round-trip test caught it on the first fixture; no
 * amount of reading the two functions side by side had.
 *
 * So v3 takes the stored pool at face value and floors it at what the level
 * entitles the player to. The floor is a `max` rather than a sum, which is
 * what keeps a second read from changing anything, and it still repairs a save
 * whose pool fell below its level — including the over-allocated accounts the
 * migration deliberately preserves, where the floor is negative and the stored
 * pool simply wins.
 */
function readStats(raw: unknown, level: number): { alloc: StatBlock; unspent: number } {
  const record = isRecord(raw) ? raw : {};
  const alloc = readStatBlock(record.alloc);
  const levelBudget = Math.max(0, (level - 1) * STAT_POINTS_PER_LEVEL);
  const stored = boundedInt(record.unspent, 0, SAFE_NUMBER_CAP, 0);
  return { alloc, unspent: Math.max(stored, Math.max(0, levelBudget - statPointsSpent(alloc))) };
}

/**
 * Read a stored v3 payload of unknown shape into a `SaveV3`.
 *
 * Total, like the migration: any input at all produces a save, because the
 * alternative is a player with a corrupted string losing an account rather
 * than losing a field.
 */
export function readSaveV3(payload: unknown, options: MigrateOptions): SaveV3 {
  const raw = isRecord(payload) ? payload : {};
  const { nowMs, content } = options;

  const identity = isRecord(raw.identity) ? raw.identity : {};
  const progression = isRecord(raw.progression) ? raw.progression : {};
  const wallet = isRecord(raw.wallet) ? raw.wallet : {};
  const stats = isRecord(raw.stats) ? raw.stats : {};
  const roster = isRecord(raw.roster) ? raw.roster : {};
  const summon = isRecord(raw.summon) ? raw.summon : {};

  const name = boundedString(identity.name, '', MAX_PLAYER_NAME_LENGTH);
  const playerClass = isPlayerClass(identity.playerClass) ? identity.playerClass : null;
  const created = boundedBoolean(identity.created, false) && !!name && playerClass !== null;

  const level = boundedInt(progression.level, 1, MAX_SAVE_PLAYER_LEVEL, 1);
  const wave = boundedInt(progression.wave, 1, MAX_SAVE_WAVE, 1);
  const highestWave = Math.max(wave, boundedInt(progression.highestWave, 1, MAX_SAVE_WAVE, 1));

  const heroes = readRoster(roster, content);
  const heroUids = new Set(heroes.map(hero => hero.uid));
  const formationByUid = readFormation(roster.formationByUid, heroes, content);

  const slotsUnlocked = boundedInt(roster.slotsUnlocked, MIN_TEAM_SLOTS, ACTIVE_TEAM_SIZE, MIN_TEAM_SLOTS);
  const selectTeam = (requested: readonly string[]): string[] =>
    normalizeTeamSelection(heroes, formationByUid, content, slotsUnlocked, requested);

  const activeUids = selectTeam(
    boundedStringList(roster.activeUids, ACTIVE_TEAM_SIZE).filter(uid => heroUids.has(uid)),
  );

  const storedLoadouts = Array.isArray(roster.loadouts) ? roster.loadouts.slice(0, TEAM_LOADOUT_COUNT) : [];
  const loadouts: string[][] = [];
  for (let slot = 0; slot < TEAM_LOADOUT_COUNT; slot += 1) {
    loadouts.push(
      selectTeam(boundedStringList(storedLoadouts[slot], ACTIVE_TEAM_SIZE).filter(uid => heroUids.has(uid))),
    );
  }

  const gold = boundedInt(wallet.gold, 0, SAFE_NUMBER_CAP, 0);

  /*
   * The equipment slice, through the same reader the migration uses — which is
   * the whole reason that reader is its own file. The two payloads differ only
   * in where the four fields sit: v2 has them at the top level under the
   * shipped names, a `SaveV3` has them under `equipment`.
   */
  const storedEquipment = isRecord(raw.equipment) ? raw.equipment : {};
  const equipment = readEquipment({
    inventoryItemIds: storedEquipment.inventory,
    equipmentInventory: storedEquipment.instances,
    equippedItems: storedEquipment.equipped,
    autoDismantleRarityFloor: storedEquipment.autoDismantleFloor,
    content,
    level,
  });

  /*
   * `legacy` is every v2 key the typed slice does not claim, and it is kept
   * verbatim on purpose — a dormant account's equipment, mail and guild
   * membership all live in there until a later phase claims them.
   *
   * A claimed key is stripped rather than kept, so the invariant "legacy holds
   * only what nothing above reads" stays true by construction. Without that a
   * hand-edited save could park a second `gold` in legacy, and the day a phase
   * claims a key out of legacy it would find two answers and no rule for which
   * one wins.
   */
  const claimed = new Set(CLAIMED_V2_KEYS);
  const legacy: Record<string, unknown> = {};
  if (isRecord(raw.legacy)) {
    for (const [key, value] of Object.entries(raw.legacy)) {
      if (claimed.has(key)) continue;
      legacy[key] = value;
    }
  }

  return {
    version: SAVE_VERSION,
    /*
     * The high-water mark, which is the one field a v3 save cannot simply
     * restate. It is clamped forward to `nowMs` for the same reason the
     * migration clamps `lastActiveAt` — a stamp in the future is a rolled
     * device clock — and floored at any mark already on record, which is what
     * stops the roll from being worth anything. See `awayClock.ts`.
     */
    awayAtMs: Math.max(options.knownAwayAtMs ?? 0, boundedInt(raw.awayAtMs, 0, nowMs, nowMs)),
    identity: { name, playerClass, created },
    progression: {
      level,
      exp: boundedInt(progression.exp, 0, Math.max(0, expForLevel(level) - 1), 0),
      totalExp: boundedInt(progression.totalExp, 0, SAFE_NUMBER_CAP, 0),
      wave,
      highestWave,
      totalKills: boundedInt(progression.totalKills, 0, SAFE_NUMBER_CAP, 0),
      prestigeCount: boundedInt(progression.prestigeCount, 0, SAFE_NUMBER_CAP, 0),
      rebirthDamagePath: boundedInt(progression.rebirthDamagePath, 0, SAFE_NUMBER_CAP, 0),
      rebirthEconomyPath: boundedInt(progression.rebirthEconomyPath, 0, SAFE_NUMBER_CAP, 0),
      rebirthSurvivalPath: boundedInt(progression.rebirthSurvivalPath, 0, SAFE_NUMBER_CAP, 0),
      metaDamageLevel: boundedInt(progression.metaDamageLevel, 0, SAFE_NUMBER_CAP, 0),
      metaEconomyLevel: boundedInt(progression.metaEconomyLevel, 0, SAFE_NUMBER_CAP, 0),
      metaSurvivalLevel: boundedInt(progression.metaSurvivalLevel, 0, SAFE_NUMBER_CAP, 0),
    },
    stats: readStats(stats, level),
    facilities: readFacilityLevels(raw.facilities),
    usables: readUsables(raw.usables),
    vip: readVip(raw.vip),
    missions: readMissions(raw.missions),
    calendar: readCalendar(raw.calendar),
    dungeons: readDungeons(raw.dungeons),
    expeditions: readExpeditions(raw.expeditions),
    mail: readMailbox(raw.mail),
    equipment,
    wallet: {
      gold,
      totalGold: Math.max(gold, boundedInt(wallet.totalGold, 0, SAFE_NUMBER_CAP, 0)),
      diamonds: boundedInt(wallet.diamonds, 0, SAFE_NUMBER_CAP, 0),
      heroShards: boundedInt(wallet.heroShards, 0, SAFE_NUMBER_CAP, 0),
      bossTears: boundedInt(wallet.bossTears, 0, SAFE_NUMBER_CAP, 0),
      essence: boundedInt(wallet.essence, 0, SAFE_NUMBER_CAP, 0),
      rebirthCores: boundedInt(wallet.rebirthCores, 0, SAFE_NUMBER_CAP, 0),
      equipmentScrap: boundedInt(wallet.equipmentScrap, 0, SAFE_NUMBER_CAP, 0),
      sparkTokens: boundedInt(wallet.sparkTokens, 0, SAFE_NUMBER_CAP, 0),
    },
    summon: readSummonProgress({
      pityCounter: summon.pityCounter,
      totalSummons: summon.totalSummons,
      freeCharges: summon.freeCharges,
      claimedMilestones: summon.claimedMilestones,
      guaranteedMinRarity: summon.guaranteedMinRarity,
      firstGiven: summon.firstGiven,
    }),
    roster: {
      heroes,
      activeUids,
      loadouts,
      slotsUnlocked,
      formationByUid,
      uniqueByHeroId: readUniqueGear(roster.uniqueByHeroId, heroes, content),
    },
    legacy,
    /*
     * Forced rather than read. This records which v2 keys the *reader* claimed
     * into the typed slice above, so it describes the code that produced this
     * object and not the string it came out of. A stored list would let an old
     * save claim keys a newer reader no longer takes.
     */
    claimedLegacyKeys: [...CLAIMED_V2_KEYS].sort(),
  };
}

/**
 * Serialise a save for storage.
 *
 * Thin on purpose: a `SaveV3` is already plain JSON-safe data, and the work of
 * making the round trip safe belongs in the reader, where it also protects
 * against payloads this writer did not produce. Everything a writer could
 * usefully add — dropping fields, rounding, versioning — is something the
 * reader would then have to undo.
 */
export function writeSaveV3(save: SaveV3): string {
  return JSON.stringify(save);
}

/**
 * The reader to call when you do not know which version you are holding.
 *
 * Which is every caller: local storage may hold a save this build wrote, or
 * one the shipped Expo app wrote, or one an account syncs down from Firebase
 * that predates all of it. Picking the reader is this function's job so that
 * no caller has to know there are two.
 */
export function readSave(payload: unknown, options: MigrateOptions): SaveV3 {
  return looksLikeV3(payload) ? readSaveV3(payload, options) : migrateSave(payload, options);
}
