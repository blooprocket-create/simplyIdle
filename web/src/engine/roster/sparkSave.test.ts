import { describe, expect, it } from 'vitest';
import { HERO_POOL, heroTemplatesById } from '../../content/heroes';
import { equipmentTemplatesById } from '../../content/equipment';
import { SPARK_EXCHANGE_OPTIONS } from '../../content/summon';
import { readSave } from '../save/v3';
import type { SaveV3 } from '../save/schema';
import fixture from './__fixtures__/team-management.json';
import { applySparkExchange } from './sparkSave';
import type { SummonPoolEntry } from './summonSave';

/**
 * The spark exchange, applied to a save, against the recorded exchanges.
 *
 * `team.test.ts` covers the purse rule and `content/summon.test.ts` the rows;
 * everything a player can *see* is here — which hero arrives, at what rarity,
 * how many values it cost to decide, and what it does and does not move.
 *
 * The draw count is asserted exactly on every case, because the order is the
 * contract: the recorded run's `randomDraws` is two for an untargeted exchange
 * and one for a targeted one, and a port that drew a pick it discarded would
 * agree on the hero and disagree on every value after it.
 */

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const OPTIONS = { nowMs: NOW, content: { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() } };

const POOL: SummonPoolEntry[] = HERO_POOL.map(hero => ({
  id: hero.id,
  tier: hero.tier,
  baseTeamBoost: hero.baseTeamBoost,
}));

/** The same LCG the fixture's generator scripts `Math.random` with. */
function scriptedRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

/** A fixed list of draws, repeating the last one once exhausted. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

const SPARK_SEED = 20_260_115;

function emptySave(): SaveV3 {
  return readSave({ version: 3 }, OPTIONS);
}

function sparkSave(sparkTokens: number, over: Partial<SaveV3['roster']> = {}): SaveV3 {
  const save = emptySave();
  return {
    ...save,
    wallet: { ...save.wallet, sparkTokens },
    roster: { ...save.roster, ...over },
  };
}

/** A roster row, in the shape the recorded runs seed one. */
function owned(id: string, uid: string, over: Partial<SaveV3['roster']['heroes'][number]> = {}) {
  const template = HERO_POOL.find(entry => entry.id === id)!;
  return {
    id,
    uid,
    rarity: 'common' as const,
    level: 1,
    rank: 1,
    teamBoost: template.baseTeamBoost,
    rebirthStatMult: 1,
    ...over,
  };
}

type Recorded = (typeof fixture.sparkExchanges)[number];

const recorded = (name: string): Recorded => fixture.sparkExchanges.find(entry => entry.name === name)!;

/** Run one recorded case through the port, counting what it drew. */
function replay(entry: Recorded, save: SaveV3) {
  const source = scriptedRandom(SPARK_SEED);
  let drawn = 0;
  const outcome = applySparkExchange({
    save,
    pool: POOL,
    options: SPARK_EXCHANGE_OPTIONS,
    optionId: entry.optionId,
    ...(entry.targetHeroId ? { targetHeroId: entry.targetHeroId } : {}),
    random: () => {
      drawn += 1;
      return source();
    },
    nowMs: NOW,
  });
  return { outcome, drawn };
}

describe('against the recorded exchanges', () => {
  const plain = ['rare-untargeted', 'epic-untargeted', 'legendary-untargeted', 'mythic-untargeted', 'transcendent'];

  it('hands over the same hero, at the same rarity, from the same seed', () => {
    for (const name of plain) {
      const entry = recorded(name);
      const { outcome } = replay(entry, sparkSave(entry.sparkBefore));
      expect({ name, id: outcome?.hero?.id, rarity: outcome?.hero?.rarity }).toEqual({
        name,
        id: entry.hero!.id,
        rarity: entry.hero!.rarity,
      });
    }
  });

  it('draws exactly what the recorded exchange drew', () => {
    for (const name of [...plain, 'rare-targeted', 'free-charge']) {
      const entry = recorded(name);
      const { drawn } = replay(entry, sparkSave(entry.sparkBefore));
      expect({ name, drawn }).toEqual({ name, drawn: entry.randomDraws });
    }
  });

  it('builds the same uid, in the spark namespace', () => {
    // Not cosmetic: the uid is the roster key and both apps read each other's
    // saves, so a hero whose uid differs is a hero the other app cannot match
    // to a formation slot or a relic.
    const entry = recorded('rare-targeted');
    const { outcome } = replay(entry, sparkSave(entry.sparkBefore));
    expect(outcome?.hero?.uid).toBe(entry.hero!.uid);
  });

  it('scales the team boost for the rarity that was bought', () => {
    for (const name of plain) {
      const entry = recorded(name);
      const { outcome } = replay(entry, sparkSave(entry.sparkBefore));
      expect({ name, boost: outcome?.hero?.teamBoost }).toEqual({ name, boost: entry.hero!.teamBoost });
    }
  });

  it('spends exactly the option’s cost and leaves the rest', () => {
    for (const name of plain) {
      const entry = recorded(name);
      const { outcome } = replay(entry, sparkSave(entry.sparkBefore + 7));
      expect({ name, left: outcome?.save.wallet.sparkTokens }).toEqual({ name, left: 7 });
    }
  });
});

