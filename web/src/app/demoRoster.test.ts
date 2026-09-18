import { describe, expect, it } from 'vitest';
import { heroTemplatesById } from '../content/heroes';
import { equipmentTemplatesById } from '../content/equipment';
import { VALID_FORMATION_ROLES_FOR_CLASS, type FormationRole } from '../engine/combat/formation';
import { ACTIVE_TEAM_SIZE } from '../engine/save/migrate';
import { readSave, writeSaveV3 } from '../engine/save/v3';
import { startingSave } from './demoRoster';
import { uniqueSkillFor } from '../content/heroSkills';
import { fightTuningKey, PLAYER_UID, rosterFromSave } from './roster';

/**
 * The three shapes, from the one save. `App` composes these itself — there is
 * no `startingRoster` any more, because a save and a reader is the whole of it.
 */
const startingRoster = (nowMs: number) => rosterFromSave(startingSave(nowMs, fixedRandom()));

/** A fixed source, so a starter set's rolled stats are the same every run. */
const fixedRandom = () => {
  let value = 20_260_115 >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x100000000;
  };
};

/**
 * The starting save.
 *
 * This file had no tests while it was four hand-written things bolted
 * together, which is most of why they disagreed. Each case below is one of the
 * disagreements, pinned so it cannot come back.
 */

const NOW = 1_700_000_000_000;
const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };

