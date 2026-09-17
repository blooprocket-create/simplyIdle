import { describe, expect, it } from 'vitest';
import type { PlayerClass } from '../../content/classes';
import { MAX_SAVE_COLLECTION, SAFE_NUMBER_CAP } from './guards';
import {
  ACTIVE_TEAM_SIZE,
  CLAIMED_V2_KEYS,
  MIN_TEAM_SLOTS,
  STAT_POINTS_PER_LEVEL,
  expForLevel,
  migrateSave,
} from './migrate';
import { PITY_THRESHOLD } from '../roster/summon';
import { SAVE_VERSION, type SaveContent, type SaveV3 } from './schema';
import { looksLikeV3, readSave, readSaveV3, writeSaveV3 } from './v3';
import fixture from './__fixtures__/v2-saves.json';

/**
 * The v3 round trip.
 *
 * `saveMigration.test.ts` protects the v2 side — an account not being emptied
 * by a reader that meets a save written by a build nobody runs any more. This
 * file protects the other direction, which the rewrite created for itself:
 * writing a save whose reader would empty it.
 *
 * That already happened once. `saveStore.ts` shipped a writer, the writer
 * produced a `SaveV3`, and `migrateSave` read `heroRoster` — a v2 key that a
 * `SaveV3` does not have — so the roster came back empty. Nothing called it, so
 * no save was lost; the writer was removed and the failure pinned as a test
 * rather than left as a comment. This is the reader that makes a writer safe,
 * and the property below is why.
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
const [TEMPLATE, SECOND_TEMPLATE] = fixture.heroTemplates;

function fromV2(name: string): SaveV3 {
  const entry = fixture.cases.find(candidate => candidate.name === name);
  if (!entry) throw new Error(`no fixture case named ${name}`);
  return migrateSave(decodeSpecials(entry.payload), OPTIONS);
}

/** Store it and read it back, exactly as `saveStore` will. */
function roundTrip(save: SaveV3): SaveV3 {
  return readSave(JSON.parse(writeSaveV3(save)), OPTIONS);
}

describe('the round trip', () => {
  it('reads back every migrated fixture unchanged', () => {
    /*
     * The property the writer rests on: whatever the reader decides a save
     * means, writing that meaning back and reading it again cannot change it.
     *
     * Asserted over every shipped fixture rather than one hand-built save,
     * because the cases that break idempotence are the awkward ones — the
     * account with a relic on a recycled hero, the one with more stat points
     * spent than its level allows, the one whose wallet is past 2^53. Those
     * are exactly what the fixtures are.
     */
    for (const entry of fixture.cases) {
      const migrated = fromV2(entry.name);
      expect(roundTrip(migrated), entry.name).toEqual(migrated);
      // And again, because a transform that is stable on the second read but
      // not the third would pass a single round trip and still drift in use.
      expect(roundTrip(roundTrip(migrated)), entry.name).toEqual(migrated);
    }
  });

  it('is the thing that was missing, not a second migration', () => {
    /*
     * The failure `saveStore.test.ts` pins. `migrateSave` on a v3 payload
     * returns an empty roster, because it looks for `heroRoster` and a v3 save
     * keeps its heroes at `roster.heroes`. Kept here as well as there so that
     * the two files cannot drift into disagreeing about why the writer waited.
     */
    const migrated = fromV2('veteran');
    expect(migrated.roster.heroes.length).toBeGreaterThan(0);
    expect(migrateSave(JSON.parse(writeSaveV3(migrated)), OPTIONS).roster.heroes).toEqual([]);
    expect(roundTrip(migrated).roster.heroes).toEqual(migrated.roster.heroes);
  });

  it('keeps the legacy bag verbatim across the trip', () => {
    // The whole reason v3 exists: a dormant account's equipment, mail and
    // guild membership ride along untyped until a phase claims them. A round
    // trip that quietly dropped them would lose more than the typed slice ever
    // held.
    const veteran = fromV2('veteran');
    expect(Object.keys(veteran.legacy).length).toBeGreaterThan(0);
    expect(roundTrip(veteran).legacy).toEqual(veteran.legacy);
  });
});

