import { describe, expect, it } from 'vitest';
import { HERO_POOL, heroTemplatesById } from '../content/heroes';
import { migrateSave } from '../engine/save/migrate';
import type { SaveV3 } from '../engine/save/schema';
import { heroModelKey } from '../game/models/manifest';
import { fightSignature, rosterFromSave } from './roster';

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

describe('what the running fight would notice', () => {
  /*
   * The shell rebuilds the loop when this signature changes and leaves it
   * alone when it does not. Getting that wrong in either direction is a
   * visible bug: too eager and every summon restarts the run at wave one, too
   * lazy and a hero the player just fielded does not fight.
   */
  const base = {
    playerName: 'Sig',
    playerClass: 'warrior',
    characterCreated: true,
    level: 20,
    teamSlotsUnlocked: 6,
    heroRoster: [row(FIRST.id, 'a'), row(SECOND.id, 'b')],
    activeTeamHeroIds: ['a'],
  };

  it('is unchanged by a hero arriving on the bench', () => {
    // A summon. The roster is longer, the team is the same, and the run has
    // to carry on — this is the case the whole split exists for.
    const before = fightSignature(rosterFromSave(saveWith(base)));
    const after = fightSignature(
      rosterFromSave(saveWith({ ...base, heroRoster: [row(FIRST.id, 'z'), ...base.heroRoster] })),
    );
    expect(after).toBe(before);
  });

  it('is unchanged by a wallet or a counter moving', () => {
    const before = fightSignature(rosterFromSave(saveWith(base)));
    const after = fightSignature(
      rosterFromSave(saveWith({ ...base, gold: 9_999_999, totalSummons: 412, gachaPityCounter: 17 })),
    );
    expect(after).toBe(before);
  });

  it('changes when a hero is fielded', () => {
    const before = fightSignature(rosterFromSave(saveWith(base)));
    const after = fightSignature(rosterFromSave(saveWith({ ...base, activeTeamHeroIds: ['a', 'b'] })));
    expect(after).not.toBe(before);
  });

  it('changes when a fielded hero levels or ranks up', () => {
    const before = fightSignature(rosterFromSave(saveWith(base)));
    for (const change of [{ level: 40 }, { rank: 4 }]) {
      const after = fightSignature(
        rosterFromSave(saveWith({ ...base, heroRoster: [row(FIRST.id, 'a', change), row(SECOND.id, 'b')] })),
      );
      expect(after, JSON.stringify(change)).not.toBe(before);
    }
  });

  it("changes with a fielded hero's rarity, at any rank", () => {
    /*
     * This used to hold only above rank one, and the note explaining why was
     * the finding that led to connecting the damage stack: rarity reached the
     * fight through `getRankStatMultiplier` alone, which is **exactly 1 at rank
     * one whatever the rarity**, so a rank-one legendary and a rank-one common
     * fought identically. `teamBoost`, which rarity scales, was in no chain at
     * all.
     *
     * It is now, so both ranks move.
     */
    for (const rank of [1, 4]) {
      const withRarity = (rarity: string) => ({
        ...base,
        heroRoster: [row(FIRST.id, 'a', { rank, rarity }), row(SECOND.id, 'b')],
      });
      expect(fightSignature(rosterFromSave(saveWith(withRarity('legendary')))), `rank ${rank}`).not.toBe(
        fightSignature(rosterFromSave(saveWith(withRarity('rare')))),
      );
    }
  });

  it('changes when the player spends a stat point, because team health moves', () => {
    const before = fightSignature(rosterFromSave(saveWith(base)));
    const after = fightSignature(
      rosterFromSave(
        saveWith({ ...base, statsAlloc: { strength: 0, vitality: 30, agility: 0, intelligence: 0, spirit: 0 } }),
      ),
    );
    expect(after).not.toBe(before);
  });

  it('changes when the same heroes are fielded in a different order', () => {
    /*
     * The team's order is the player's, and it is not cosmetic: it decides
     * which hero the swing scheduler reaches first on a tie and where each
     * figure stands in the diorama. This is also the case that isolates the
     * *cast* term — everything else here moves team health as well.
     */
    const forwards = fightSignature(rosterFromSave(saveWith({ ...base, activeTeamHeroIds: ['a', 'b'] })));
    const backwards = fightSignature(rosterFromSave(saveWith({ ...base, activeTeamHeroIds: ['b', 'a'] })));
    expect(backwards).not.toBe(forwards);
  });

  it('changes when a damage multiplier moves and team health does not', () => {
    /*
     * The tripwire that fired. This was written as `toBe` — an assertion that
     * the signature's damage term was redundant, left deliberately so that
     * connecting the damage multiplier chain would break it. It did, on the
     * commit that connected it.
     *
     * `metaDamageLevel` and `prestigeCount` reach damage and nothing else, so
     * this is the case that isolates the term.
     */
    const before = fightSignature(rosterFromSave(saveWith(base)));
    const after = fightSignature(rosterFromSave(saveWith({ ...base, metaDamageLevel: 40, prestigeCount: 6 })));
    expect(after).not.toBe(before);
  });

  it('changes when the player levels, because the player fights', () => {
    // They were not a combatant at all for four phases. Their own level and
    // their spent points now move the damage the team deals.
    const before = fightSignature(rosterFromSave(saveWith(base)));
    const after = fightSignature(rosterFromSave(saveWith({ ...base, level: 80 })));
    expect(after).not.toBe(before);
  });

  it('is stable across two reads of the same save', () => {
    // It is compared as a string, so a `Decimal` that stringified differently
    // between reads — or a key order that moved — would restart the run on
    // every render.
    const save = saveWith(base);
    expect(fightSignature(rosterFromSave(save))).toBe(fightSignature(rosterFromSave(save)));
  });
});
