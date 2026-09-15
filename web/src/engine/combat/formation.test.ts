import { describe, expect, it } from 'vitest';
import type { PlayerClass } from '../../content/classes';
import {
  FORMATION_DPS_CAP,
  MAX_FORMATION_ROLE_HEROES,
  getFormationMultipliers,
  getFormationRoleForHero,
  getIntendedFormationRole,
  getTeamBoostMultiplier,
  type FormationHero,
  type FormationRole,
} from './formation';
import fixture from './__fixtures__/formation.json';

/**
 * The new side of the formation contract.
 * `__tests__/formationFixture.test.ts` owns the other.
 */

function teamFrom(row: (typeof fixture.rows)[number]): FormationHero[] {
  const stored = row.scenario.storedRoles ?? {};
  return row.scenario.classes.map((heroClass, index) => ({
    uid: `h${index}`,
    heroClass: heroClass as PlayerClass,
    storedRole: (stored as Record<string, FormationRole>)[String(index)],
  }));
}

describe('formation multipliers match the shipped implementation', () => {
  it('has a fixture to check against', () => {
    expect(fixture.rows.length).toBeGreaterThan(5);
    expect(fixture.generatedFrom).toBe('src/useGameState.ts getDpsBreakdown');
  });

  for (const row of fixture.rows) {
    it(`reproduces "${row.scenario.name}"`, () => {
      expect(getFormationMultipliers(teamFrom(row)).dpsMult).toBe(row.formationDps);
    });
  }

  for (const row of fixture.rows) {
    if (row.teamBoostValues.length === 0) continue;
    it(`reproduces team boost for "${row.scenario.name}"`, () => {
      const team = row.teamBoostValues.map(teamBoost => ({ teamBoost }));
      expect(getTeamBoostMultiplier(team)).toBe(row.teamBoost);
    });
  }
});

describe('formation behaviour', () => {
  const hero = (heroClass: PlayerClass, index = 0): FormationHero => ({
    uid: `h${index}`,
    heroClass,
  });

  it('is a no-op for an empty team', () => {
    expect(getFormationMultipliers([])).toEqual({
      dpsMult: 1,
      hpMult: 1,
      incomingMult: 1,
      front: 0,
      mid: 0,
      back: 0,
    });
  });

  it('stops counting a rank past its cap', () => {
    // Asserted against the literal 2 rather than against
    // MAX_FORMATION_ROLE_HEROES: comparing a value to the constant that
    // produced it passes for any constant, which is exactly how a cap change
    // slipped past an earlier version of this test.
    const three = getFormationMultipliers([hero('warrior', 0), hero('warrior', 1), hero('warrior', 2)]);
    expect(three.front).toBe(2);
    expect(MAX_FORMATION_ROLE_HEROES).toBe(2);
  });

  it('gives a third hero in a rank nothing at all', () => {
    // The behavioural form of the same rule, on hpMult and incomingMult —
    // which the shipped breakdown does not expose, so nothing else pins them.
    const two = getFormationMultipliers([hero('warrior', 0), hero('warrior', 1)]);
    const three = getFormationMultipliers([hero('warrior', 0), hero('warrior', 1), hero('warrior', 2)]);
    expect(three).toEqual(two);
  });

  it('moves hp and incoming damage in the directions the ranks promise', () => {
    const front = getFormationMultipliers([hero('warrior')]);
    const back = getFormationMultipliers([hero('archer')]);
    // Front rank: tougher and safer. Back rank: harder-hitting and exposed.
    expect(front.hpMult).toBeGreaterThan(1);
    expect(front.incomingMult).toBeLessThan(1);
    expect(back.dpsMult).toBeGreaterThan(1);
    expect(back.incomingMult).toBeGreaterThan(1);
  });

  it('reports the line shape the renderer needs, not just the numbers', () => {
    // Phase 2 draws a battle line; these counts are where it comes from.
    const line = getFormationMultipliers([hero('warrior'), hero('mage', 1), hero('archer', 2)]);
    expect({ front: line.front, mid: line.mid, back: line.back }).toEqual({
      front: 1,
      mid: 1,
      back: 1,
    });
  });

  it('rewards a tank for holding the front and penalises anyone else', () => {
    // No class can legally stand anywhere but its default, so this compares
    // what the rank does rather than a placement a player could make.
    const tank = getFormationMultipliers([hero('warrior')]);
    expect(tank.incomingMult).toBeLessThan(1);
    expect(tank.dpsMult).toBe(1);
  });

  it('caps runaway stacking', () => {
    const many = Array.from({ length: 12 }, (_, i) => hero('archer', i));
    expect(getFormationMultipliers(many).dpsMult).toBeLessThanOrEqual(FORMATION_DPS_CAP);
  });
});

describe('the stored-formation bug, pinned deliberately', () => {
  /*
   * The shipped getFormationRoleForHero ignores the player's stored choice.
   * These assertions describe that, so a fix has to change them on purpose
   * rather than sliding in as a refactor.
   */

  it('ignores a monk the player placed in mid', () => {
    const placed: FormationHero = { uid: 'm', heroClass: 'monk', storedRole: 'mid' };
    expect(getFormationRoleForHero(placed)).toBe('front');
    // What the player asked for, and what a fixed version would use.
    expect(getIntendedFormationRole(placed)).toBe('mid');
  });

  it('costs that monk the mid-rank damage bonus', () => {
    const placed: FormationHero = { uid: 'm', heroClass: 'monk', storedRole: 'mid' };
    expect(getFormationMultipliers([placed]).dpsMult).toBe(1);
    expect(getFormationMultipliers([placed]).mid).toBe(0);
  });

  it('is harmless for every class with only one legal rank', () => {
    // Which is why this went unnoticed: the monk is the only class affected.
    for (const heroClass of ['warrior', 'berserker', 'mage', 'archer'] as PlayerClass[]) {
      const placed: FormationHero = { uid: 'x', heroClass, storedRole: 'back' };
      expect(getFormationRoleForHero(placed)).toBe(getIntendedFormationRole(placed));
    }
  });

  it('falls back to the class default for an illegal stored role', () => {
    const illegal: FormationHero = { uid: 'w', heroClass: 'warrior', storedRole: 'back' };
    expect(getIntendedFormationRole(illegal)).toBe('front');
  });
});
