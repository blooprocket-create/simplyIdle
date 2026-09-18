import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/minigames.json';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { WEEKLY_EVENTS } from '../../content/weeklyEvents';
import { MINI_OP_COOLDOWN_MS, bountyTerms, diceReward, eventReachesTarget, isBossWave } from '../../content/miniOps';
import { readSave } from '../save/v3';
import { migrateSave } from '../save/migrate';
import { toLegacyPayload } from '../save/legacyPayload';
import type { SaveV3 } from '../save/schema';
import {
  abandonBounty,
  bountyMet,
  bountyProgress,
  claimBounty,
  cooldownRemainingMs,
  isReady,
  miniOpStandings,
  playDice,
  playLockpick,
  playRecon,
  playTarget,
  readMiniOps,
  startBounty,
  type BountyStanding,
} from './miniOps';

/**
 * The four mini ops and the writ, against what the shipped reducer was
 * measured doing.
 *
 * Every payout below is checked against a number `__tests__/minigamesFixture`
 * recorded from the shipped reducer, so the arithmetic is compared rather than
 * restated — including the ones I predicted wrong and the reducer corrected.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const OPTIONS = { nowMs: NOW, content: CONTENT };

/** The account the fixture measured everything against. */
const WAVE = 50;
const HIGHEST = 120;

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 40, totalKills: 4000, highestWave: HIGHEST },
      wallet: { gold: 0, totalGold: 0, diamonds: 0, heroShards: 0 },
      summon: { totalSummons: 30 },
      ...over,
    },
    OPTIONS,
  );
}

const request = (from: SaveV3, wave = WAVE) => ({ save: from, nowMs: NOW, wave, highestWave: HIGHEST });

const STANDING: BountyStanding = { kills: 4000, wave: WAVE, summons: 30 };

function moved(before: SaveV3, after: SaveV3) {
  return {
    diamonds: after.wallet.diamonds - before.wallet.diamonds,
    shards: after.wallet.heroShards - before.wallet.heroShards,
    gold: after.wallet.gold - before.wallet.gold,
    totalGold: after.wallet.totalGold - before.wallet.totalGold,
  };
}

/** A save with one op's clock set so far back it is ready. */
const ready = () => save();

describe('the cooldown', () => {
  it('is the four hours the fixture bisected, not the day the v2 fields are named for', () => {
    expect(MINI_OP_COOLDOWN_MS).toBe(fixture.cooldownNaming.measuredHours * 3_600_000);
    expect(MINI_OP_COOLDOWN_MS).toBe(fixture.cooldownMs[0].measuredMs);
    // Every op waits the same, measured one op at a time rather than inferred
    // from them sharing a constant.
    expect(new Set(fixture.cooldownMs.map(row => row.measuredMs))).toEqual(new Set([MINI_OP_COOLDOWN_MS]));
  });

  it('opens exactly where the fixture found the boundary, on every gap it probed', () => {
    for (const row of fixture.cooldownWindow) {
      const from = save({ miniOps: { lastUsedMs: { dice: NOW - row.gapMs } } });
      expect({ gapMs: row.gapMs, open: isReady(from, 'dice', NOW) }).toEqual(row);
    }
  });

  it('refuses every op inside it, and charges nothing for the refusal', () => {
    const shut = save({
      miniOps: {
        lastUsedMs: { dice: NOW - 1000, recon: NOW - 1000, lockpick: NOW - 1000, target: NOW - 1000 },
      },
    });
    expect(playDice(request(shut), 20)).toBeNull();
    expect(playRecon(request(shut), 'intel_gold')).toBeNull();
    expect(playLockpick(request(shut), true)).toBeNull();
    expect(playTarget(request(shut), 100, 1)).toBeNull();
  });

  it('reports how long is left, so a surface can draw a clock rather than a dead button', () => {
    const from = save({ miniOps: { lastUsedMs: { dice: NOW - 3_600_000 } } });
    expect(cooldownRemainingMs(from, 'dice', NOW)).toBe(MINI_OP_COOLDOWN_MS - 3_600_000);
    expect(cooldownRemainingMs(save(), 'dice', NOW)).toBe(0);
    expect(miniOpStandings(from, NOW).map(row => row.id)).toEqual(['dice', 'recon', 'lockpick', 'target']);
  });

  it('does not clamp a future stamp at play time, because the clamp cannot change the answer', () => {
    /*
     * The shipped guard does clamp, and deleting that clamp passed every test
     * in the fixture — correctly, because a future stamp gives a negative gap
     * and a negative gap is below a positive cooldown just as a clamped zero
     * is. It is not ported. The load-time clamp below is the one that does
     * work, and it is ported.
     */
    expect(fixture.cooldownNaming.clampCanChangeTheAnswer).toBe(false);
    const future = save({ miniOps: { lastUsedMs: { dice: NOW + 86_400_000 } } });
    expect(isReady(future, 'dice', NOW)).toBe(false);
  });
});

