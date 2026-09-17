import { describe, expect, it } from 'vitest';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById } from '../../content/heroes';
import { readSave } from '../save/v3';
import type { SaveContent, SaveV3 } from '../save/schema';
import fixture from './__fixtures__/prestige.json';
import { FACILITY_IDS, FACILITY_MAX_LEVEL, facilityUpgradeCost } from './facilities';
import {
  REBIRTH_SEASON_POINTS,
  PRESTIGE_PATHS,
  canRebirth,
  essenceUpgradeCost,
  rebirthCoreGain,
  rebirthPathCost,
  rebirthWaveRequirement,
  type PrestigePath,
} from './rebirth';
import {
  previewRebirth,
  priceOfEssenceUpgrade,
  priceOfFacility,
  priceOfRebirthPath,
  rebirth,
  spendEssence,
  spendRebirthCore,
  upgradeFacility,
} from './prestigeSave';

/**
 * Prestige, against the recorded runs.
 *
 * Every number here already reaches the fight and has had no way to move. What
 * the fixture is mostly for is the half a port guesses wrong: what a rebirth
 * does *not* reset.
 */

const CONTENT: SaveContent = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const OPTIONS = { nowMs: Date.UTC(2026, 0, 15, 12, 0, 0), content: CONTENT };

interface Shape {
  prestigeCount?: number;
  highestWave?: number;
  wave?: number;
  level?: number;
  cores?: number;
  essence?: number;
  gold?: number;
  paths?: Partial<Record<PrestigePath, number>>;
  meta?: Partial<Record<PrestigePath, number>>;
  facilities?: Partial<Record<(typeof FACILITY_IDS)[number], number>>;
  legacy?: Record<string, unknown>;
}

function save(shape: Shape = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'Ref', playerClass: 'warrior', created: true },
      progression: {
        level: shape.level ?? 60,
        exp: 500,
        wave: shape.wave ?? 50,
        highestWave: shape.highestWave ?? 400,
        prestigeCount: shape.prestigeCount ?? 0,
        rebirthDamagePath: shape.paths?.damage ?? 0,
        rebirthEconomyPath: shape.paths?.economy ?? 0,
        rebirthSurvivalPath: shape.paths?.survival ?? 0,
        metaDamageLevel: shape.meta?.damage ?? 0,
        metaEconomyLevel: shape.meta?.economy ?? 0,
        metaSurvivalLevel: shape.meta?.survival ?? 0,
      },
      stats: { alloc: { strength: 31, vitality: 0, agility: 0, intelligence: 0, spirit: 0 }, unspent: 7 },
      wallet: {
        gold: shape.gold ?? 9_000_000,
        essence: shape.essence ?? 44,
        rebirthCores: shape.cores ?? 0,
        equipmentScrap: 2_100,
      },
      facilities: { training: 0, treasury: 0, forge: 0, tactics: 0, ...shape.facilities },
      legacy: shape.legacy ?? {},
    },
    OPTIONS,
  );
}

describe('the wall', () => {
  it('matches the shipped requirement at every recorded prestige count', () => {
    for (const recorded of fixture.waveRequirement) {
      expect({ n: recorded.prestigeCount, requirement: rebirthWaveRequirement(recorded.prestigeCount) }).toEqual({
        n: recorded.prestigeCount,
        requirement: recorded.requirement,
      });
    }
  });

  it('ceils, and the ceiling bites on the very first step', () => {
    /*
     * `100 * 1.12` is 112.00000000000001 as a double, so the first wall is
     * **113**, not the 112 the arithmetic promises. A port that accumulated
     * 1.12 a step, or rounded, would put it a wave lower — and a player
     * standing on 112 would be offered a rebirth the shipped game refuses.
     */
    expect(rebirthWaveRequirement(1)).toBe(113);
    expect(rebirthWaveRequirement(1)).toBeGreaterThan(Math.round(100 * 1.12));
    expect(canRebirth(1, 112)).toBe(false);
    expect(canRebirth(1, 113)).toBe(true);
  });

  it('never asks for less than wave one', () => {
    // A negative prestige count is floored rather than trusted, so a
    // hand-edited save cannot make the wall unreachable in the other direction.
    expect(rebirthWaveRequirement(-5)).toBe(REBIRTH_WAVE_THRESHOLD_FOR_ZERO);
  });
});

const REBIRTH_WAVE_THRESHOLD_FOR_ZERO = 100;

