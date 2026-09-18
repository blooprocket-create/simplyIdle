import Decimal from 'break_eternity.js';
import { describe, expect, it } from 'vitest';
import {
  ARCHETYPE_COOLDOWN_MS,
  MENDING_PULSE_MAX_HEAL,
  UNIQUE_SKILL_BY_HERO,
  UNIQUE_SKILL_TYPES,
  uniqueSkillFor,
} from '../../content/heroSkills';
import { getHeroTemplate, HERO_POOL } from '../../content/heroes';
import fixture from './__fixtures__/hero-actives.json';
import { HeroActiveClock } from './HeroActiveClock';
import { applyCastDamage, castEffect, uniqueSkillPower, type CasterView } from './heroActives';

/**
 * Hero actives, against the recorded casts.
 *
 * The fifth unported system, and the one that made Phase 8's mitigation port
 * look 0.8 off. What the fixture is mostly for is the second layer: a hero
 * carrying their own relic casts a *different* skill, not a stronger one.
 */

const ENEMY_MAX = new Decimal(100_000);
const fight = (hp: Decimal = ENEMY_MAX) => ({ enemyHp: hp, enemyMaxHp: ENEMY_MAX });

function casterFor(heroId: string, level: number, relicRank: number | null): CasterView {
  const template = getHeroTemplate(heroId)!;
  const skill = uniqueSkillFor(heroId);
  return {
    level,
    archetype: template.activeSkillArchetype,
    unique: relicRank !== null && skill !== null ? { skill, rank: relicRank } : null,
  };
}

describe('the content table', () => {
  it('carries every hero’s archetype and unique skill, as recorded', () => {
    for (const row of fixture.byHero) {
      const template = getHeroTemplate(row.heroId)!;
      expect({ id: row.heroId, archetype: template.activeSkillArchetype }).toEqual({
        id: row.heroId,
        archetype: row.archetype,
      });
      const skill = uniqueSkillFor(row.heroId);
      expect({ id: row.heroId, skill: skill === null ? null : { ...skill } }).toEqual({
        id: row.heroId,
        skill: row.unique,
      });
    }
  });

  it('covers all sixty-five heroes and all ten skill types', () => {
    expect(Object.keys(UNIQUE_SKILL_BY_HERO)).toHaveLength(HERO_POOL.length);
    const types = new Set(
      Object.values(UNIQUE_SKILL_BY_HERO)
        .map(skill => skill?.type)
        .filter(Boolean),
    );
    expect([...types].sort()).toEqual([...UNIQUE_SKILL_TYPES].sort());
  });

  it('gives each archetype its own cooldown', () => {
    expect(ARCHETYPE_COOLDOWN_MS).toEqual(fixture.archetypeCooldowns);
  });
});

describe('the generic archetypes', () => {
  const recorded = (name: string) => fixture.archetypes.find(entry => entry.name === name)!;

  it('reproduces every recorded archetype cast', () => {
    for (const cast of fixture.archetypes) {
      if (cast.relicRank !== null) continue;
      const { effect, cooldownMs } = castEffect(casterFor(cast.heroId, cast.heroLevel, null), {
        enemyHp: new Decimal(cast.monsterMaxHp),
        enemyMaxHp: new Decimal(cast.monsterMaxHp),
      });
      expect({ name: cast.name, cooldown: cooldownMs }).toEqual({ name: cast.name, cooldown: cast.cooldownMs });
      expect({ name: cast.name, dr: effect.damageReductionPct }).toEqual({
        name: cast.name,
        dr: cast.effect.damageReductionBuffPct,
      });
      expect({ name: cast.name, buff: effect.damageBuffPct }).toEqual({
        name: cast.name,
        buff: cast.effect.damageBuffPct,
      });
      // Damage and healing come back as a share; the recorded run applied them.
      const heal = Math.ceil(cast.teamMaxHp * effect.healFraction);
      expect({ name: cast.name, heal }).toEqual({ name: cast.name, heal: cast.effect.teamHpGained });
    }
  });

  it('is flat at every level but for the healer', () => {
    /*
     * The same at level one and at two hundred, for three of the four. A port
     * that scaled all of them would make every ability grow with the hero —
     * and the one that *does* scale is capped, which is the other half.
     */
    for (const archetype of ['frontline_ward', 'burst_volley', 'battle_chant']) {
      expect({ archetype, same: recorded(archetype).effect }).toEqual({
        archetype,
        same: recorded(`${archetype}-level-200`).effect,
      });
    }
  });

  it('caps the healer at a quarter of the team', () => {
    const deep = castEffect(casterFor(recorded('mending_pulse').heroId, 9_999, null), fight());
    expect(deep.effect.healFraction).toBe(MENDING_PULSE_MAX_HEAL);
    const shallow = castEffect(casterFor(recorded('mending_pulse').heroId, 1, null), fight());
    expect(shallow.effect.healFraction).toBeLessThan(MENDING_PULSE_MAX_HEAL);
  });

  it('takes a share of the enemy’s maximum, not their current health', () => {
    // Which is what makes `burst_volley` a burst: worth the same at full
    // health and at one percent.
    const full = castEffect(casterFor(recorded('burst_volley').heroId, 1, null), fight(ENEMY_MAX));
    const nearly = castEffect(casterFor(recorded('burst_volley').heroId, 1, null), fight(new Decimal(1)));
    expect(full.effect.damage.eq(nearly.effect.damage)).toBe(true);
  });
});

