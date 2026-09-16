import { describe, expect, it } from 'vitest';
import { HERO_POOL, heroTemplatesById } from '../content/heroes';
import { migrateSave } from '../engine/save/migrate';
import type { SaveV3 } from '../engine/save/schema';
import { heroModelKey } from '../game/models/manifest';
import { rosterFromSave } from './roster';

const CONTENT = { heroesById: heroTemplatesById() };
const NOW = 1_700_000_000_000;

/** A save built the way the app builds one: by migrating a stored payload. */
function saveWith(raw: Record<string, unknown>): SaveV3 {
  return migrateSave(raw, { nowMs: NOW, content: CONTENT });
}

const [FIRST, SECOND] = HERO_POOL;

function row(id: string, uid: string, over: Record<string, unknown> = {}) {
  return { id, uid, rarity: 'rare', level: 10, rank: 1, ...over };
}

describe('a team built from a save', () => {
  it('describes one team three times, not three teams', () => {
    /*
     * The invariant the whole module exists for. `demoRoster` learned it the
     * hard way — names written by hand and emoji read from the catalogue
     * under the same id put a warrior's shield on a mage. A save has three
     * readers, so it is three chances to disagree.
     */
    const save = saveWith({
      heroRoster: [row(FIRST.id, 'a'), row(SECOND.id, 'b')],
      activeTeamHeroIds: ['a', 'b'],
    });
    const { heroes, cast, profile } = rosterFromSave(save);

    expect(heroes.map(hero => hero.uid)).toEqual(['a', 'b']);
    expect(cast.map(member => member.uid)).toEqual(['a', 'b']);
    expect(cast.map(member => member.name)).toEqual([FIRST.name, SECOND.name]);
    // The profile carries the whole roster, so it is filtered to the team.
    expect(
      profile.roster
        .filter(entry => entry.active)
        .map(entry => entry.uid)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('keys the model off the template, because a real uid is not a template id', () => {
    /*
     * A saved hero's `uid` identifies that copy — `h1_0`, or whatever the
     * shipped save stored — and `id` names the template. The demo could not
     * tell them apart because its uids *were* template ids, so keying the
     * model off the uid looked correct there and would find no model at all
     * for any save a real player has.
     */
    const save = saveWith({
      heroRoster: [row(FIRST.id, 'an-arbitrary-instance-id')],
      activeTeamHeroIds: ['an-arbitrary-instance-id'],
    });
    const [member] = rosterFromSave(save).cast;

    expect(member.uid).toBe('an-arbitrary-instance-id');
    expect(member.modelKey).toBe(heroModelKey(FIRST.id));
    expect(member.modelKey).not.toBe(heroModelKey('an-arbitrary-instance-id'));
  });

  it('fields one copy of a hero even when the save asks for two', () => {
    // The shipped rule, enforced by `normalizeTeamSelection`: a team holds
    // one copy of any template. Worth pinning here because it is the reason
    // the cast can never contain a duplicate to disagree about.
    const save = saveWith({
      heroRoster: [row(FIRST.id, 'copy-one'), row(FIRST.id, 'copy-two')],
      activeTeamHeroIds: ['copy-one', 'copy-two'],
    });
    expect(rosterFromSave(save).cast.map(member => member.uid)).toEqual(['copy-one']);
  });

  it('follows the order the player chose rather than the order they were stored', () => {
    const save = saveWith({
      heroRoster: [row(FIRST.id, 'a'), row(SECOND.id, 'b')],
      activeTeamHeroIds: ['b', 'a'],
    });
    expect(rosterFromSave(save).heroes.map(hero => hero.uid)).toEqual(['b', 'a']);
  });

  it('fields a team when the save selects nobody', () => {
    // A team of nobody deals no damage, and a game that does nothing is
    // worse than one that guesses a line-up the player can change.
    const save = saveWith({ heroRoster: [row(FIRST.id, 'a'), row(SECOND.id, 'b')] });
    expect(rosterFromSave(save).heroes.length).toBeGreaterThan(0);
  });

  it('hits harder for a hero the save levelled', () => {
    // The damage is the ported formula's, not a placeholder — so a save that
    // records progress has to produce a team that shows it.
    const low = saveWith({ heroRoster: [row(FIRST.id, 'a', { level: 1 })], activeTeamHeroIds: ['a'] });
    const high = saveWith({ heroRoster: [row(FIRST.id, 'a', { level: 400 })], activeTeamHeroIds: ['a'] });

    const damageOf = (save: SaveV3) => rosterFromSave(save).heroes[0].damagePerHit;
    expect(damageOf(high).gt(damageOf(low))).toBe(true);
  });

  it('honours a stored formation role over the class default', () => {
    const save = saveWith({
      heroRoster: [row(FIRST.id, 'a')],
      activeTeamHeroIds: ['a'],
      heroFormationByUid: { a: 'front' },
    });
    expect(rosterFromSave(save).cast[0].role).toBe('front');
  });

  it('skips a row whose template the catalogue no longer has', () => {
    // How a retired hero leaves an old save. The migration drops the row
    // first, so this is belt and braces — but a team member with no class
    // has nothing to swing with, and `undefined` is not a hero.
    const save = saveWith({ heroRoster: [row('no-such-hero', 'ghost'), row(FIRST.id, 'a')] });
    const { heroes, cast } = rosterFromSave(save);
    expect(heroes.every(hero => hero.uid !== 'ghost')).toBe(true);
    expect(cast.every(member => member.uid !== 'ghost')).toBe(true);
  });

  it('gives an empty save an empty team rather than inventing one', () => {
    // A player who has a save and has emptied it has made a choice. Making
    // heroes up for them would be making progress up for them.
    expect(rosterFromSave(saveWith({})).heroes).toEqual([]);
  });
});