describe('the dice roll', () => {
  it('pays every face what the shipped reducer paid it', () => {
    for (const row of fixture.dice) {
      const before = ready();
      const after = playDice(request(before), row.roll);
      expect({ roll: row.roll, ...moved(before, (after as { save: SaveV3 }).save) }).toEqual({
        roll: row.roll,
        diamonds: row.diamonds,
        shards: row.shards,
        gold: 0,
        totalGold: 0,
      });
    }
  });

  it('is one table rather than two, and it matches the pair the shipped game keeps', () => {
    // The shipped game computes this in the reducer to pay and in the screen
    // to show. They agree today and nothing makes them; here there is one.
    expect(fixture.diceScreenCopy.agrees).toBe(true);
    expect(fixture.dice.map(row => diceReward(row.roll))).toEqual(
      fixture.dice.map(row => ({ diamonds: row.diamonds, shards: row.shards })),
    );
  });

  it('clamps a face out of range rather than refusing it', () => {
    expect(diceReward(0)).toEqual(diceReward(1));
    expect(diceReward(99)).toEqual(diceReward(20));
  });

  it('remembers the last face, which is the only thing the roll leaves behind', () => {
    const rolled = playDice(request(ready()), 17);
    expect((rolled as { save: SaveV3 }).save.miniOps.lastDiceRoll).toBe(17);
  });
});

describe('the recon sweep', () => {
  it('pays each of the four outcomes what the fixture measured', () => {
    for (const row of fixture.recon) {
      const before = ready();
      const outcome = playRecon(request(before), row.outcome as 'intel_gold');
      const after = (outcome as { save: SaveV3 }).save;
      expect({ outcome: row.outcome, ...moved(before, after) }).toEqual({
        outcome: row.outcome,
        gold: row.result.gold,
        totalGold: row.result.totalGold,
        shards: row.result.shards,
        diamonds: 0,
      });
    }
  });

  it('hands the buff back rather than writing it, because the clock owns it', () => {
    /*
     * `damageBuffPct` and `damageBuffMs` live on `HeroActiveClock`, which takes
     * the stronger of the old and the new on each axis. Returning the buff
     * lets the same rule apply to a recon buff as to a cast one, rather than
     * a second place that knows how buffs combine.
     */
    const buffed = playRecon(request(ready()), 'intel_buff');
    expect(buffed?.buff).toEqual({ pct: 0.18, ms: 120_000 });
    expect(playRecon(request(ready()), 'intel_gold')?.buff).toBeNull();
  });

  it('adds every gold it pays to the lifetime total', () => {
    for (const row of fixture.recon) {
      const before = ready();
      const after = (playRecon(request(before), row.outcome as 'ambush') as { save: SaveV3 }).save;
      const change = moved(before, after);
      expect(change.gold).toBe(change.totalGold);
    }
  });
});