describe('stat points across a load', () => {
  it('does not hand out the level budget again on every read', () => {
    /*
     * The bug the round trip caught, kept as its own case because the round
     * trip states it as "something changed" and this states what.
     *
     * v2 stores `unspentStatPoints` as a pool held *on top of* the level
     * budget, so the migration adds the two. A `SaveV3` has already done that
     * sum. Reading one back through the v2 rule adds the budget a second time,
     * so a level-100 character gains 495 unspent points by loading their own
     * save — and gains them again on the next load, and the next.
     *
     * Three reads rather than two: an inflation that happened once would be a
     * migration, and an inflation that happens every time is a leak.
     */
    const level = 100;
    const save = readSaveV3(
      {
        version: SAVE_VERSION,
        progression: { level },
        stats: { alloc: { strength: 10 }, unspent: 7 },
      },
      OPTIONS,
    );

    const budget = (level - 1) * STAT_POINTS_PER_LEVEL;
    expect(save.stats.unspent).toBe(budget - 10);
    expect(roundTrip(save).stats.unspent).toBe(save.stats.unspent);
    expect(roundTrip(roundTrip(save)).stats.unspent).toBe(save.stats.unspent);
  });

  it('floors a stripped pool at what the level entitles', () => {
    // The repair the floor is there for: a save whose pool was edited away
    // gets it back, because the pool is a consequence of the level.
    const save = readSaveV3(
      { version: SAVE_VERSION, progression: { level: 21 }, stats: { alloc: {}, unspent: 0 } },
      OPTIONS,
    );
    expect(save.stats.unspent).toBe(20 * STAT_POINTS_PER_LEVEL);
  });

  it('keeps an over-allocated account over-allocated', () => {
    /*
     * The shipped rule keeps every point a player ever spent even when their
     * level no longer justifies the total — an account dormant across two
     * balance passes is exactly that case, and a "correct" recompute would
     * confiscate the difference. The floor is a max, not a sum, so it cannot.
     */
    const overAllocated = fromV2('over-allocated-stats');
    expect(roundTrip(overAllocated).stats).toEqual(overAllocated.stats);
  });
});

describe('telling the two versions apart', () => {
  it('never reads a shipped v2 save as v3', () => {
    // v2 spells its marker `saveVersion` and keeps its roster flat, so neither
    // signal can fire on one. Checked against every fixture rather than
    // reasoned about, because being wrong here empties an account.
    for (const entry of fixture.cases) {
      expect({ name: entry.name, v3: looksLikeV3(decodeSpecials(entry.payload)) }).toEqual({
        name: entry.name,
        v3: false,
      });
    }
  });

  it('reads a v3 save as v3 with or without its marker', () => {
    const save = fromV2('veteran');
    expect(looksLikeV3(save)).toBe(true);

    const { version: _dropped, ...unmarked } = save;
    expect(looksLikeV3(unmarked)).toBe(true);
    // And the reader still reaches the same save, so a stripped marker costs
    // nothing. This is the case a hand-edited file most plausibly produces.
    expect(readSave(unmarked, OPTIONS)).toEqual(save);
  });

  it('is not fooled by a v2 payload wearing a version number', () => {
    /*
     * The dangerous direction, and the reason `looksLikeV3` is not just a
     * marker check on its own... except that it is, for this input. A v2
     * payload claiming `version: 3` reads as v3 and loses its flat roster.
     *
     * Pinned as what it is rather than defended against: no build ever wrote
     * that payload, so producing one means editing a save by hand to say
     * something untrue about itself. Reading a hand-edited lie literally is
     * the same rule the rest of this module follows, and the alternative —
     * preferring a flat `heroRoster` over the marker — would make a genuine v3
     * save with a stray legacy key unreadable, which is the failure that
     * actually happens.
     */
    const posing = { version: SAVE_VERSION, heroRoster: [{ id: TEMPLATE.id, uid: 'a' }] };
    expect(readSave(posing, OPTIONS).roster.heroes).toEqual([]);

    // Without the false marker the same payload reads as the v2 save it is.
    const { version: _dropped, ...honest } = posing;
    expect(readSave(honest, OPTIONS).roster.heroes.map(hero => hero.uid)).toEqual(['a']);
  });
});