describe('a free charge is not a summon', () => {
  it('grants a charge, draws nothing, and moves no summon counter', () => {
    /*
     * The single most likely thing for a port to get wrong, because routing
     * this through `applySummon` would look like reuse. It would advance the
     * pity counter, count towards the milestone track, hand over a hero and
     * draw three or four values — none of which the shipped action does.
     */
    const entry = recorded('free-charge');
    const before = sparkSave(entry.sparkBefore);
    const { outcome, drawn } = replay(entry, before);
    expect(drawn).toBe(0);
    expect(outcome?.hero).toBeNull();
    expect(outcome?.freeChargesGained).toBe(1);
    expect(outcome?.save.summon).toEqual({
      ...before.summon,
      freeCharges: before.summon.freeCharges + 1,
    });
    expect(outcome?.save.roster.heroes).toEqual(before.roster.heroes);
  });

  it('leaves the one-off first summon unclaimed', () => {
    /*
     * `firstGiven` records that the account's opening free hero has been
     * handed out. Buying a charge is not that — setting it here would cost a
     * new player the pull the flag exists to guarantee them.
     */
    const entry = recorded('free-charge');
    const { outcome } = replay(entry, sparkSave(entry.sparkBefore));
    expect(outcome?.save.summon.firstGiven).toBe(false);
  });
});

describe('what it refuses', () => {
  it('refuses an unknown option without drawing', () => {
    const entry = recorded('unknown-option');
    const { outcome, drawn } = replay(entry, sparkSave(entry.sparkBefore));
    expect(outcome).toBeNull();
    expect(drawn).toBe(0);
  });

  it('refuses one spark short, without drawing', () => {
    // The refusal is *before* the dice, so a player who cannot afford an
    // exchange has not silently advanced the sequence their next pull reads.
    const entry = recorded('free-charge-one-short');
    const { outcome, drawn } = replay(entry, sparkSave(entry.sparkBefore));
    expect(outcome).toBeNull();
    expect(drawn).toBe(0);
  });

  it('refuses rather than charging when nobody is eligible', () => {
    // A transcendent exchange against a pool of tier-one heroes. Charging for
    // a hero that cannot be picked is the failure mode worth naming.
    const outcome = applySparkExchange({
      save: sparkSave(100_000),
      pool: POOL.filter(entry => entry.tier === 1),
      options: SPARK_EXCHANGE_OPTIONS,
      optionId: 'spark_transcendent_t4t5',
      random: sequence(0.5),
      nowMs: NOW,
    });
    expect(outcome).toBeNull();
  });
});

