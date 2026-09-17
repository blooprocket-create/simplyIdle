import { describe, expect, it } from 'vitest';
import type { RosterEntry } from '../profile/playerProfile';
import { teamAfterToggling } from './RosterSurface';

/**
 * The one decision on the Roster surface that is not a render.
 *
 * There is no React testing stack here, by choice — surfaces describe data and
 * are held to `ui/architecture.test.ts` — so anything with a branch in it lives
 * somewhere that can be called without mounting a component.
 */

function hero(uid: string, active: boolean): RosterEntry {
  return {
    uid,
    templateId: 'h1',
    name: uid,
    emoji: '⚔️',
    heroClass: 'warrior',
    tier: 1,
    rarity: 'common',
    level: 1,
    rank: 1,
    teamBoost: 0.05,
    role: 'front',
    active,
  };
}

const TEAM = [hero('a', true), hero('b', true)];

describe('what a field-or-bench press asks for', () => {
  it('adds a benched hero to the end of the line', () => {
    // The end, not the front: the team's order is the player's, and it decides
    // which hero the swing scheduler reaches first on a tie.
    expect(teamAfterToggling(TEAM, hero('c', false))).toEqual(['a', 'b', 'c']);
  });

  it('removes a fielded one and leaves the rest in order', () => {
    expect(teamAfterToggling(TEAM, hero('a', true))).toEqual(['b']);
  });

  it('asks rather than commands, so an illegal request is still a request', () => {
    /*
     * `fieldTeam` replays this through the selection rules, so a fifth
     * front-ranker is dropped by the engine rather than refused by the screen.
     * That is why this builds the list without checking anything: a screen
     * that duplicated the rules would be a second copy of them to keep in
     * step, and the one place they disagreed would be a button that lies.
     */
    const crowded = [hero('a', true), hero('b', true), hero('c', true)];
    expect(teamAfterToggling(crowded, hero('d', false))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('is stable for a hero who is not in the line it was given', () => {
    // Benching someone already benched asks for the same team, and `fieldTeam`
    // answers `false` — which is the honest answer rather than a no-op that
    // reports success.
    expect(teamAfterToggling(TEAM, hero('z', true))).toEqual(['a', 'b']);
  });
});
