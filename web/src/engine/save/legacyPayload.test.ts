import { describe, expect, it } from 'vitest';
import type { PlayerClass } from '../../content/classes';
import { toLegacyPayload } from './legacyPayload';
import { CLAIMED_V2_KEYS, STAT_POINTS_PER_LEVEL, migrateSave, statPointsSpent } from './migrate';
import { LEGACY_SAVE_VERSION, type SaveContent, type SaveV3 } from './schema';
import { readSaveV3 } from './v3';
import fixture from './__fixtures__/v2-saves.json';

/**
 * The trip back to v2.
 *
 * Both apps point at the same Firestore document, and the shipped reader is
 * total: handed a `SaveV3` it would not fail, it would read a valid save with
 * nothing in it and hand the player a new account. So the rewrite writes v2
 * into the shared slot, and this is what holds that conversion honest.
 *
 * The law below is the whole of it — migrate a v2 payload, write it back,
 * migrate it again, and land on the same save. Anything the conversion drops
 * or double-counts shows up as a difference on the second migration.
 */

/** Mirror of the fixture's encoder. See `saveMigration.test.ts`. */
const SPECIAL_NUMBERS: Record<string, number> = {
  __NaN__: Number.NaN,
  __Infinity__: Number.POSITIVE_INFINITY,
  '__-Infinity__': Number.NEGATIVE_INFINITY,
};

function decodeSpecials(value: unknown): unknown {
  if (typeof value === 'string' && value in SPECIAL_NUMBERS) return SPECIAL_NUMBERS[value];
  if (Array.isArray(value)) return value.map(decodeSpecials);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decodeSpecials(entry)]));
  }
  return value;
}

const CONTENT: SaveContent = {
  heroesById: new Map(
    fixture.heroTemplates.map(template => [
      template.id,
      { heroClass: template.heroClass as PlayerClass, baseTeamBoost: template.baseTeamBoost },
    ]),
  ),
};

const NOW = fixture.nowMs;
const OPTIONS = { nowMs: NOW, content: CONTENT };

function fromV2(name: string): SaveV3 {
  const entry = fixture.cases.find(candidate => candidate.name === name);
  if (!entry) throw new Error(`no fixture case named ${name}`);
  return migrateSave(decodeSpecials(entry.payload), OPTIONS);
}

/** Write it out as v2 and read it back the way the shipped game would. */
function viaLegacy(save: SaveV3): SaveV3 {
  return migrateSave(JSON.parse(JSON.stringify(toLegacyPayload(save))), OPTIONS);
}

describe('writing a v3 save back as v2', () => {
  it('survives the trip out and back for every fixture', () => {
    /*
     * The law. Asserted over the whole fixture set rather than a hand-built
     * save, because the accounts that break it are the ones that were already
     * awkward: the pre-v2 field names, the relic stored as a bare number, the
     * account with more stat points spent than its level allows.
     *
     * Twice, because a conversion that is stable on the first trip and not the
     * second is a leak rather than a bug — and the leak this one nearly had
     * added the level's stat budget on every save.
     */
    for (const entry of fixture.cases) {
      const save = fromV2(entry.name);
      expect(viaLegacy(save), entry.name).toEqual(save);
      expect(viaLegacy(viaLegacy(save)), entry.name).toEqual(save);
    }
  });

  it('accounts for every key the typed slice claimed', () => {
    /*
     * `claimedLegacyKeys` is the list of v2 keys the typed slice took out of
     * the payload. Each one has to come back, or the shipped game reads a save
     * with a hole where a field used to be — and, being total, reads the hole
     * as a default rather than as an error.
     *
     * Two spellings are excused, and only two: `highestLevelReached` is the
     * pre-v2 name for a field that is written under its v2 name, and
     * `saveVersion` is written as the version the shipped game expects rather
     * than echoed.
     */
    const payload = toLegacyPayload(fromV2('veteran'));
    const missing = CLAIMED_V2_KEYS.filter(key => !(key in payload));
    expect(missing).toEqual(['highestLevelReached']);
    expect(payload.saveVersion).toBe(LEGACY_SAVE_VERSION);
  });

  it('carries the whole legacy bag back out', () => {
    // The ninety-odd fields nothing in the rewrite has claimed yet: equipment,
    // mail, guild membership, mission progress. They ride in `legacy` for
    // exactly this moment.
    const veteran = fromV2('veteran');
    const payload = toLegacyPayload(veteran);
    for (const [key, value] of Object.entries(veteran.legacy)) {
      expect({ key, value: payload[key] }).toEqual({ key, value });
    }
  });

  it('does not let the typed slice lose to a stale copy in the bag', () => {
    /*
     * The v3 reader strips a claimed key out of `legacy`, but this function is
     * also handed saves that reader did not produce — one assembled in code,
     * or one from a future phase that claims a field the bag still holds. The
     * typed slice is written last, so it wins.
     */
    const save: SaveV3 = { ...fromV2('veteran'), legacy: { gold: 999_999_999, guildId: 'g1' } };
    const payload = toLegacyPayload(save);
    expect(payload.gold).toBe(save.wallet.gold);
    expect(payload.guildId).toBe('g1');
  });
});