describe('what a rebirth pays', () => {
  it('matches every recorded payout', () => {
    for (const recorded of fixture.rebirths) {
      if (recorded.coresGained === null) continue;
      expect({ name: recorded.name, cores: rebirthCoreGain(recorded.prestigeCount, recorded.highestWave) }).toEqual({
        name: recorded.name,
        cores: recorded.coresGained,
      });
    }
  });

  it('is mostly the surplus term', () => {
    /*
     * One core exactly at the wall; twenty-one three hundred waves past it.
     * That is the whole shape of the decision — reset early and often, or push
     * and cash in — and a port that dropped the surplus term would pay one
     * core forever and make pushing pointless.
     */
    expect(rebirthCoreGain(0, 100)).toBe(1);
    expect(rebirthCoreGain(0, 400)).toBeGreaterThan(20);
  });

  it('floors the surplus stride at fifteen', () => {
    // So an early account is not asked for five-wave increments it cannot
    // feel: at prestige zero the wall is 100 and five percent of it is 5.
    expect(rebirthCoreGain(0, 115)).toBe(2);
    expect(rebirthCoreGain(0, 114)).toBe(1);
  });

  it('shows the same figures before the press', () => {
    const preview = previewRebirth(save({ prestigeCount: 0, highestWave: 400 }));
    expect(preview).toEqual({ requirement: 100, surplus: 300, cores: rebirthCoreGain(0, 400), ready: true });
    expect(previewRebirth(save({ highestWave: 99 })).ready).toBe(false);
  });
});

describe('what a rebirth resets', () => {
  const recorded = fixture.rebirths.find(entry => entry.name === 'first-well-past-it')!;

  it('clears the run', () => {
    const after = rebirth(save({ prestigeCount: 0, highestWave: 400 }), CONTENT)!;
    expect({
      level: after.progression.level,
      wave: after.progression.wave,
      exp: after.progression.exp,
      prestige: after.progression.prestigeCount,
    }).toEqual({ level: 1, wave: 1, exp: 0, prestige: 1 });
  });

  it('leaves the account alone', () => {
    /*
     * The half an implementation guesses wrong, and the fixture records every
     * one of these off the shipped reducer. A prestige that cleared the wallet
     * would be a different game; one that cleared the meta levels would delete
     * the thing its own cores are spent on.
     */
    const before = save({ prestigeCount: 0, highestWave: 400, meta: { damage: 6 }, paths: { damage: 3 } });
    const after = rebirth(before, CONTENT)!;
    expect({
      gold: after.wallet.gold,
      essence: after.wallet.essence,
      scrap: after.wallet.equipmentScrap,
      strength: after.stats.alloc.strength,
      metaDamage: after.progression.metaDamageLevel,
      damagePath: after.progression.rebirthDamagePath,
    }).toEqual({
      gold: recorded.kept.gold,
      essence: recorded.kept.essence,
      scrap: recorded.kept.equipmentScrap,
      strength: recorded.kept.strength,
      metaDamage: recorded.kept.metaDamageLevel,
      damagePath: recorded.kept.rebirthDamagePath,
    });
  });

  it('leaves the stat pool exactly where it found it', () => {
    /*
     * Asserted against the save rather than against the fixture's figure, and
     * that distinction cost me a run. The fixture records the shipped state's
     * `unspentStatPoints` verbatim — 7 — while our reader floors the pool at
     * the level entitlement, so the same account reads back with 264. That is
     * the Phase 6 repair working as designed, not a rebirth bug.
     *
     * What a rebirth must not do is *move* it, and that is what this asserts.
     * It is also the sharper claim: the shipped action carries the field
     * through explicitly, which a port could easily drop while resetting the
     * level it was earned at.
     */
    const before = save({ prestigeCount: 0, highestWave: 400 });
    const after = rebirth(before, CONTENT)!;
    expect(after.stats).toEqual(before.stats);
  });

  it('keeps the highest wave, which is what the next wall is measured against', () => {
    // Worth stating: a rebirth does not make the account forget how deep it
    // has been, so the second wall is reachable the moment it is set.
    const after = rebirth(save({ prestigeCount: 0, highestWave: 400 }), CONTENT)!;
    expect(after.progression.highestWave).toBe(400);
    expect(canRebirth(after.progression.prestigeCount, after.progression.highestWave)).toBe(true);
  });

  it('pays two hundred and fifty season points, into the bag they still live in', () => {
    const after = rebirth(save({ highestWave: 400, legacy: { seasonPoints: 40 } }), CONTENT)!;
    expect(after.legacy.seasonPoints).toBe(40 + REBIRTH_SEASON_POINTS);
    // And starts from zero for an account that has none, rather than NaN.
    expect(rebirth(save({ highestWave: 400 }), CONTENT)!.legacy.seasonPoints).toBe(REBIRTH_SEASON_POINTS);
  });

  it('refuses one wave short of the wall', () => {
    expect(rebirth(save({ prestigeCount: 0, highestWave: 99 }), CONTENT)).toBeNull();
    expect(rebirth(save({ prestigeCount: 0, highestWave: 100 }), CONTENT)).not.toBeNull();
  });
});