describe('the unique skills', () => {
  it('reproduces every recorded unique cast', () => {
    for (const cast of fixture.uniques) {
      const { effect, cooldownMs } = castEffect(casterFor(cast.heroId, cast.heroLevel, cast.relicRank), {
        enemyHp: new Decimal(cast.monsterMaxHp),
        enemyMaxHp: new Decimal(cast.monsterMaxHp),
      });
      expect({ name: cast.name, cooldown: cooldownMs }).toEqual({ name: cast.name, cooldown: cast.cooldownMs });
      expect({ name: cast.name, damage: effect.damage.toNumber() }).toEqual({
        name: cast.name,
        damage: cast.effect.monsterHpLost,
      });
      expect({ name: cast.name, heal: Math.ceil(cast.teamMaxHp * effect.healFraction) }).toEqual({
        name: cast.name,
        heal: cast.effect.teamHpGained,
      });
      expect({ name: cast.name, buff: effect.damageBuffPct }).toEqual({
        name: cast.name,
        buff: cast.effect.damageBuffPct,
      });
      expect({ name: cast.name, dr: effect.damageReductionPct }).toEqual({
        name: cast.name,
        dr: cast.effect.damageReductionBuffPct,
      });
    }
  });

  it('replaces the archetype skill rather than adding to it', () => {
    /*
     * The thing a port misses: the relic does not strengthen the hero's
     * ability, it *swaps* it — for a different effect, on a different
     * cooldown. A build that treated relics as stats alone would leave this
     * whole table unreachable.
     */
    const off = fixture.archetypes.find(entry => entry.name === 'relic-off')!;
    const on = fixture.archetypes.find(entry => entry.name === 'relic-on')!;
    const withoutRelic = castEffect(casterFor(off.heroId, off.heroLevel, null), fight());
    const withRelic = castEffect(casterFor(on.heroId, on.heroLevel, 1), fight());
    expect(withRelic.effect).not.toEqual(withoutRelic.effect);
  });

  it('scales twelve percent a rank, and leaves the cooldown alone', () => {
    for (const entry of fixture.rankScaling) {
      const skill = uniqueSkillFor(entry.heroId)!;
      expect({ rank: entry.rank, power: uniqueSkillPower(skill, entry.rank) }).toEqual({
        rank: entry.rank,
        power: entry.power,
      });
      expect({ rank: entry.rank, cooldown: skill.cooldownMs }).toEqual({
        rank: entry.rank,
        cooldown: entry.cooldownMs,
      });
    }
  });

  it('reads the enemy’s missing health for an execute, and only there', () => {
    /*
     * The one skill that is backwards from the rest: worth nothing on a full
     * enemy and most on a nearly-dead one. Every other damaging skill takes a
     * share of the maximum, so a port sharing one expression between them
     * would make the execute worthless at exactly the moment it should land.
     */
    const heroId = fixture.uniques.find(entry => entry.kind === 'execute')!.heroId;
    const atFull = castEffect(casterFor(heroId, 50, 1), fight(ENEMY_MAX));
    const nearlyDead = castEffect(casterFor(heroId, 50, 1), fight(new Decimal(1)));
    expect(atFull.effect.damage.toNumber()).toBe(0);
    expect(nearlyDead.effect.damage.gt(0)).toBe(true);
  });

  it('never lets an ability land the kill', () => {
    // Floored at one, not zero, so the team's own swings have to finish it —
    // and with the kill go the gold, the EXP and the wave advance.
    expect(applyCastDamage(new Decimal(1_000), new Decimal(1e9)).toNumber()).toBe(1);
    expect(applyCastDamage(new Decimal(1_000), new Decimal(400)).toNumber()).toBe(600);
  });
});

