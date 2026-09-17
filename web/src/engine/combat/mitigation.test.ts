import { describe, expect, it } from 'vitest';
import { CLASS_PASSIVES } from '../../content/classPassives';
import type { PlayerClass } from '../../content/classes';
import { getHeroTemplate } from '../../content/heroes';
import type { Rarity } from '../../content/rarities';
import type { HealthHero } from '../character/stats';
import fixture from './__fixtures__/mitigation.json';
import { DEFENSE_REDUCTION_CAP, damageReduction, incomingMultiplier, teamDefense } from './mitigation';
import type { RelicBearer } from './uniqueRelics';

/**
 * Checked against a chain measured off the real combat step, because no other
 * fixture could anchor it: the rest read through `getDpsBreakdown`, which
 * reports damage and not mitigation.
 */

/**
 * The scenario fields the port actually reads, widened.
 *
 * The fixture's rows are a union — a scenario with no relics has no
 * `relicRank` key at all — so spreading one to vary a field produces a shape
 * TypeScript will not put back into `Row`. Naming what these helpers need is
 * both truer and what lets the "multipliers scale it" case below exist.
 */
interface DefenseSpec {
  playerClass: string;
  alloc: { strength: number; vitality: number; agility: number; intelligence: number; spirit: number };
  heroes: { templateId: string; uid: string; level: number; rank: number; rarity: string }[];
  metaSurvivalLevel?: number;
  rebirthSurvivalPath?: number;
  tacticsLevel?: number;
  classPassiveUnlocked?: boolean;
  relicRank?: number;
  damageReductionBuffPct?: number;
}

function healthHeroes(row: DefenseSpec): HealthHero[] {
  return row.heroes.map(hero => ({
    uid: hero.uid,
    heroClass: getHeroTemplate(hero.templateId)!.heroClass,
    rarity: hero.rarity as Rarity,
    level: hero.level,
    rank: hero.rank,
    rebirthStatMult: 1,
  }));
}

function poweredTeam(row: DefenseSpec) {
  return row.heroes.map(hero => {
    const template = getHeroTemplate(hero.templateId)!;
    return { uid: hero.uid, heroClass: template.heroClass, passiveTrait: template.passiveTrait };
  });
}

function relics(row: DefenseSpec): RelicBearer[] {
  if (!row.relicRank) return [];
  return row.heroes.map(hero => {
    const template = getHeroTemplate(hero.templateId)!;
    return {
      heroId: hero.templateId,
      archetype: template.activeSkillArchetype,
      trait: template.passiveTrait,
      rank: row.relicRank!,
      equipped: true,
      bearerActive: true,
    };
  });
}

function defenseOf(row: DefenseSpec): number {
  return teamDefense({
    playerClass: row.playerClass as PlayerClass,
    alloc: row.alloc,
    activeHeroes: healthHeroes(row),
    metaSurvivalLevel: row.metaSurvivalLevel ?? 0,
    rebirthSurvivalPath: row.rebirthSurvivalPath ?? 0,
    tacticsFacilityLevel: row.tacticsLevel ?? 0,
  });
}

function incomingOf(row: DefenseSpec): number {
  return incomingMultiplier({
    defense: defenseOf(row),
    playerClass: row.playerClass as PlayerClass,
    classPassiveUnlocked: row.classPassiveUnlocked === true,
    team: poweredTeam(row),
    relics: relics(row),
    damageReductionBuffPct: row.damageReductionBuffPct ?? 0,
  });
}

describe("the team's defence", () => {
  it.each(fixture.rows.map(row => row.name))('reproduces the shipped figure for %s', name => {
    const row = fixture.rows.find(entry => entry.name === name)!;
    expect(defenseOf(row)).toBeCloseTo(row.teamDefense, 6);
  });

  it('is more than the sum of its heroes, because the multipliers scale it', () => {
    // Meta survival, the rebirth path, formation, synergy and tactics all
    // multiply defence — the same set health takes, minus class mastery.
    const deep = fixture.rows.find(row => row.name === 'deep-survival')!;
    const bare = { ...deep, metaSurvivalLevel: 0, rebirthSurvivalPath: 0, tacticsLevel: 0 };
    expect(defenseOf(deep)).toBeGreaterThan(defenseOf(bare) * 2);
  });
});