describe('bounding a stored v3 payload', () => {
  it('bounds every field as hard as the migration bounds its v2 twin', () => {
    /*
     * The claim the module header makes, checked rather than asserted in
     * prose. The two payloads below say the same hostile things in the two
     * shapes — a negative level, a wave past the cap, a name longer than the
     * field, non-finite currency, a hero with a template that no longer
     * exists — and the two readers have to agree on all of it.
     *
     * They agree because they are the same code: `readHero`,
     * `readStatAllocation`, `normalizeTeamSelection` and
     * `preferredUniqueBearer` are imported from `migrate.ts` rather than
     * reimplemented. This test is what keeps that true if someone inlines one
     * of them for convenience.
     */
    const hostile = {
      playerName: 'x'.repeat(200),
      playerClass: 'not-a-class',
      characterCreated: true,
      level: -5,
      exp: Number.MAX_VALUE,
      wave: 9_000_000_000,
      highestWaveReached: -1,
      totalKills: Number.NaN,
      gold: Number.POSITIVE_INFINITY,
      totalGold: -1,
      diamonds: '12',
      statsAlloc: { strength: -4, vitality: 1e30 },
      unspentStatPoints: -3,
      heroRoster: [
        { id: 'no-such-hero', uid: 'ghost' },
        { id: TEMPLATE.id, uid: 'a', level: 1e9, rank: -2 },
      ],
      activeTeamHeroIds: ['ghost', 'a', 'a'],
      teamSlotsUnlocked: 99,
    };

    const asV3 = {
      version: SAVE_VERSION,
      identity: { name: hostile.playerName, playerClass: hostile.playerClass, created: true },
      progression: {
        level: hostile.level,
        exp: hostile.exp,
        wave: hostile.wave,
        highestWave: hostile.highestWaveReached,
        totalKills: hostile.totalKills,
      },
      stats: { alloc: hostile.statsAlloc, unspent: hostile.unspentStatPoints },
      wallet: { gold: hostile.gold, totalGold: hostile.totalGold, diamonds: hostile.diamonds },
      roster: {
        heroes: hostile.heroRoster,
        activeUids: hostile.activeTeamHeroIds,
        slotsUnlocked: hostile.teamSlotsUnlocked,
      },
    };

    const viaV2 = migrateSave(hostile, OPTIONS);
    const viaV3 = readSaveV3(asV3, OPTIONS);

    expect(viaV3.identity).toEqual(viaV2.identity);
    expect(viaV3.progression).toEqual(viaV2.progression);
    expect(viaV3.stats).toEqual(viaV2.stats);
    expect(viaV3.wallet).toEqual(viaV2.wallet);
    expect(viaV3.roster.heroes).toEqual(viaV2.roster.heroes);
    expect(viaV3.roster.activeUids).toEqual(viaV2.roster.activeUids);
    expect(viaV3.roster.slotsUnlocked).toEqual(viaV2.roster.slotsUnlocked);

    // Spot-checks, so a shared bug that agrees with itself cannot pass this.
    expect(viaV3.progression.level).toBe(1);
    expect(viaV3.progression.exp).toBe(expForLevel(1) - 1);
    expect(viaV3.identity.created).toBe(false);
    expect(viaV3.wallet.gold).toBe(0);
    expect(viaV3.roster.heroes.map(hero => hero.uid)).toEqual(['a']);
    expect(viaV3.roster.slotsUnlocked).toBe(ACTIVE_TEAM_SIZE);
  });

  it('is total: anything at all reads as a save', () => {
    // Same contract as the migration. A player whose stored string is garbage
    // loses a field, never an account.
    for (const payload of [null, 42, 'text', [], { version: SAVE_VERSION }]) {
      const save = readSaveV3(payload, OPTIONS);
      expect(save.version).toBe(SAVE_VERSION);
      expect(save.roster.heroes).toEqual([]);
      expect(save.roster.loadouts).toHaveLength(3);
      expect(save.roster.slotsUnlocked).toBe(MIN_TEAM_SLOTS);
    }
  });

  it('caps the roster and keeps the first entries', () => {
    const heroes = Array.from({ length: MAX_SAVE_COLLECTION + 50 }, (_, index) => ({
      id: TEMPLATE.id,
      uid: `u${index}`,
    }));
    const save = readSaveV3({ version: SAVE_VERSION, roster: { heroes } }, OPTIONS);
    expect(save.roster.heroes).toHaveLength(MAX_SAVE_COLLECTION);
    expect(save.roster.heroes[0].uid).toBe('u0');
  });

  it('re-derives a relic bearer and honours an empty armoury slot', () => {
    /*
     * The stored bearer uid is a claim about which copy of the hero is
     * carrying the relic, and that copy may have been recycled. Naming one who
     * is not in the roster has to equip the real preferred bearer, not a ghost
     * — while `null` has to stay null, because that is the player having taken
     * the relic off.
     */
    const roster = {
      heroes: [
        { id: TEMPLATE.id, uid: 'low', rarity: 'common', level: 1 },
        { id: TEMPLATE.id, uid: 'high', rarity: 'legendary', level: 40 },
      ],
      uniqueByHeroId: { [TEMPLATE.id]: { rank: 4, equippedByUid: 'recycled-long-ago' } },
    };
    const equipped = readSaveV3({ version: SAVE_VERSION, roster }, OPTIONS);
    expect(equipped.roster.uniqueByHeroId[TEMPLATE.id]).toEqual({ rank: 4, equippedByUid: 'high' });

    const stored = {
      ...roster,
      uniqueByHeroId: { [TEMPLATE.id]: { rank: 4, equippedByUid: null } },
    };
    expect(readSaveV3({ version: SAVE_VERSION, roster: stored }, OPTIONS).roster.uniqueByHeroId[TEMPLATE.id]).toEqual({
      rank: 4,
      equippedByUid: null,
    });
  });

  it('drops a relic whose hero no longer exists in content', () => {
    // The mechanism by which a retired hero leaves old saves. It has to work
    // on the v3 side too, or a save written today outlives the content it
    // names.
    const save = readSaveV3(
      { version: SAVE_VERSION, roster: { heroes: [], uniqueByHeroId: { 'retired-hero': { rank: 3 } } } },
      OPTIONS,
    );
    expect(save.roster.uniqueByHeroId).toEqual({});
  });

  it('replays a stored team through the selection rules', () => {
    /*
     * A stored team can be illegal in ways that were legal when it was saved —
     * two copies of one template, a hero since recycled, more heroes than the
     * account has slots. The shipped reader keeps the player's priority order
     * and drops what no longer fits, and so does this one, because it calls
     * the same function.
     */
    const save = readSaveV3(
      {
        version: SAVE_VERSION,
        roster: {
          heroes: [
            { id: TEMPLATE.id, uid: 'a' },
            { id: TEMPLATE.id, uid: 'duplicate-template' },
            { id: SECOND_TEMPLATE.id, uid: 'b' },
          ],
          activeUids: ['gone', 'a', 'duplicate-template', 'b'],
          slotsUnlocked: MIN_TEAM_SLOTS,
        },
      },
      OPTIONS,
    );
    expect(save.roster.activeUids).toEqual(['a', 'b']);
  });

  it('strips a claimed key that turns up in the legacy bag', () => {
    /*
     * `legacy` is defined as the keys the typed slice does not claim. A
     * hand-edited save parking a second `gold` in there would give the day a
     * phase claims a key out of legacy two answers and no rule for which wins,
     * so the reader keeps the invariant rather than the payload.
     */
    const save = readSaveV3(
      { version: SAVE_VERSION, wallet: { gold: 10 }, legacy: { gold: 999_999, guildId: 'g1' } },
      OPTIONS,
    );
    expect(save.legacy).toEqual({ guildId: 'g1' });
    expect(save.wallet.gold).toBe(10);
    expect(save.claimedLegacyKeys).toEqual([...CLAIMED_V2_KEYS].sort());
  });

  it('will not let a save claim its own list of claimed keys', () => {
    // The list describes the reader that produced the typed slice, not the
    // string it came from. A stored one would let an old save claim keys a
    // newer reader no longer takes.
    const save = readSaveV3({ version: SAVE_VERSION, claimedLegacyKeys: ['nonsense'] }, OPTIONS);
    expect(save.claimedLegacyKeys).toEqual([...CLAIMED_V2_KEYS].sort());
  });
});