describe('the lockpick cache', () => {
  it('pays diamonds when it opens and salvage gold when it jams', () => {
    for (const row of fixture.lockpick) {
      const before = ready();
      const after = (playLockpick(request(before), row.success) as { save: SaveV3 }).save;
      expect({ success: row.success, ...moved(before, after) }).toEqual({
        success: row.success,
        diamonds: row.result.diamonds,
        gold: row.result.gold,
        totalGold: row.result.totalGold,
        shards: 0,
      });
    }
  });

  it('never pays nothing, whichever way the code went', () => {
    for (const cracked of [true, false]) {
      const before = ready();
      const change = moved(before, (playLockpick(request(before), cracked) as { save: SaveV3 }).save);
      expect(change.diamonds + change.gold).toBeGreaterThan(0);
    }
  });
});

describe('target practice', () => {
  it('pays every score and week the fixture measured', () => {
    for (const row of fixture.target) {
      const before = ready();
      const after = (playTarget(request(before), row.score, row.shardMultiplier) as { save: SaveV3 }).save;
      expect({ score: row.score, week: row.weekNumber, ...moved(before, after) }).toEqual({
        score: row.score,
        week: row.weekNumber,
        shards: row.result.shards,
        diamonds: row.result.diamonds,
        gold: 0,
        totalGold: 0,
      });
    }
  });

  it('leaves the diamonds alone when the weekly event doubles the shards', () => {
    const byScore = new Map<number, typeof fixture.target>();
    for (const row of fixture.target) {
      byScore.set(row.score, [...(byScore.get(row.score) ?? []), row]);
    }
    for (const rows of byScore.values()) {
      const [plain, event] = rows;
      expect(event.result.shards).toBeGreaterThan(plain.result.shards);
      expect(event.result.diamonds).toBe(plain.result.diamonds);
    }
  });

  it('can say whether the running event reaches the player at all', () => {
    /*
     * The floor is applied after the multiply, so at wave one six of the eight
     * weeks pay an identical 140 and only the 2x and 2.5x weeks change
     * anything. The surface asks this rather than asserting the event is live,
     * which is the difference between telling a player something true and
     * telling them something encouraging.
     */
    const shallow = WEEKLY_EVENTS.filter(event => eventReachesTarget(1, event.shardMultiplier));
    expect(shallow.map(event => event.shardMultiplier).sort()).toEqual([2, 2.5]);
    // Deep enough and every event above 1x gets through.
    const deep = WEEKLY_EVENTS.filter(event => eventReachesTarget(HIGHEST, event.shardMultiplier));
    expect(deep.every(event => event.shardMultiplier > 1)).toBe(true);
    expect(deep).toHaveLength(WEEKLY_EVENTS.filter(event => event.shardMultiplier > 1).length);
  });
});

describe('what the wave is worth', () => {
  it('pays six times more on a boss wave, as the shipped curve does', () => {
    for (const row of fixture.bossWaveGold) {
      const before = ready();
      const after = (playRecon({ ...request(before, row.wave) }, 'intel_gold') as { save: SaveV3 }).save;
      expect({ wave: row.wave, gold: after.wallet.gold }).toEqual({ wave: row.wave, gold: row.recon });
      expect(isBossWave(row.wave)).toBe(row.isBoss);
    }
  });
});