describe('what defence removes', () => {
  it.each(fixture.rows.map(row => row.name))('matches the recorded reduction for %s', name => {
    const row = fixture.rows.find(entry => entry.name === name)!;
    expect(damageReduction(row.teamDefense)).toBeCloseTo(row.damageReduction, 9);
  });

  it('caps at four fifths however much defence there is', () => {
    // A port that dropped the cap would make defence the only stat worth
    // having. The deep scenario is already at it; this goes far past.
    expect(damageReduction(1e9)).toBe(DEFENSE_REDUCTION_CAP);
    expect(damageReduction(Number.MAX_VALUE)).toBe(DEFENSE_REDUCTION_CAP);
  });

  it('halves at a hundred, and removes nothing at nothing', () => {
    expect(damageReduction(100)).toBeCloseTo(0.5, 12);
    expect(damageReduction(0)).toBe(0);
  });

  it('never lets negative defence make a monster hit harder', () => {
    // `defense / (defense + 100)` is *negative* below zero, which would read
    // as a reduction above 1 and a multiplier below zero — a monster healing
    // the team. The shipped floor is on the defence, so this mirrors it.
    expect(damageReduction(-50)).toBe(0);
    expect(damageReduction(-500)).toBe(0);
  });
});

describe('the whole chain', () => {
  it.each(fixture.rows.map(row => row.name))('reproduces the measured multiplier for %s', name => {
    const row = fixture.rows.find(entry => entry.name === name)!;
    /*
     * Six decimal places against a figure measured by stepping the real combat
     * loop and dividing a health drop — the same technique the offline fixture
     * uses. Exactness is not available through a float subtraction of two
     * health values; agreement to a millionth is, and is far tighter than the
     * 3% the whole chain spans between scenarios.
     */
    expect(incomingOf(row)).toBeCloseTo(row.incomingMult, 6);
  });

  it('is what the rewrite was not doing', () => {
    /*
     * The headline. Every scenario lands under 1, which is the flat value
     * `demoSimulationOptions` handed the loop — so the port's team was taking
     * up to ten times the damage it should.
     */
    const under = Object.fromEntries(fixture.rows.map(row => [row.name, incomingOf(row) < 1]));
    expect(under).toEqual(Object.fromEntries(fixture.rows.map(row => [row.name, true])));
    expect(Math.min(...fixture.rows.map(incomingOf))).toBeLessThan(0.2);
  });

  it("makes a berserker's own passive hurt them", () => {
    /*
     * The one factor that can go the wrong way. A warrior's passive is 0.85
     * and a berserker's is **1.05**, so unlocking it makes them take more — a
     * port that assumed every passive helps would quietly buff the one class
     * built around not being safe.
     */
    expect(CLASS_PASSIVES.berserker.incomingDamageMultiplier).toBeGreaterThan(1);
    const base = { defense: 100, team: [], relics: [], damageReductionBuffPct: 0 };
    const locked = incomingMultiplier({ ...base, playerClass: 'berserker', classPassiveUnlocked: false });
    const unlocked = incomingMultiplier({ ...base, playerClass: 'berserker', classPassiveUnlocked: true });
    expect(unlocked).toBeGreaterThan(locked);

    const warrior = incomingMultiplier({ ...base, playerClass: 'warrior', classPassiveUnlocked: true });
    expect(warrior).toBeLessThan(locked);
  });

  it('ignores a class passive that has not been unlocked', () => {
    const base = { defense: 100, team: [], relics: [], damageReductionBuffPct: 0 };
    expect(incomingMultiplier({ ...base, playerClass: 'warrior', classPassiveUnlocked: false })).toBe(
      incomingMultiplier({ ...base, playerClass: null, classPassiveUnlocked: true }),
    );
  });

  it('clamps a temporary reduction to seven tenths, both ways', () => {
    const base = { defense: 0, playerClass: null, classPassiveUnlocked: false, team: [], relics: [] };
    // A buff of 1 would make the team invulnerable; the cap stops at 0.7.
    expect(incomingMultiplier({ ...base, damageReductionBuffPct: 1 })).toBeCloseTo(0.3, 12);
    expect(incomingMultiplier({ ...base, damageReductionBuffPct: 0.7 })).toBeCloseTo(0.3, 12);
    // And a negative one does not make the team take more.
    expect(incomingMultiplier({ ...base, damageReductionBuffPct: -2 })).toBeCloseTo(1, 12);
  });
});