describe('bounding the summon counters', () => {
  /*
   * Claimed out of `legacy` in Phase 8, so they get the same treatment every
   * other typed field does: `version: 3` in local storage is a claim by
   * whoever last edited that string.
   */
  const withSummon = (summon: unknown) => readSaveV3({ version: SAVE_VERSION, summon }, OPTIONS).summon;

  it('reads an absent section as a fresh account rather than as nothing', () => {
    expect(readSaveV3({ version: SAVE_VERSION }, OPTIONS).summon).toEqual({
      pityCounter: 0,
      totalSummons: 0,
      freeCharges: 0,
      claimedMilestones: [],
      guaranteedMinRarity: null,
      firstGiven: false,
    });
  });

  it('caps the pity counter at the threshold rather than at a large number', () => {
    /*
     * The counter resets the moment it would reach the threshold, so a stored
     * value above it is tampering or a bug — and either way the next pull is a
     * free legendary. Clamping keeps that to one pull instead of standing
     * forever, which an uncapped counter would.
     */
    expect(withSummon({ pityCounter: 1e9 }).pityCounter).toBe(PITY_THRESHOLD);
    expect(withSummon({ pityCounter: -4 }).pityCounter).toBe(0);
    expect(withSummon({ pityCounter: 'soon' }).pityCounter).toBe(0);
  });

  it('refuses a guaranteed rarity that is not one', () => {
    // The floor is read against `RARITY_IDS` by rank, so a string that is not
    // a rarity ranks at -1 and would floor every pull to itself.
    expect(withSummon({ guaranteedMinRarity: 'epic' }).guaranteedMinRarity).toBe('epic');
    expect(withSummon({ guaranteedMinRarity: 'ultra' }).guaranteedMinRarity).toBeNull();
    expect(withSummon({ guaranteedMinRarity: 7 }).guaranteedMinRarity).toBeNull();
  });

  it('keeps claimed milestones in the order they were claimed, without repeats', () => {
    // `claimMilestones` only tests membership, so sorting would rewrite the
    // save for no gain — but a repeat would let one threshold be collected
    // twice by a reader that walked the list instead.
    expect(withSummon({ claimedMilestones: [100, 10, 100, 50] }).claimedMilestones).toEqual([100, 10, 50]);
    expect(withSummon({ claimedMilestones: 'all of them' }).claimedMilestones).toEqual([]);
  });

  it('survives the round trip with the counters intact', () => {
    const save = fromV2('mid-gacha');
    expect(save.summon.pityCounter).toBe(17);
    expect(roundTrip(save).summon).toEqual(save.summon);
  });
});