describe('the bounty writ', () => {
  it('writes the three drafts the fixture measured, at the values it measured', () => {
    for (const row of fixture.bounty) {
      const started = startBounty(request(ready()), row.draftType as 'assault', STANDING);
      expect(started?.bounty).toMatchObject({
        title: row.title,
        metric: row.metric,
        startValue: row.startValue,
        targetValue: row.targetValue,
        reward: { gold: row.rewardGold, shards: row.rewardShards, diamonds: row.rewardDiamonds },
      });
    }
  });

  it('floors the assault target for a shallow account and scales it for a deep one', () => {
    for (const row of fixture.assaultTargets) {
      expect({ wave: row.wave, delta: bountyTerms('assault', row.wave, HIGHEST).targetDelta }).toEqual(row);
    }
  });

  it('refuses a second writ while one stands, and refuses inside the cooldown', () => {
    const held = startBounty(request(ready()), 'push', STANDING) as { save: SaveV3 };
    // The cooldown cleared, so only the live-writ guard can refuse — which is
    // the correction the fixture needed after an injection sailed through it.
    const open = {
      ...held.save,
      miniOps: { ...held.save.miniOps, lastUsedMs: { ...held.save.miniOps.lastUsedMs, bounty: null } },
    };
    expect(startBounty(request(open), 'assault', STANDING)).toBeNull();

    const cooling = save({ miniOps: { lastUsedMs: { bounty: NOW - 1000 } } });
    expect(startBounty(request(cooling), 'assault', STANDING)).toBeNull();
  });

  it('pays nothing until the metric reaches the target, then pays all three', () => {
    const held = startBounty(request(ready()), 'push', STANDING) as { save: SaveV3; bounty: { targetValue: number } };
    const target = held.bounty.targetValue;

    const short: BountyStanding = { ...STANDING, wave: target - 1 };
    expect(bountyMet(held.bounty as never, short)).toBe(false);
    expect(claimBounty(request(held.save), short)).toBeNull();

    const met: BountyStanding = { ...STANDING, wave: target };
    const paid = claimBounty(request(held.save), met);
    const change = moved(held.save, (paid as { save: SaveV3 }).save);
    expect(change.gold).toBeGreaterThan(0);
    expect(change.shards).toBeGreaterThan(0);
    expect(change.diamonds).toBeGreaterThan(0);
    expect(change.gold).toBe(change.totalGold);
  });

  it('clears the writ on payout, because there is no claimed flag to set', () => {
    const held = startBounty(request(ready()), 'push', STANDING) as { save: SaveV3; bounty: { targetValue: number } };
    const paid = claimBounty(request(held.save), { ...STANDING, wave: held.bounty.targetValue });
    expect((paid as { save: SaveV3 }).save.miniOps.bounty).toBeNull();
    // The shipped flag exists at both ends of its life and is never written.
    expect(fixture.claimedFlag.everSetTrue).toBe(false);
  });

  it('reports progress, so the writ is a bar rather than a surprise', () => {
    const held = startBounty(request(ready()), 'push', STANDING) as { save: SaveV3; bounty: never };
    const writ = held.save.miniOps.bounty as NonNullable<SaveV3['miniOps']['bounty']>;
    expect(bountyProgress(writ, STANDING)).toBe(0);
    expect(bountyProgress(writ, { ...STANDING, wave: writ.startValue + 4 })).toBe(0.5);
    expect(bountyProgress(writ, { ...STANDING, wave: writ.targetValue })).toBe(1);
    // Past the target is still one, not more.
    expect(bountyProgress(writ, { ...STANDING, wave: writ.targetValue + 100 })).toBe(1);
  });

  it('can be abandoned, so a wrong pick is not a four-hour wall', () => {
    /*
     * A deliberate addition rather than a port. The shipped game has no way to
     * drop a writ: accept a Frontline Push at wave 199 and die, and it sits
     * there unclaimable while the cooldown it already spent ticks away. The
     * cooldown is *not* refunded here — abandoning costs the press, it just
     * does not cost the next four hours as well.
     */
    const held = startBounty(request(ready()), 'push', STANDING) as { save: SaveV3 };
    const dropped = abandonBounty(held.save);
    expect(dropped.miniOps.bounty).toBeNull();
    expect(dropped.miniOps.lastUsedMs.bounty).toBe(NOW);
    expect(abandonBounty(save())).toEqual(save());
  });
});