describe('the pick', () => {
  it('skips the draw when the player names a hero', () => {
    /*
     * One value rather than two, and the value that is *not* drawn is the
     * first — so the uid of a targeted exchange is built from what would have
     * been the pick. A port that drew the pick anyway and threw it away would
     * hand over the same hero with a different uid.
     */
    const targeted = recorded('rare-targeted');
    const { outcome, drawn } = replay(targeted, sparkSave(targeted.sparkBefore));
    expect(drawn).toBe(1);
    expect(outcome?.hero?.id).toBe(targeted.targetHeroId);

    const untargeted = recorded('rare-untargeted');
    expect(replay(untargeted, sparkSave(untargeted.sparkBefore)).drawn).toBe(2);
  });

  it('falls back to the band for a target the pool does not hold', () => {
    /*
     * The shipped expression is `HERO_POOL.find(...) ?? null`, and the pick
     * runs on the null — so asking for a retired hero buys a random one at the
     * option's rarity rather than refunding the spark. It also means the draw
     * count goes back to two, which is the observable half of it.
     */
    const save = sparkSave(150);
    let drawn = 0;
    const outcome = applySparkExchange({
      save,
      pool: POOL,
      options: SPARK_EXCHANGE_OPTIONS,
      optionId: 'spark_rare',
      targetHeroId: 'no-such-hero',
      random: () => {
        drawn += 1;
        return 0.5;
      },
      nowMs: NOW,
    });
    expect(drawn).toBe(2);
    expect(outcome?.hero).not.toBeNull();
    expect(outcome?.save.wallet.sparkTokens).toBe(0);
  });

  it('draws a transcendent pick from tiers four and five only', () => {
    /*
     * Swept across the unit interval rather than sampled from seeds. The first
     * version drew forty scripted seeds and only ever saw tier four — not a
     * fault in the pick, but a fact about that generator's first output for
     * small seeds, which is exactly the kind of thing that makes a range test
     * quietly test half a range. Sweeping proves both ends of the slice.
     */
    const tiers = new Set<number>();
    for (let step = 0; step < 40; step += 1) {
      const outcome = applySparkExchange({
        save: sparkSave(75_000),
        pool: POOL,
        options: SPARK_EXCHANGE_OPTIONS,
        optionId: 'spark_transcendent_t4t5',
        random: sequence(step / 40),
        nowMs: NOW,
      });
      const template = POOL.find(entry => entry.id === outcome!.hero!.id)!;
      tiers.add(template.tier);
      expect(outcome?.hero?.rarity).toBe('transcendent');
    }
    expect([...tiers].sort()).toEqual([4, 5]);
  });

  it('clamps the rarity to the picked hero’s tier', () => {
    /*
     * Against a pool built to force it, because **the shipped catalogue never
     * does** — `spark_mythic` draws from tiers 3-4, which reach godly and
     * transcendent, so no option can out-ask its band. The fixture records
     * that as a fact about the catalogue; this is the only way to prove the
     * clamp is in the path at all, and deleting it from the source leaves
     * every other test in this file green.
     *
     * Retiered rather than filtered, and that distinction cost me a run: a
     * pool of only the tier-one heroes is twenty long, and the mythic band is
     * `pool.slice(40, 60)`, so the pick came back empty and the exchange
     * refused instead of clamping. The band is an *index* range, so the pool
     * has to keep its length.
     */
    const allTierOne = POOL.map(entry => ({ ...entry, tier: 1 }));
    const outcome = applySparkExchange({
      save: sparkSave(5_000),
      pool: allTierOne,
      options: SPARK_EXCHANGE_OPTIONS,
      optionId: 'spark_mythic',
      random: sequence(0.5),
      nowMs: NOW,
    });
    // A tier-one hero tops out at legendary, so 5,000 spark buys one of those.
    expect(outcome?.askedRarity).toBe('mythic');
    expect(outcome?.rarity).toBe('legendary');
    expect(outcome?.hero?.rarity).toBe('legendary');
  });

  it('refuses when the rarity’s band falls off the end of a short pool', () => {
    /*
     * The bands are index ranges into the catalogue, so a pool shorter than
     * the band has nobody in it. Refused rather than charged, and worth its
     * own test because the shipped `pickHeroForRarity` returns `undefined`
     * here and builds a hero out of it — a purchase that debits the spark and
     * hands over a row with no id.
     */
    const outcome = applySparkExchange({
      save: sparkSave(5_000),
      pool: POOL.slice(0, 20),
      options: SPARK_EXCHANGE_OPTIONS,
      optionId: 'spark_mythic',
      random: sequence(0.5),
      nowMs: NOW,
    });
    expect(outcome).toBeNull();
  });
});

