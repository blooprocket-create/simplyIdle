import { equipmentToLegacy } from './equipmentSlice';
import { usablesToLegacy } from './usablesSlice';
import { vipToLegacy } from './vipSlice';
import { calendarToLegacy } from '../progression/calendar';
import { dungeonsToLegacy } from '../dungeons/run';
import { expeditionsToLegacy } from '../expeditions/contracts';
import { mailboxToLegacy } from '../mail/mailbox';
import { facilitiesToLegacy } from './facilitiesSlice';
import { STAT_POINTS_PER_LEVEL, statPointsSpent } from './migrate';
import { LEGACY_SAVE_VERSION, type SaveV3 } from './schema';

/**
 * Writing a `SaveV3` back out as the flat v2 payload the shipped game reads.
 *
 * Needed the moment a save leaves this device. Both apps point at the same
 * Firestore document — `users/{uid}/saveSlots/{slot}` — and the shipped
 * `sanitizeSaveData` reads `heroRoster`, `gold`, `level` and about a hundred
 * more at the top level. Storing a `SaveV3` there would not corrupt the
 * document; it would do something worse and quieter. The shipped reader is
 * total, exactly like this one, so it would read that payload as a *valid save
 * with nothing in it* and hand the player a new account. They would still have
 * their real save, for as long as nobody pressed save over it.
 *
 * So the rewrite writes v2 into the shared slot, and this is where a v3 becomes
 * one. It is only possible because of the decision `schema.ts` records: v3
 * types the slice the engine can act on and carries **everything else
 * verbatim** in `legacy`, with `claimedLegacyKeys` naming exactly what the
 * typed slice took. Spread the bag, then write the claimed keys back over it,
 * and every field is accounted for — the typed ones from the typed slice, the
 * other ninety-odd from the bag that never stopped holding them.
 *
 * `legacyPayload.test.ts` holds this to the law that makes it worth anything:
 * `migrateSave(toLegacyPayload(save))` is `save`, for every shipped fixture.
 */

/**
 * Undo the migration's stat top-up.
 *
 * The migration reads v2's `unspentStatPoints` as a pool held *on top of* the
 * level budget, so the pool it produces is `max(0, B - spent) + stored`. Write
 * that total straight back into `unspentStatPoints` and the next read adds the
 * budget a second time — the same inflation `readStats` exists to avoid, except
 * that here it would happen inside the *shipped* game, where nothing is
 * watching for it.
 *
 * So the top-up is subtracted back out, which is the exact inverse: a player
 * who has spent past their level budget writes their whole pool, and one who
 * has not writes only what they were holding beyond it.
 */
function toLegacyUnspent(save: SaveV3): number {
  const levelBudget = Math.max(0, (save.progression.level - 1) * STAT_POINTS_PER_LEVEL);
  const topUp = Math.max(0, levelBudget - statPointsSpent(save.stats.alloc));
  return Math.max(0, save.stats.unspent - topUp);
}