describe('the away mark across a write', () => {
  it('clamps a stamp from the future back to now', () => {
    // A save claiming to have been live tomorrow is a rolled device clock. The
    // migration clamps `lastActiveAt` for the same reason; see `awayClock.ts`.
    const save = readSaveV3({ version: SAVE_VERSION, awayAtMs: NOW + 86_400_000 }, OPTIONS);
    expect(save.awayAtMs).toBe(NOW);
  });

  it('never moves the mark backwards past one already on record', () => {
    // The high-water mark is what makes offline time spendable once. A save
    // that was edited to an earlier stamp cannot buy a second window.
    const save = readSaveV3(
      { version: SAVE_VERSION, awayAtMs: NOW - 86_400_000 },
      { ...OPTIONS, knownAwayAtMs: NOW - 1_000 },
    );
    expect(save.awayAtMs).toBe(NOW - 1_000);
  });

  it('carries an honest mark through the trip unchanged', () => {
    const save = readSaveV3({ version: SAVE_VERSION, awayAtMs: NOW - 60_000 }, OPTIONS);
    expect(save.awayAtMs).toBe(NOW - 60_000);
    expect(roundTrip(save).awayAtMs).toBe(NOW - 60_000);
  });
});

describe('what the writer does not do', () => {
  it('produces text the reader takes, and nothing more', () => {
    /*
     * The writer is one `JSON.stringify` on purpose. Anything it added —
     * dropping fields, rounding, a second version marker — is something the
     * reader would have to undo, and the reader is where the bounding belongs
     * because it also has to survive payloads this writer never produced.
     */
    const save = fromV2('veteran');
    const text = writeSaveV3(save);
    expect(typeof text).toBe('string');
    expect(JSON.parse(text)).toEqual(save);
  });

  it('survives a wallet past 2^53', () => {
    // `SAFE_NUMBER_CAP` is `Number.MAX_VALUE`, ported at its shipped value, so
    // a long-dormant account can hold gold where integer arithmetic has
    // stopped being exact. The round trip must not be the thing that finally
    // rounds it away.
    const huge = 2 ** 60;
    expect(huge).toBeLessThan(SAFE_NUMBER_CAP);
    const save = readSaveV3({ version: SAVE_VERSION, wallet: { gold: huge } }, OPTIONS);
    expect(save.wallet.gold).toBe(huge);
    expect(roundTrip(save).wallet.gold).toBe(huge);
  });
});
