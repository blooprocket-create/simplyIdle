import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/kill-rewards.json';
import { WEEKLY_EVENTS } from '../../content/weeklyEvents';
import { killReward } from './rewards';
import { masteryEconomyMultiplier, MASTERY_ECONOMY_CAP, rewardRatesFrom, type EconomyState } from './rewardRates';

/**
 * The gold and EXP chains, against every row the fixture measured off the
 * shipped reducer.
 */

/** The wave every `chain` row was measured at, and the week it was pinned to. */
const PLAIN_WAVE = 7;

const BARE: EconomyState = {
  prestigeCount: 0,
  achievementCount: 0,
  metaEconomyLevel: 0,
  rebirthEconomyPath: 0,
  classMasteryXp: 0,
  vipLevel: 0,
  trainingFacilityLevel: 0,
  treasuryFacilityLevel: 0,
  weeklyEventWeek: fixture.constants.pinnedWeek,
};

/** What one kill at the fixture's wave pays under these account settings. */
function paid(over: Partial<EconomyState> = {}) {
  const rates = rewardRatesFrom({ team: [], relics: [], economy: { ...BARE, ...over } });
  const purse = killReward(PLAIN_WAVE, rates);
  return { gold: purse.gold.toNumber(), exp: purse.exp.toNumber() };
}

/** The fixture row by name. */
const row = (name: string) => fixture.chain.find(entry => entry.name === name)!;

describe('the gold and EXP chains', () => {
  it('reproduces the measured baseline', () => {
    // No account bonuses at all — and still not 1x, because the pinned week
    // pays 1.05x gold. There is no un-evented kill.
    expect(paid()).toEqual({ gold: row('baseline').gold, exp: row('baseline').exp });
  });

  it('reproduces every factor that reaches gold alone', () => {
    const cases: [string, Partial<EconomyState>][] = [
      ['prestige', { prestigeCount: 3 }],
      ['meta economy', { metaEconomyLevel: 5 }],
      ['rebirth economy', { rebirthEconomyPath: 4 }],
      ['treasury', { treasuryFacilityLevel: 6 }],
    ];
    expect(cases.map(([name, over]) => [name, paid(over)])).toEqual(
      cases.map(([name]) => [name, { gold: row(name).gold, exp: row(name).exp }]),
    );
  });

  it('reproduces the factor that reaches EXP alone', () => {
    expect(paid({ trainingFacilityLevel: 6 })).toEqual({
      gold: row('training').gold,
      exp: row('training').exp,
    });
  });

  it('reproduces the factors that reach both', () => {
    const cases: [string, Partial<EconomyState>][] = [
      ['vip', { vipLevel: 5 }],
      ['mastery', { classMasteryXp: 2_000 }],
      ['mastery at cap', { classMasteryXp: 12_500 }],
      ['mastery past cap', { classMasteryXp: 2_000_000 }],
    ];
    expect(cases.map(([name, over]) => [name, paid(over)])).toEqual(
      cases.map(([name]) => [name, { gold: row(name).gold, exp: row(name).exp }]),
    );
  });

  it('reproduces all eight weekly events', () => {
    /*
     * The whole table, both columns. This is the row that would catch a port
     * carrying one event multiplier: `double_gold_week` and
     * `hero_experience_surge` pay opposite ways round.
     */
    const weekly = WEEKLY_EVENTS.map((event, week) => [event.id, paid({ weeklyEventWeek: week })]);
    expect(weekly).toEqual(
      WEEKLY_EVENTS.map(event => {
        const measured = row(`weekly: ${event.id}`);
        return [event.id, { gold: measured.gold, exp: measured.exp }];
      }),
    );
  });

  it('reproduces every measured row at once', () => {
    /*
     * The bound on the reassociation claim in `rewardRatesFrom`. The product
     * here runs the affix at the monster rather than fourth in the chain, so
     * it is not the shipped *sequence* — and float multiplication is not
     * associative. Every row anyone has measured agrees; this is the assertion
     * that says so as one statement rather than five.
     */
    const named: Record<string, Partial<EconomyState>> = {
      baseline: {},
      prestige: { prestigeCount: 3 },
      'meta economy': { metaEconomyLevel: 5 },
      'rebirth economy': { rebirthEconomyPath: 4 },
      treasury: { treasuryFacilityLevel: 6 },
      training: { trainingFacilityLevel: 6 },
      vip: { vipLevel: 5 },
      mastery: { classMasteryXp: 2_000 },
      'mastery at cap': { classMasteryXp: 12_500 },
      'mastery past cap': { classMasteryXp: 2_000_000 },
    };
    const ours = Object.entries(named).map(([name, over]) => [name, paid(over).gold, paid(over).exp]);
    expect(ours).toEqual(Object.keys(named).map(name => [name, row(name).gold, row(name).exp]));
  });
});

describe('the mastery economy bonus', () => {
  it('steps every five levels and stops at a quarter', () => {
    // Level 125 is the first to reach the ceiling; nothing past it pays more.
    expect(masteryEconomyMultiplier(12_500)).toBeCloseTo(1 + MASTERY_ECONOMY_CAP, 12);
    expect(masteryEconomyMultiplier(2_000_000)).toBe(masteryEconomyMultiplier(12_500));
    expect(masteryEconomyMultiplier(12_400)).toBeLessThan(masteryEconomyMultiplier(12_500));
  });

  it('holds flat within a step', () => {
    // Levels 20 to 24 are all worth four percent; 25 is the next step.
    expect(masteryEconomyMultiplier(2_000)).toBe(masteryEconomyMultiplier(2_400));
    expect(masteryEconomyMultiplier(2_500)).toBeGreaterThan(masteryEconomyMultiplier(2_400));
  });

  it('is a quarter at most, where damage is two fifths', () => {
    // Not the same cap as the damage side, which is the trap in sharing a name.
    expect(MASTERY_ECONOMY_CAP).toBe(0.25);
  });
});