export function toLegacyPayload(save: SaveV3): Record<string, unknown> {
  return {
    /*
     * The bag first, so a claimed key that somehow survived in it loses to the
     * typed slice rather than overwriting it. The v3 reader strips those, but
     * this function is also handed saves the reader did not produce.
     */
    ...save.legacy,

    saveVersion: LEGACY_SAVE_VERSION,

    playerName: save.identity.name,
    playerClass: save.identity.playerClass,
    characterCreated: save.identity.created,

    level: save.progression.level,
    exp: save.progression.exp,
    totalExp: save.progression.totalExp,
    wave: save.progression.wave,
    // `highestLevelReached` is the pre-v2 spelling and is deliberately not
    // written: the migration reads it only as a fallback, so emitting it would
    // put a second answer in the payload for a reader to choose between.
    highestWaveReached: save.progression.highestWave,
    totalKills: save.progression.totalKills,
    prestigeCount: save.progression.prestigeCount,
    rebirthDamagePath: save.progression.rebirthDamagePath,
    rebirthEconomyPath: save.progression.rebirthEconomyPath,
    rebirthSurvivalPath: save.progression.rebirthSurvivalPath,
    metaDamageLevel: save.progression.metaDamageLevel,
    metaEconomyLevel: save.progression.metaEconomyLevel,
    metaSurvivalLevel: save.progression.metaSurvivalLevel,

    statsAlloc: { ...save.stats.alloc },
    unspentStatPoints: toLegacyUnspent(save),

    gold: save.wallet.gold,
    totalGold: save.wallet.totalGold,
    diamonds: save.wallet.diamonds,
    heroShards: save.wallet.heroShards,
    bossTears: save.wallet.bossTears,
    essence: save.wallet.essence,
    rebirthCores: save.wallet.rebirthCores,
    equipmentScrap: save.wallet.equipmentScrap,
    sparkTokens: save.wallet.sparkTokens,

    heroRoster: save.roster.heroes.map(hero => ({ ...hero })),
    activeTeamHeroIds: [...save.roster.activeUids],
    heroFormationByUid: { ...save.roster.formationByUid },
    /*
     * The relic pair, written with the `equipped` flag as well as the bearer.
     *
     * `equippedByUid: null` on its own does not mean "unequipped" to the
     * shipped reader. It checks `typeof equippedByUid === 'string'` first, and
     * null is not a string, so it falls through to `boundedBoolean(equipped,
     * true)` — and with no flag present that default re-equips the relic.
     *
     * Which is a defect in the shipped game itself, not only in this
     * conversion: its own live state is `{ rank, equippedByUid }` with no flag,
     * so a player who takes a relic off and reloads finds it back on. The flag
     * is a pre-v2 spelling that the writer stopped emitting and the reader
     * never stopped depending on.
     *
     * Emitting it repairs that on the way out rather than reproducing it. A
     * save the rewrite writes now survives a reload in *either* app with the
     * player's choice intact, and the extra key costs nothing — the shipped
     * reader builds a fresh `{ rank, equippedByUid }` from it and drops the
     * rest.
     */
    heroUniqueGearByHeroId: Object.fromEntries(
      Object.entries(save.roster.uniqueByHeroId).map(([heroId, gear]) => [
        heroId,
        { ...gear, equipped: gear.equippedByUid !== null },
      ]),
    ),
    teamLoadouts: save.roster.loadouts.map(loadout => [...loadout]),
    teamSlotsUnlocked: save.roster.slotsUnlocked,

    /*
     * Equipment, back under the four names the shipped state uses.
     *
     * `slot` and `allowedClasses` are absent from each instance on purpose:
     * the shipped sanitiser takes both off the base item and ignores whatever
     * was stored, so writing them would be writing fields nothing reads. `id`
     * *is* written into the body as well as being the key, because the shipped
     * live state carries it there and a record written straight back out with
     * no reload in between would otherwise lose it.
     */
    ...equipmentToLegacy(save.equipment),

    /*
     * The facilities, back to the nested `{ tactics: { level: 3 } }` shape the
     * shipped reader wants. Ours is flat, because a record of one-key records
     * is a shape nothing here needs — and writing the flat one out would read
     * as every facility being level zero.
     */
    guildhallFacilities: facilitiesToLegacy(save.facilities),
    usableItemCounts: usablesToLegacy(save.usables),

    /*
     * VIP, back under its five names. `vipLevel` goes out derived from the
     * points rather than from a stored copy, so a save that arrived with the
     * two disagreeing leaves agreeing — see `vipSlice.ts`.
     */
    ...vipToLegacy(save.vip),

    // The mission goals already collected, back under the v2 name.
    claimedMissionIds: [...save.missions.claimedIds],

    // The streak and the week, back under their six v2 names.
    ...calendarToLegacy(save.calendar),

    // The two dungeons and their shared ticket pool, back under seven names.
    ...dungeonsToLegacy(save.dungeons),

    // Expeditions still out, in the shape the shipped queue holds them.
    ...expeditionsToLegacy(save.expeditions),

    // The mailbox, with every unclaimed attachment exactly as it stood.
    ...mailboxToLegacy(save.mail),

    /*
     * The summon counters, back under the names the shipped state uses.
     *
     * `summonHistory` is not among them, and that is the point of it not being
     * claimed: it is still sitting in `legacy` and comes back out with the
     * spread above, untouched. A key the typed slice does not take is a key
     * that cannot be damaged on the way through.
     */
    gachaPityCounter: save.summon.pityCounter,
    totalSummons: save.summon.totalSummons,
    freeSummonCharges: save.summon.freeCharges,
    claimedSummonMilestones: [...save.summon.claimedMilestones],
    guaranteedMinRarity: save.summon.guaranteedMinRarity,
    firstSummonGiven: save.summon.firstGiven,

    /*
     * The away mark goes back as `lastActiveAt`, which is what the shipped
     * game calls it and reads for offline progress. The two are not the same
     * idea — `awayClock.ts` explains why the rewrite keeps a monotonic
     * high-water mark where the shipped game keeps a last-seen stamp — but on
     * the wire there is one field, and the mark is the honest value to put in
     * it: it is never earlier than the last time the account was live.
     */
    lastActiveAt: save.awayAtMs,
  };
}