describe('the clock', () => {
  const ward = fixture.archetypes.find(entry => entry.kind === 'frontline_ward')!.heroId;
  const chant = fixture.archetypes.find(entry => entry.kind === 'battle_chant')!.heroId;
  const team = (heroId: string, uid = 'caster') => [{ uid, caster: casterFor(heroId, 1, null), fielded: true }];

  it('fires on the step a cooldown reaches zero, not the one after', () => {
    /*
     * The order inside `step`: cooldowns come down first, then anybody at zero
     * casts within the same step. A port that fired on the *next* step would
     * leave every ability one tick late forever, which compounds into a
     * visible rate difference over a run.
     */
    const clock = new HeroActiveClock();
    const first = clock.step(100, team(ward), fight());
    expect(first.casts).toHaveLength(1);

    // Ten seconds of cooldown, so nothing at nine.
    expect(clock.step(9_000, team(ward), fight()).casts).toHaveLength(0);
    expect(clock.step(1_000, team(ward), fight()).casts).toHaveLength(1);
  });

  it('expires a buff rather than leaving it up forever', () => {
    /*
     * The whole reason this class exists. `progressionFromSave` and
     * `rosterFromSave` both pass a temporary buff of zero with the same note —
     * "a temporary buff needs a clock to expire by and nothing here ticks one
     * down, so honouring a stored one would make it permanent". This is it.
     */
    const clock = new HeroActiveClock();
    clock.step(10, team(chant), fight());
    expect(clock.damageMultiplier()).toBeCloseTo(1.18, 10);

    // 4,200ms of duration.
    clock.step(4_000, team(chant), fight());
    expect(clock.damageMultiplier()).toBeCloseTo(1.18, 10);
    clock.step(1_000, team(chant), fight());
    expect(clock.damageMultiplier()).toBe(1);
  });

  it('clears a lapsed buff’s magnitude, so a weaker one is not masked by it', () => {
    /*
     * The magnitude has to be cleared with the duration, and the reason is not
     * obvious: `absorb` takes `Math.max` of the old and the new on *both*
     * axes, so a stale 18% left lying around after its timer ran out would win
     * against the next cast's 5% and resurrect itself at full strength.
     *
     * My first version of this asserted the multiplier was 1 after expiry —
     * which it is either way, because the getter already returns 1 when the
     * timer is zero. Deleting the clearing line left it green. It takes a
     * *second, weaker* cast to see the difference.
     */
    const strong = {
      skill: { type: 'rallying_cry' as const, power: 0.5, durationMs: 1_000, cooldownMs: 1_000 },
      rank: 1,
    };
    const weak = {
      skill: { type: 'rallying_cry' as const, power: 0.05, durationMs: 1_000, cooldownMs: 1_000 },
      rank: 1,
    };
    const caster = (unique: typeof strong) => ({ ...casterFor(chant, 1, null), unique });

    const clock = new HeroActiveClock();
    clock.setAutoCast(false);
    clock.cast('a', caster(strong), fight(), true);
    expect(clock.damageMultiplier()).toBeCloseTo(1.5, 10);

    // Let it lapse, then cast the weak one.
    clock.step(2_000, [], fight());
    expect(clock.damageMultiplier()).toBe(1);
    clock.cast('b', caster(weak), fight(), true);
    expect(clock.damageMultiplier()).toBeCloseTo(1.05, 10);
  });

  it('takes the stronger of two buffs rather than adding them', () => {
    /*
     * `Math.max` on both axes, as shipped. A port that added them would make a
     * team of chanters immortal, and a weaker cast landing on a stronger one
     * would cut it short rather than being ignored.
     */
    const clock = new HeroActiveClock();
    clock.step(
      10,
      [
        { uid: 'a', caster: casterFor(chant, 1, null), fielded: true },
        { uid: 'b', caster: casterFor(chant, 1, null), fielded: true },
      ],
      fight(),
    );
    expect(clock.damageMultiplier()).toBeCloseTo(1.18, 10);
  });

  it('does not cast for a benched hero', () => {
    const clock = new HeroActiveClock();
    const benched = [{ uid: 'caster', caster: casterFor(ward, 1, null), fielded: false }];
    expect(clock.step(10, benched, fight()).casts).toHaveLength(0);
    expect(clock.damageReduction()).toBe(0);
  });

  it('holds every ability when auto-cast is off, and still ticks them down', () => {
    /*
     * Auto-cast is **on by default**, as shipped — which is why the mitigation
     * fixture had to switch it off to measure anything at all. Off, the
     * cooldowns still come down, so the abilities sit ready for a press rather
     * than freezing.
     */
    const clock = new HeroActiveClock();
    clock.setAutoCast(false);
    expect(clock.step(10, team(ward), fight()).casts).toHaveLength(0);
    expect(clock.ready('caster')).toBe(true);
  });

  it('refuses a press from a benched hero or one on cooldown', () => {
    const clock = new HeroActiveClock();
    clock.setAutoCast(false);
    const caster = casterFor(ward, 1, null);
    expect(clock.cast('caster', caster, fight(), false)).toBeNull();

    expect(clock.cast('caster', caster, fight(), true)).not.toBeNull();
    // Now on cooldown, and a refusal leaves it exactly where it was.
    const before = clock.remainingMs('caster');
    expect(clock.cast('caster', caster, fight(), true)).toBeNull();
    expect(clock.remainingMs('caster')).toBe(before);
  });

  it('lets each cast in a step see what the ones before it did', () => {
    /*
     * Which is what makes an `execute` in a team of five read a falling health
     * bar rather than the same number five times.
     *
     * It takes an **execute** to see, and that is the correction: my first
     * version used two `burst_volley` casters, which read the enemy's
     * *maximum* health and so give the same answer however the loop threads
     * the current. Feeding both casts the step's opening state left it green.
     */
    const executeHero = fixture.uniques.find(entry => entry.kind === 'execute')!.heroId;
    const executor = () => ({ caster: casterFor(executeHero, 50, 1), fielded: true });
    const clock = new HeroActiveClock();
    const result = clock.step(
      10,
      [
        { uid: 'a', ...executor() },
        { uid: 'b', ...executor() },
      ],
      // Half dead, so the first execute has something to read and the second
      // sees a lower bar than the first did.
      fight(ENEMY_MAX.div(2)),
    );
    expect(result.casts).toHaveLength(2);
    expect(result.casts[1].effect.damage.gt(result.casts[0].effect.damage)).toBe(true);
  });

  it('forgets everything on a reset', () => {
    /*
     * Both halves of both buffs, and every cooldown. Asserting the getters
     * alone is not enough — they already answer "none" while a timer is zero,
     * so a reset that cleared the timer and left the magnitude would look
     * clean until the next weaker cast. The weak cast below is what sees it.
     */
    const clock = new HeroActiveClock();
    clock.setAutoCast(false);
    const strong = {
      ...casterFor(chant, 1, null),
      unique: { skill: { type: 'rallying_cry' as const, power: 0.5, durationMs: 9_000, cooldownMs: 9_000 }, rank: 1 },
    };
    clock.cast('caster', strong, fight(), true);
    expect(clock.damageMultiplier()).toBeCloseTo(1.5, 10);
    expect(clock.ready('caster')).toBe(false);

    clock.reset();
    expect(clock.damageMultiplier()).toBe(1);
    expect(clock.damageReduction()).toBe(0);
    expect(clock.ready('caster')).toBe(true);

    const weak = {
      ...casterFor(chant, 1, null),
      unique: { skill: { type: 'rallying_cry' as const, power: 0.05, durationMs: 9_000, cooldownMs: 9_000 }, rank: 1 },
    };
    clock.cast('caster', weak, fight(), true);
    expect(clock.damageMultiplier()).toBeCloseTo(1.05, 10);
  });
});