describe('the team a new player starts on', () => {
  it('fields all six, which the old formation could not', () => {
    /*
     * The one that mattered. Picking one hero of each class gives three whose
     * intended rank is `front`, plus a spare that was usually a fourth — and a
     * rank holds two, so the shipped selection rules fielded **four**. The
     * cast path does not check, so the diorama drew six people standing
     * somewhere the game says they cannot stand.
     */
    const save = startingSave(NOW, fixedRandom());
    expect(save.roster.heroes).toHaveLength(ACTIVE_TEAM_SIZE);
    expect(save.roster.activeUids).toHaveLength(ACTIVE_TEAM_SIZE);

    const roster = startingRoster(NOW);
    expect(roster.profile.roster.filter(hero => hero.active)).toHaveLength(ACTIVE_TEAM_SIZE);
    /*
     * Seven, not six. `ACTIVE_TEAM_SIZE` is six heroes "(+ player)" in the
     * shipped comment, and the player is now a combatant in their own right
     * rather than a multiplier — so they get an entity and a figure like
     * anyone else fighting.
     */
    expect(roster.cast).toHaveLength(ACTIVE_TEAM_SIZE + 1);
    expect(roster.heroes).toHaveLength(ACTIVE_TEAM_SIZE + 1);
    expect(roster.cast.map(member => member.uid)).toContain(PLAYER_UID);
  });

  it('stands two in each rank, and never asks a class to stand where it cannot', () => {
    const roster = startingRoster(NOW);
    const byRole: Record<FormationRole, number> = { front: 0, mid: 0, back: 0 };
    for (const hero of roster.profile.roster) {
      byRole[hero.role] += 1;
      expect(VALID_FORMATION_ROLES_FOR_CLASS[hero.heroClass], hero.uid).toContain(hero.role);
    }
    expect(byRole).toEqual({ front: 2, mid: 2, back: 2 });
  });

  it('draws them where the rules put them', () => {
    // The cast is the diorama's view and the profile is the surfaces'. They
    // are built from the same rows precisely so this holds — for the heroes.
    // The player is not a roster row, so they are checked separately below.
    const roster = startingRoster(NOW);
    const roleByUid = new Map(roster.profile.roster.map(hero => [hero.uid, hero.role]));
    for (const member of roster.cast) {
      if (member.uid === PLAYER_UID) continue;
      expect(roleByUid.get(member.uid), member.uid).toBe(member.role);
    }
  });

  it('puts the player where their class may stand', () => {
    // A warrior at the front. They are not a roster row and have no stored
    // formation, so the class's own rule is the only answer.
    const player = startingRoster(NOW).cast.find(member => member.uid === PLAYER_UID)!;
    expect(player.role).toBe('front');
    expect(player.name).toBe('Wanderer');
  });

  it('stores the ranks it states, rather than ranks the reader corrected', () => {
    /*
     * `rank: index % 3` gave every third hero a rank of **zero**. There is no
     * rank zero, so the reader clamped it and the only symptom was a roster row
     * that would not move — two of the six silently sharing rank one.
     *
     * Asserting `rank >= 1` would prove nothing, because the reader guarantees
     * it either way. What is asserted is the sequence, which is the actual
     * claim: nothing here is being quietly corrected on the way in.
     */
    expect(startingSave(NOW, fixedRandom()).roster.heroes.map(hero => hero.rank)).toEqual([1, 2, 3, 1, 2, 3]);
  });

  it('measures the team it actually shows', () => {
    /*
     * Team health used to be derived from six **level-one commons** while the
     * profile listed the same six at levels 40 to 75 with mixed rarities — two
     * descriptions of one team, and everything downstream of health (how long
     * they survive, which wave is the wall, where the offline sawtooth turns
     * over) was measured against the wrong one.
     *
     * Rather than restate the figure, this asserts the shape that makes it
     * impossible: health scales with the roster, so the same team one level
     * lower is strictly less sturdy.
     */
    const roster = startingRoster(NOW);
    expect(roster.teamMaxHp).toBeGreaterThan(0);

    const save = startingSave(NOW, fixedRandom());
    const weaker = readSave(
      {
        ...save,
        roster: { ...save.roster, heroes: save.roster.heroes.map(hero => ({ ...hero, level: hero.level - 1 })) },
      },
      { nowMs: NOW, content: CONTENT },
    );
    expect(roster.teamMaxHp).toBeGreaterThan(rosterFromSave(weaker).teamMaxHp);
  });

  it('is a save the reader already accepts, unchanged', () => {
    /*
     * Built as a raw payload and read through `readSave`, so it cannot carry
     * something the reader would bound away — which is exactly what the
     * hand-built profile did with its rank of zero. Reading is idempotent, so
     * a second pass is the check.
     */
    const save = startingSave(NOW, fixedRandom());
    const again = readSave(JSON.parse(writeSaveV3(save)), { nowMs: NOW, content: CONTENT });
    expect(again).toEqual(save);
  });

  it('starts the fight somewhere it can be lost, and not be slaughtered in', () => {
    /*
     * This used to read `demoSimulationOptions().incomingMult > 0`, guarding
     * against the `Simulation` default of **zero** — which made the app's team
     * invulnerable, stalling around wave 59 with the wipe offer unreachable.
     *
     * A flat `1` was the fix and was wrong the other way: the shipped chain
     * reduces incoming damage by up to ninety percent, so a flat one is a team
     * taking as much as ten times what it should. It is derived now, so the
     * guard is on the derivation: strictly between nothing and everything.
     */
    const { incomingMult } = startingRoster(NOW);
    expect(incomingMult).toBeGreaterThan(0);
    expect(incomingMult).toBeLessThan(1);
  });

  it('wears the class’s starter set, as rolled instances', () => {
    /*
     * Three rolled instances rather than three catalogue ids, which is what
     * `CREATE_CHARACTER` builds. It matters twice: an instance's stats are
     * rolled against a level rather than taken from the row's authored bonus,
     * and `source: 'starter'` prices them at a fifth when dismantled — so a
     * save built from bare ids would hand a new player gear worth five times
     * as much in scrap.
     */
    const save = startingSave(NOW, fixedRandom());
    expect(save.equipment.inventory).toHaveLength(3);
    expect(Object.values(save.equipment.equipped).filter(id => id !== null)).toHaveLength(3);
    for (const id of save.equipment.inventory) {
      expect({ id, source: save.equipment.instances[id]?.source }).toEqual({ id, source: 'starter' });
      expect({ id, level: save.equipment.instances[id]?.itemLevel }).toEqual({ id, level: 1 });
    }
  });

  it('puts the starter set into the player’s stats, and so into the fight', () => {
    /*
     * The whole point of Phase 9, and the thing no other test in this file can
     * see: `derivedStats` has taken an equipment term since Phase 7 and nothing
     * supplied one. Stripping the gear off the same save has to move the
     * numbers — the player's damage, the team's health and what they take.
     */
    const dressed = startingSave(NOW, fixedRandom());
    const bare: typeof dressed = {
      ...dressed,
      equipment: {
        inventory: [],
        instances: {},
        equipped: { weapon: null, armor: null, accessory: null },
        autoDismantleFloor: 'common',
      },
    };

    const withGear = rosterFromSave(dressed);
    const without = rosterFromSave(bare);

    const player = (roster: typeof withGear) => roster.heroes.find(hero => hero.uid === PLAYER_UID)!;
    expect(player(withGear).damagePerHit.gt(player(without).damagePerHit)).toBe(true);
    expect(withGear.teamMaxHp).toBeGreaterThan(without.teamMaxHp);
    // More vitality and spirit is more defence, so less damage lands.
    expect(withGear.incomingMult).toBeLessThan(without.incomingMult);
  });

  it('gives every fielded hero an ability, and the player none', () => {
    /*
     * The fifth unported system, reaching the fight. Every hero on the team
     * casts; the player is not in this list because they have no archetype —
     * abilities are a hero thing, and the player's verb is BURST.
     */
    const save = startingSave(NOW, fixedRandom());
    const { casters, cast } = rosterFromSave(save);
    expect(casters.map(entry => entry.uid)).toEqual(save.roster.activeUids);
    expect(casters.every(entry => entry.fielded)).toBe(true);
    expect(casters.some(entry => entry.uid === PLAYER_UID)).toBe(false);
    // And the player *is* in the cast, so the two lists differing is the point
    // rather than an omission.
    expect(cast.some(member => member.uid === PLAYER_UID)).toBe(true);
  });

  it('casts the archetype without a relic and the unique skill with one', () => {
    /*
     * A relic swaps the ability rather than strengthening it — and only for
     * the copy actually carrying it. A relic in the armoury, or on a different
     * copy of the same hero, leaves them on their archetype.
     */
    const save = startingSave(NOW, fixedRandom());
    const first = save.roster.heroes[0];
    expect(rosterFromSave(save).casters[0].caster.unique).toBeNull();

    const armed: typeof save = {
      ...save,
      roster: {
        ...save.roster,
        uniqueByHeroId: { [first.id]: { rank: 4, equippedByUid: first.uid } },
      },
    };
    const armedCaster = rosterFromSave(armed).casters.find(entry => entry.uid === first.uid)!;
    expect(armedCaster.caster.unique?.rank).toBe(4);

    // The same relic, in the armoury rather than carried.
    const shelved: typeof save = {
      ...save,
      roster: { ...save.roster, uniqueByHeroId: { [first.id]: { rank: 4, equippedByUid: null } } },
    };
    expect(rosterFromSave(shelved).casters.find(entry => entry.uid === first.uid)!.caster.unique).toBeNull();
  });

  it('rebuilds the fight when an ability changes', () => {
    /*
     * Varied on `casters` directly rather than through a save, and that is a
     * correction: my first version equipped a relic and asserted the signature
     * moved, which it did — but a carried relic also multiplies its bearer's
     * damage, and damage was already in the signature. The test passed with
     * the caster list stripped out of `fightTuningKey` entirely, which is
     * exactly the regression it was supposed to catch.
     *
     * `fightTuningKey` is a pure function of a `LoadedRoster`, so the honest
     * way to ask whether abilities are in it is to move an ability and nothing
     * else. The loop is keyed on this string: a hero who picked up a relic
     * casts a different skill, and a fight that was not rebuilt goes on
     * casting the old one.
     */
    const save = startingSave(NOW, fixedRandom());
    const roster = rosterFromSave(save);
    // Two reads of the same save agree, so a difference below is the change
    // and not the building of it.
    expect(fightTuningKey(rosterFromSave(startingSave(NOW, fixedRandom())))).toBe(fightTuningKey(roster));

    const [first, ...rest] = roster.casters;
    const skill = uniqueSkillFor(save.roster.heroes.find(hero => hero.uid === first.uid)!.id)!;
    expect(skill).toBeDefined();
    const armed = {
      ...roster,
      casters: [{ ...first, caster: { ...first.caster, unique: { skill, rank: 4 } } }, ...rest],
    };
    expect(fightTuningKey(armed)).not.toBe(fightTuningKey(roster));

    // And the rank alone moves it, because a rank is twelve percent of power.
    const higher = {
      ...roster,
      casters: [{ ...first, caster: { ...first.caster, unique: { skill, rank: 5 } } }, ...rest],
    };
    expect(fightTuningKey(higher)).not.toBe(fightTuningKey(armed));
  });
});

