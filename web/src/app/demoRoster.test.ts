import { describe, expect, it } from 'vitest';
import { heroTemplatesById } from '../content/heroes';
import { VALID_FORMATION_ROLES_FOR_CLASS, type FormationRole } from '../engine/combat/formation';
import { ACTIVE_TEAM_SIZE } from '../engine/save/migrate';
import { readSave, writeSaveV3 } from '../engine/save/v3';
import { demoSimulationOptions, startingSave } from './demoRoster';
import { rosterFromSave } from './roster';

/**
 * The three shapes, from the one save. `App` composes these itself — there is
 * no `startingRoster` any more, because a save and a reader is the whole of it.
 */
const startingRoster = (nowMs: number) => rosterFromSave(startingSave(nowMs));

/**
 * The starting save.
 *
 * This file had no tests while it was four hand-written things bolted
 * together, which is most of why they disagreed. Each case below is one of the
 * disagreements, pinned so it cannot come back.
 */

const NOW = 1_700_000_000_000;
const CONTENT = { heroesById: heroTemplatesById() };

describe('the team a new player starts on', () => {
  it('fields all six, which the old formation could not', () => {
    /*
     * The one that mattered. Picking one hero of each class gives three whose
     * intended rank is `front`, plus a spare that was usually a fourth — and a
     * rank holds two, so the shipped selection rules fielded **four**. The
     * cast path does not check, so the diorama drew six people standing
     * somewhere the game says they cannot stand.
     */
    const save = startingSave(NOW);
    expect(save.roster.heroes).toHaveLength(ACTIVE_TEAM_SIZE);
    expect(save.roster.activeUids).toHaveLength(ACTIVE_TEAM_SIZE);

    const roster = startingRoster(NOW);
    expect(roster.profile.roster.filter(hero => hero.active)).toHaveLength(ACTIVE_TEAM_SIZE);
    expect(roster.cast).toHaveLength(ACTIVE_TEAM_SIZE);
    expect(roster.heroes).toHaveLength(ACTIVE_TEAM_SIZE);
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
    // are built from the same rows precisely so this holds.
    const roster = startingRoster(NOW);
    const roleByUid = new Map(roster.profile.roster.map(hero => [hero.uid, hero.role]));
    for (const member of roster.cast) expect(roleByUid.get(member.uid), member.uid).toBe(member.role);
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
    expect(startingSave(NOW).roster.heroes.map(hero => hero.rank)).toEqual([1, 2, 3, 1, 2, 3]);
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

    const save = startingSave(NOW);
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
    const save = startingSave(NOW);
    const again = readSave(JSON.parse(writeSaveV3(save)), { nowMs: NOW, content: CONTENT });
    expect(again).toEqual(save);
  });

  it('starts the fight somewhere it can be lost', () => {
    // Zero incoming damage made the team invulnerable: they stalled in the
    // fifties and sat there forever, so the wipe offer could not be reached.
    expect(demoSimulationOptions().incomingMult).toBeGreaterThan(0);
  });
});