describe('the rebirth tree', () => {
  it('prices every step as the fixture recorded', () => {
    for (const recorded of fixture.rebirthPathCosts) {
      expect({ level: recorded.level, cost: rebirthPathCost(recorded.level) }).toEqual({
        level: recorded.level,
        cost: recorded.cost,
      });
    }
  });

  it('grows as a square, so a path cannot be bought out in one rebirth', () => {
    expect(rebirthPathCost(0)).toBe(1);
    expect(rebirthPathCost(40)).toBe(233);
  });

  it('charges every path the same, off the level being left', () => {
    for (const path of PRESTIGE_PATHS) {
      const before = save({ cores: 6, paths: { [path]: 4 } });
      expect(priceOfRebirthPath(before, path)).toBe(6);
      const after = spendRebirthCore(before, path)!;
      expect({ path, cores: after.wallet.rebirthCores }).toEqual({ path, cores: 0 });
    }
  });

  it('refuses one core short, and spends nothing', () => {
    for (const path of PRESTIGE_PATHS) {
      const before = save({ cores: 5, paths: { [path]: 4 } });
      expect({ path, refused: spendRebirthCore(before, path) }).toEqual({ path, refused: null });
    }
  });
});

describe('the essence tree', () => {
  it('prices every step as the fixture recorded', () => {
    for (const recorded of fixture.essenceCosts) {
      expect({ level: recorded.level, cost: essenceUpgradeCost(recorded.level) }).toEqual({
        level: recorded.level,
        cost: recorded.cost,
      });
    }
  });

  it('is a square rather than a curve', () => {
    expect(essenceUpgradeCost(0)).toBe(32);
    expect(essenceUpgradeCost(50)).toBe(20 + 51 * 51 * 12);
  });

  it('charges every meta path the same, and refuses one short', () => {
    for (const path of PRESTIGE_PATHS) {
      const cost = essenceUpgradeCost(2);
      const rich = save({ essence: cost, meta: { [path]: 2 } });
      expect(priceOfEssenceUpgrade(rich, path)).toBe(cost);
      expect(spendEssence(rich, path)!.wallet.essence).toBe(0);
      expect({ path, refused: spendEssence(save({ essence: cost - 1, meta: { [path]: 2 } }), path) }).toEqual({
        path,
        refused: null,
      });
    }
  });
});

describe('the guildhall', () => {
  it('prices every facility and level as the fixture recorded', () => {
    for (const recorded of fixture.facilityCosts) {
      const id = recorded.facilityId as (typeof FACILITY_IDS)[number];
      expect({ id, level: recorded.level, cost: facilityUpgradeCost(id, recorded.level) }).toEqual({
        id,
        level: recorded.level,
        cost: recorded.cost,
      });
    }
  });

  it('doubles closed-form past the authored curve', () => {
    /*
     * Six authored steps then `last × 2^n`, computed rather than iterated —
     * the shipped comment says that is to avoid overflowing before
     * `MAX_SAFE_INTEGER`, so a port that multiplied in a loop would agree
     * everywhere except the very deep end.
     */
    expect(facilityUpgradeCost('forge', 5)).toBe(350_000);
    expect(facilityUpgradeCost('forge', 6)).toBe(700_000);
    expect(facilityUpgradeCost('forge', 10)).toBe(350_000 * 2 ** 5);
    /*
     * The cap is the *only* source of `Infinity`, which my first version of
     * this got wrong: 350,000 × 2^894 at level 900 is 9.2e274, a perfectly
     * finite double. The shipped `Number.isFinite(cost) ? cost : Infinity` is
     * therefore a no-op in every case, and is not copied.
     */
    expect(facilityUpgradeCost('forge', FACILITY_MAX_LEVEL)).toBe(Infinity);
    expect(Number.isFinite(facilityUpgradeCost('forge', FACILITY_MAX_LEVEL - 1))).toBe(true);
  });

  it('charges gold and raises the level', () => {
    for (const id of FACILITY_IDS) {
      const cost = facilityUpgradeCost(id, 0);
      const before = save({ gold: cost });
      expect(priceOfFacility(before, id)).toBe(cost);
      const after = upgradeFacility(before, id, cost)!;
      expect({ id, level: after.facilities[id], gold: after.wallet.gold }).toEqual({ id, level: 1, gold: 0 });
    }
  });

  it('refuses one gold short, and refuses at the cap', () => {
    const cost = facilityUpgradeCost('forge', 0);
    expect(upgradeFacility(save({ gold: cost - 1 }), 'forge', cost - 1)).toBeNull();
    expect(upgradeFacility(save({ facilities: { forge: FACILITY_MAX_LEVEL } }), 'forge', 1e18)).toBeNull();
  });

  it('floors the save’s balance at zero when the purse included unbanked gold', () => {
    /*
     * The caller checks against what the player can *see* — the banked balance
     * plus what the run has earned — and only the banked half is on the save.
     * So a purchase a player could afford on screen can exceed `wallet.gold`,
     * and the subtraction is floored rather than allowed to go negative.
     */
    const cost = facilityUpgradeCost('forge', 0);
    const after = upgradeFacility(save({ gold: 10 }), 'forge', cost)!;
    expect(after.facilities.forge).toBe(1);
    expect(after.wallet.gold).toBe(0);
  });
});
