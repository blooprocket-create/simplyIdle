import { describe, expect, it } from 'vitest';
import { MAX_FORMATION_ROLE_HEROES } from '../../engine/roster/team';
import type { PlayerClass } from '../../content/classes';
import type { FormationRole } from '../../engine/combat/formation';
import type { RosterEntry } from '../profile/playerProfile';
import { canMove, openRanks } from './PartySurface';

/**
 * The two decisions on the Party surface that are not a render.
 *
 * There is no React testing stack here, by choice — surfaces describe data and
 * are held to `ui/architecture.test.ts` — so anything with a branch in it lives
 * somewhere that can be called without mounting a component.
 *
 * What is under test is the *gating*, and the reason it needs gating at all is
 * that `placeHero` refuses rather than replaying: unlike `fieldTeam`, which
 * takes a request and normalises it, a placement the rules will not allow comes
 * back as null and the screen would have offered a button that does nothing.
 */

function hero(uid: string, heroClass: PlayerClass, role: FormationRole, active: boolean): RosterEntry {
  return {
    uid,
    templateId: 'h1',
    name: uid,
    emoji: '⚔️',
    heroClass,
    tier: 1,
    rarity: 'common',
    level: 1,
    rank: 1,
    teamBoost: 0.05,
    role,
    active,
  };
}

describe('which heroes have anywhere else to stand', () => {
  it('is the monk, and only the monk', () => {
    /*
     * Not a style choice: `VALID_FORMATION_ROLES_FOR_CLASS` gives every other
     * class exactly one legal rank, so a placement control for them would be a
     * control with nothing to pick. Written as a sweep rather than as five
     * assertions so that a class gaining a second rank shows up here.
     */
    const classes: PlayerClass[] = ['warrior', 'berserker', 'monk', 'mage', 'archer'];
    const movable = classes.filter(heroClass => canMove(hero('x', heroClass, 'front', true)));
    expect(movable).toEqual(['monk']);
  });
});

describe('where a hero may be moved to', () => {
  it('never offers the rank they already hold', () => {
    // The engine would accept it — it writes the same role back — but a button
    // that redraws the screen identically reads as a broken button.
    expect(openRanks(hero('monk', 'monk', 'front', true), [])).toEqual(['mid']);
    expect(openRanks(hero('monk', 'monk', 'mid', true), [])).toEqual(['front']);
  });

  it('never offers a rank the class may not hold', () => {
    // A mage is mid-only, so there is nowhere to send them and the front is
    // not on offer even though the front is where the cap has room.
    expect(openRanks(hero('mage', 'mage', 'mid', true), [])).toEqual([]);
    expect(openRanks(hero('archer', 'archer', 'back', true), [])).toEqual([]);
  });

  it('refuses a full rank for a hero who is on the team', () => {
    /*
     * Two is the cap, and the count is taken against the *fielded* line. Both
     * of these monks are in the middle, so a third has nowhere to go — and the
     * hero doing the moving is excluded from their own count, which is what
     * makes the check meaningful for someone already standing there.
     */
    const line = [hero('a', 'monk', 'mid', true), hero('b', 'monk', 'mid', true), hero('c', 'monk', 'front', true)];
    expect(line.filter(entry => entry.role === 'mid')).toHaveLength(MAX_FORMATION_ROLE_HEROES);
    expect(openRanks(hero('c', 'monk', 'front', true), line)).toEqual([]);
  });

  it('offers a rank with one space to a hero on the team', () => {
    // One monk in the middle rather than two, so the cap has not been reached
    // and the move is allowed. Without this the test above is satisfied by a
    // build that never offers anything.
    const line = [hero('a', 'monk', 'mid', true), hero('c', 'monk', 'front', true)];
    expect(openRanks(hero('c', 'monk', 'front', true), line)).toEqual(['mid']);
  });

  it('lets a benched hero take a rank that is already full', () => {
    /*
     * The shipped rule, and it looks like an oversight until you see what it
     * is for: `setFormationRole` checks the cap only for a hero in the active
     * line, so a player can arrange a second formation on the bench and then
     * swap it in. A port that checked the cap unconditionally would make
     * preparing one impossible.
     */
    const line = [hero('a', 'monk', 'mid', true), hero('b', 'monk', 'mid', true)];
    expect(openRanks(hero('bench', 'monk', 'front', false), line)).toEqual(['mid']);
  });

  it('counts only the fielded line, not the whole roster', () => {
    // Two benched monks in the middle do not fill it. The cap is about who is
    // standing there in the fight, and the bench is not in the fight.
    const line = [hero('a', 'monk', 'mid', false), hero('b', 'monk', 'mid', false)];
    expect(openRanks(hero('c', 'monk', 'front', true), line)).toEqual(['mid']);
  });
});