describe('the save slice', () => {
  it('reads the five v2 stamps, the face and the writ out of a legacy payload', () => {
    const migrated = migrateSave(
      {
        saveVersion: 2,
        playerName: 'V',
        playerClass: 'warrior',
        characterCreated: true,
        lastDiceRollDay: NOW - 3_600_000,
        lastDiceRollValue: 17,
        lastReconSweepDay: NOW - 7_200_000,
        miniBounty: {
          id: 'bounty_1',
          title: 'Frontline Push',
          metric: 'wave',
          startValue: 10,
          targetValue: 18,
          rewardGold: 1234,
          rewardShards: 56,
          rewardDiamonds: 7,
          claimed: false,
        },
      },
      OPTIONS,
    );
    expect(migrated.miniOps.lastUsedMs.dice).toBe(NOW - 3_600_000);
    expect(migrated.miniOps.lastUsedMs.recon).toBe(NOW - 7_200_000);
    expect(migrated.miniOps.lastUsedMs.lockpick).toBeNull();
    expect(migrated.miniOps.lastDiceRoll).toBe(17);
    expect(migrated.miniOps.bounty).toMatchObject({
      metric: 'wave',
      startValue: 10,
      targetValue: 18,
      reward: { gold: 1234, shards: 56, diamonds: 7 },
    });
  });

  it('migrates a stamp still written as a day number, which is where the names came from', () => {
    /*
     * A save old enough to predate the millisecond format holds a day number,
     * and the shipped loader multiplies it up. Dropping that migration turns a
     * legitimate stamp into a moment in 1970 — which reads as "ready", so the
     * bug is a free press rather than a crash.
     */
    const dayNumber = Math.floor((NOW - 30 * 86_400_000) / 86_400_000);
    const migrated = migrateSave(
      { saveVersion: 2, playerName: 'V', playerClass: 'warrior', lastDiceRollDay: dayNumber },
      OPTIONS,
    );
    expect(migrated.miniOps.lastUsedMs.dice).toBe(dayNumber * 86_400_000);
  });

  it('clamps a stamp from the future into the past, which is the guard that does work', () => {
    const migrated = migrateSave(
      { saveVersion: 2, playerName: 'V', playerClass: 'warrior', lastDiceRollDay: NOW + 86_400_000 },
      OPTIONS,
    );
    expect(migrated.miniOps.lastUsedMs.dice).toBe(NOW);
  });

  it('recovers which draft a writ was from its metric, which v2 does not store', () => {
    /*
     * The shipped `miniBounty` has an id, a title, a metric and the rewards,
     * and no draft. The three writs take one metric each and no two share one,
     * so the metric determines the draft exactly — which is what keeps a round
     * trip through the v2 keys from turning every writ into an assault.
     */
    const drafts = ['assault', 'push', 'recruit'] as const;
    for (const draft of drafts) {
      const held = startBounty(request(ready()), draft, STANDING) as { save: SaveV3 };
      const back = readMiniOps(toLegacyPayload(held.save), NOW, true);
      expect({ draft, read: back.bounty?.draft }).toEqual({ draft, read: draft });
    }
    // One metric each, which is the property the recovery rests on.
    expect(new Set(drafts.map(draft => bountyTerms(draft, WAVE, HIGHEST).metric)).size).toBe(drafts.length);
  });

  it('survives a round trip back out to the seven v2 keys', () => {
    const held = startBounty(request(ready()), 'push', STANDING) as { save: SaveV3 };
    const rolled = playDice(request(held.save), 19) as { save: SaveV3 };
    const legacy = toLegacyPayload(rolled.save);

    expect(legacy.lastDiceRollValue).toBe(19);
    expect(legacy.lastDiceRollDay).toBe(NOW);
    expect(legacy.miniBounty).toMatchObject({ metric: 'wave', claimed: false });

    const back = readMiniOps(legacy, NOW, true);
    expect(back).toEqual(rolled.save.miniOps);
  });

  it('starts an account with every op ready and no writ', () => {
    const fresh = save();
    expect(fresh.miniOps.bounty).toBeNull();
    expect(fresh.miniOps.lastDiceRoll).toBeNull();
    expect(miniOpStandings(fresh, NOW).every(row => row.readyInMs === 0)).toBe(true);
  });
});
