import { describe, expect, it } from 'vitest';
import { CLASS_PROFILES, type PlayerClass } from '../../content/classes';
import fixture from './__fixtures__/hero-damage.json';
import { playerContribution } from './playerDamage';

/**
 * Checked against the recorded `playerBaseDps` from `getDpsBreakdown`, one
 * sample per class. The formula reads the class weights in four places, so a
 * single-class test would pass for a port that had dropped three of them.
 */

const NOTHING = { strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 };

describe('the player as a combatant', () => {
  it.each(fixture.players.map((entry, index) => [index, entry.playerClass, entry.level] as const))(
    'matches the shipped figure for sample %i (%s at level %i)',
    index => {
      const sample = fixture.players[index];
      expect(
        playerContribution({
          playerClass: sample.playerClass as PlayerClass,
          level: sample.level,
          alloc: sample.alloc,
        }),
      ).toBeCloseTo(sample.damage, 9);
    },
  );

  it('covers every class the game has', () => {
    // The guard on the test above: sampling four of five classes would leave
    // one weight unexercised and the suite still green.
    expect(new Set(fixture.players.map(entry => entry.playerClass))).toEqual(
      new Set(Object.keys(CLASS_PROFILES) as PlayerClass[]),
    );
  });

  it('is worth more than a fresh hero, which is why forgetting it mattered', () => {
    /*
     * A level-one warrior with nothing spent deals about 24.6. The weakest
     * recorded hero deals about 9. The player was most of a new account's
     * damage and the rewrite was dealing none of it.
     */
    const fresh = playerContribution({ playerClass: 'warrior', level: 1, alloc: NOTHING });
    const weakestHero = Math.min(...fixture.heroes.map(hero => hero.damage));
    expect(fresh).toBeGreaterThan(weakestHero);
  });

  it('reads a null class as a warrior rather than as nothing', () => {
    // The shipped default, and the reason a save caught mid-character-creation
    // still fights.
    expect(playerContribution({ playerClass: null, level: 1, alloc: NOTHING })).toBe(
      playerContribution({ playerClass: 'warrior', level: 1, alloc: NOTHING }),
    );
  });

  it('pays for every stat the formula uses, and for none it does not', () => {
    /*
     * Vitality is the one spent stat that must *not* move damage — it is the
     * health stat, and a port that summed the whole block would quietly make
     * a tank the best damage build.
     */
    const base = playerContribution({ playerClass: 'mage', level: 20, alloc: NOTHING });
    const moves = (stat: keyof typeof NOTHING) =>
      playerContribution({ playerClass: 'mage', level: 20, alloc: { ...NOTHING, [stat]: 50 } });

    for (const stat of ['strength', 'agility', 'intelligence', 'spirit'] as const) {
      expect(moves(stat), stat).toBeGreaterThan(base);
    }
    expect(moves('vitality')).toBe(base);
  });

  it('weights the same stat differently for different classes', () => {
    /*
     * The four-fold weighting, made visible. A mage and a berserker with the
     * same intelligence do not deal the same magical damage, and a port that
     * applied the class weight once at the end would still get *some*
     * difference — so the check is that the ratio differs from the ratio of
     * their magic weights alone.
     */
    const alloc = { ...NOTHING, intelligence: 100 };
    const mage = playerContribution({ playerClass: 'mage', level: 0, alloc });
    const berserker = playerContribution({ playerClass: 'berserker', level: 0, alloc });
    const weightRatio = CLASS_PROFILES.mage.magicWeight / CLASS_PROFILES.berserker.magicWeight;
    expect(mage / berserker).toBeGreaterThan(weightRatio);
  });

  it('never pays for a negative level', () => {
    // A hostile save's level is already bounded at one by the reader; this is
    // the second line, because a negative level would subtract damage.
    expect(playerContribution({ playerClass: 'warrior', level: -50, alloc: NOTHING })).toBe(
      playerContribution({ playerClass: 'warrior', level: 0, alloc: NOTHING }),
    );
  });
});