describe('what the starting team earns', () => {
  /*
   * `SimulationOptions.rates` existed from Phase 8 and nothing supplied it, so
   * every kill paid a flat 1x while thirteen factors sat computed and unread.
   * These are the tests for the other end of that wire.
   */
  it('derives both chains rather than leaving them flat', () => {
    const { rates } = rosterFromSave(startingSave(NOW, fixedRandom()));
    // Not 1x, because there is no neutral week — every event in the table
    // moves something, and a new save is on one of them.
    expect(rates.goldMult).not.toBe(1);
    expect(rates.expMult).not.toBe(1);
    expect(rates.goldMult).toBeGreaterThan(0);
    expect(rates.expMult).toBeGreaterThan(0);
  });

  it('runs gold and EXP down different chains, from a real save', () => {
    /*
     * The finding, end to end. A rebirth economy path multiplies gold and
     * leaves EXP exactly where it was; the training facility does the reverse.
     * Measured through `rosterFromSave` rather than the chain directly, so
     * this covers the save reading as well as the arithmetic.
     */
    const base = startingSave(NOW, fixedRandom());
    const flat = rosterFromSave(base).rates;
    const withProgression = (over: Partial<typeof base.progression>) =>
      rosterFromSave({ ...base, progression: { ...base.progression, ...over } }).rates;

    for (const over of [{ rebirthEconomyPath: 5 }, { metaEconomyLevel: 5 }]) {
      expect(withProgression(over).goldMult).toBeGreaterThan(flat.goldMult);
      expect(withProgression(over).expMult).toBe(flat.expMult);
    }

    /*
     * And the *damage* levels move neither, which is the half that a port
     * sharing one state between the two chains gets wrong — and the half a
     * test on the starting save alone cannot see, because both meta levels
     * begin at zero and reading the wrong one looks identical.
     */
    for (const over of [{ rebirthDamagePath: 5 }, { metaDamageLevel: 5 }]) {
      expect(withProgression(over).goldMult).toBe(flat.goldMult);
      expect(withProgression(over).expMult).toBe(flat.expMult);
    }

    const studied = rosterFromSave({ ...base, facilities: { ...base.facilities, training: 5 } }).rates;
    expect(studied.expMult).toBeGreaterThan(flat.expMult);
    expect(studied.goldMult).toBe(flat.goldMult);
  });

  it('rebuilds the fight when what a kill pays changes', () => {
    /*
     * Varied on the training facility, which reaches EXP and *nothing else* —
     * not damage, not health, not defence. My first version raised
     * `prestigeCount`, which moved the signature whether or not the rates were
     * in it, because prestige multiplies damage too and damage was already
     * there. The same over-determination the caster test had.
     */
    const base = startingSave(NOW, fixedRandom());
    const studied: typeof base = { ...base, facilities: { ...base.facilities, training: 5 } };
    expect(fightTuningKey(rosterFromSave(studied))).not.toBe(fightTuningKey(rosterFromSave(base)));
  });
});