describe('relics on the way out', () => {
  it('says unequipped in the spelling the shipped reader understands', () => {
    /*
     * `equippedByUid: null` does not mean "unequipped" to the shipped reader.
     * It tests for a *string* first and falls through to
     * `boundedBoolean(equipped, true)` when it does not find one — so a null
     * bearer with no flag re-equips the relic.
     *
     * The first thing this test did was fail on the `unique-gear-unequipped-flag`
     * fixture, which is the shipped game's own pre-v2 spelling of exactly this.
     */
    const save = fromV2('unique-gear-unequipped-flag');
    const unequipped = Object.entries(save.roster.uniqueByHeroId).filter(([, gear]) => gear.equippedByUid === null);
    expect(unequipped.length).toBeGreaterThan(0);

    const written = toLegacyPayload(save).heroUniqueGearByHeroId as Record<string, Record<string, unknown>>;
    for (const [heroId] of unequipped)
      expect({ heroId, equipped: written[heroId].equipped }).toEqual({
        heroId,
        equipped: false,
      });

    expect(viaLegacy(save).roster.uniqueByHeroId).toEqual(save.roster.uniqueByHeroId);
  });

  it('records the shipped defect this is repairing', () => {
    /*
     * Stated as a test rather than only as a comment, because it is a claim
     * about code this repo ships and someone will want to check it.
     *
     * The shipped live state is `{ rank, equippedByUid }` with no flag. Write
     * that shape for an unequipped relic and the shipped reader gives it back
     * equipped — so in the shipped game, taking a relic off does not survive a
     * reload. Writing the flag is what stops the rewrite from inheriting it.
     */
    const withoutFlag = migrateSave(
      {
        heroRoster: [{ id: fixture.heroTemplates[0].id, uid: 'a' }],
        heroUniqueGearByHeroId: { [fixture.heroTemplates[0].id]: { rank: 3, equippedByUid: null } },
      },
      OPTIONS,
    );
    expect(withoutFlag.roster.uniqueByHeroId[fixture.heroTemplates[0].id].equippedByUid).toBe('a');
  });
});

describe('stat points on the way out', () => {
  it('writes the pool the shipped reader will top up, not the topped-up pool', () => {
    /*
     * The inflation, in the direction that matters most. The shipped reader
     * treats `unspentStatPoints` as a pool held on top of the level budget and
     * adds the two. Writing the already-summed v3 pool into it means the
     * shipped game hands the player the level budget again on every load —
     * inside an app that has no round-trip test watching for it.
     *
     * So the top-up is subtracted back out, which is the exact inverse of what
     * the migration added.
     */
    const level = 100;
    const save = readSaveV3(
      { version: 3, progression: { level }, stats: { alloc: { strength: 10 }, unspent: 0 } },
      OPTIONS,
    );
    const budget = (level - 1) * STAT_POINTS_PER_LEVEL;
    expect(save.stats.unspent).toBe(budget - 10);

    // Nothing was held beyond the entitlement, so nothing is written.
    expect(toLegacyPayload(save).unspentStatPoints).toBe(0);
    expect(viaLegacy(save).stats.unspent).toBe(save.stats.unspent);
  });

  it('writes the whole pool for an over-allocated account', () => {
    /*
     * The other branch. When a player has spent past their level budget there
     * is no top-up to subtract, so the pool goes out whole — and the shipped
     * reader, which preserves every point ever spent rather than rebalancing,
     * gives it back unchanged.
     */
    const save = fromV2('over-allocated-stats');
    const budget = (save.progression.level - 1) * STAT_POINTS_PER_LEVEL;
    expect(statPointsSpent(save.stats.alloc)).toBeGreaterThan(budget);
    expect(toLegacyPayload(save).unspentStatPoints).toBe(save.stats.unspent);
    expect(viaLegacy(save).stats).toEqual(save.stats);
  });
});

describe('the away mark on the way out', () => {
  it('goes back as the field the shipped game reads for offline progress', () => {
    /*
     * The rewrite keeps a monotonic high-water mark where the shipped game
     * keeps a last-seen stamp — see `awayClock.ts` — but on the wire there is
     * one field. The mark is the honest value for it: never earlier than the
     * last time the account was live, so the shipped game cannot be talked
     * into crediting a window twice by a save the rewrite wrote.
     */
    const save = readSaveV3({ version: 3, awayAtMs: NOW - 60_000 }, OPTIONS);
    expect(toLegacyPayload(save).lastActiveAt).toBe(NOW - 60_000);
    expect(viaLegacy(save).awayAtMs).toBe(NOW - 60_000);
  });
});