describe('the roster it writes back', () => {
  it('puts the new hero at the front', () => {
    /*
     * Not cosmetic: `readRoster` keeps the first five hundred rows, so an
     * account at the cap loses its *oldest* hero to a purchase rather than
     * having the purchase refused. Two rows already there, so the front and
     * the back are different places.
     */
    const entry = recorded('rare-targeted');
    const save = sparkSave(entry.sparkBefore, {
      heroes: [owned('h2', 'first'), owned('h3', 'second')],
    });
    const { outcome } = replay(entry, save);
    expect(outcome?.save.roster.heroes.map(hero => hero.uid)).toEqual([outcome!.hero!.uid, 'first', 'second']);
  });

  it('pays no spark back for a duplicate', () => {
    /*
     * A duplicate *pull* pays `SPARK_TOKEN_BY_RARITY[rarity]`; that is where
     * spark comes from. A duplicate bought here pays nothing, which is what
     * stops the exchange from partly refunding itself. Reported, so a screen
     * can say "you already had one", and not acted on.
     */
    const entry = recorded('rare-targeted-duplicate');
    const save = sparkSave(entry.sparkBefore, { heroes: [owned(entry.targetHeroId!, 'owned')] });
    const { outcome } = replay(entry, save);
    expect(outcome?.duplicate).toBe(true);
    expect(outcome?.save.wallet.sparkTokens).toBe(0);
  });

  it('re-points a relic at the better copy that just arrived', () => {
    /*
     * The exchange never *drops* a relic — a pull does, on a six percent
     * chance — so this is the only relic work it does, and it is easy to drop
     * on the grounds that there is no relic step. The held copy is common and
     * the arriving one is rare, and rarity is the first term in the preference
     * order.
     */
    const entry = recorded('rare-targeted-relic-moves');
    const save = sparkSave(entry.sparkBefore, {
      heroes: [owned(entry.targetHeroId!, 'owned')],
      uniqueByHeroId: { [entry.targetHeroId!]: { rank: 3, equippedByUid: 'owned' } },
    });
    const { outcome } = replay(entry, save);
    expect(outcome?.save.roster.uniqueByHeroId[entry.targetHeroId!]).toEqual({
      rank: 3,
      equippedByUid: outcome!.hero!.uid,
    });
    expect(outcome?.save.roster.uniqueByHeroId[entry.targetHeroId!].equippedByUid).toBe(entry.relicBearerAfter);
  });

  it('leaves a relic alone when the arriving copy is not better', () => {
    // The held copy is legendary against the rare one that arrives, so the
    // relic stays where the player left it. Without this the test above is
    // satisfied by a build that re-points on every purchase.
    const save = sparkSave(150, {
      heroes: [owned('h1', 'owned', { rarity: 'legendary' })],
      uniqueByHeroId: { h1: { rank: 3, equippedByUid: 'owned' } },
    });
    const outcome = applySparkExchange({
      save,
      pool: POOL,
      options: SPARK_EXCHANGE_OPTIONS,
      optionId: 'spark_rare',
      targetHeroId: 'h1',
      random: sequence(0.5),
      nowMs: NOW,
    });
    expect(outcome?.save.roster.uniqueByHeroId.h1.equippedByUid).toBe('owned');
  });

  it('gives the new hero a uid nobody holds, even on the same draw', () => {
    // Not shipped. The shipped format collides for two purchases in the same
    // millisecond on the same value, and a duplicate uid is not cosmetic —
    // `readRoster` drops the second row, so the player pays and receives
    // nothing.
    let save = sparkSave(150 * 12);
    const uids = new Set<string>();
    for (let index = 0; index < 12; index += 1) {
      const outcome = applySparkExchange({
        save,
        pool: POOL,
        options: SPARK_EXCHANGE_OPTIONS,
        optionId: 'spark_rare',
        targetHeroId: 'h1',
        random: sequence(0.5),
        nowMs: NOW,
      })!;
      uids.add(outcome.hero!.uid);
      save = outcome.save;
    }
    expect(uids.size).toBe(12);
    expect(readSave(save, OPTIONS).roster.heroes).toHaveLength(12);
  });

  it('touches nothing else in the save', () => {
    /*
     * The wallet's other currencies, the progression, the team and the
     * loadouts. An exchange spends spark and adds a row; a port that rebuilt
     * the save rather than spreading it would quietly reset whatever it forgot
     * to carry, and the symptom would be a screen elsewhere going blank.
     */
    const entry = recorded('rare-targeted');
    const before = sparkSave(entry.sparkBefore, { heroes: [owned('h2', 'first')], activeUids: ['first'] });
    const { outcome } = replay(entry, before);
    expect(outcome?.save).toEqual({
      ...before,
      wallet: { ...before.wallet, sparkTokens: 0 },
      roster: { ...before.roster, heroes: [outcome!.hero!, ...before.roster.heroes] },
    });
  });
});
