import { describe, expect, it } from 'vitest';
import { HERO_POOL, heroTemplatesById } from '../content/heroes';
import { equipmentTemplatesById } from '../content/equipment';
import { migrateSave } from '../engine/save/migrate';
import type { SaveV3 } from '../engine/save/schema';
import { heroModelKey } from '../game/models/manifest';
import { fightIdentity, fightTuningKey, rosterFromSave } from './roster';

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
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
   * The shell acts when one of these two keys changes and leaves the fight
   * alone when neither does. Getting that wrong in either direction is a
   * visible bug: too eager and every summon disturbs the run, too lazy and a
   * hero the player just fielded does not fight.
   *
   * These tests ask only "would the fight notice", so they read both keys —
   * which of the two moves, and therefore whether the answer is a rebuild or a
   * retune, is the block below.
   */
  const noticed = (over: Record<string, unknown>) => {
    const roster = rosterFromSave(saveWith(over));
    return `${fightIdentity(roster)}|${fightTuningKey(roster)}`;
  };
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
    expect(noticed({ ...base, heroRoster: [row(FIRST.id, 'z'), ...base.heroRoster] })).toBe(noticed(base));
  });

  it('is unchanged by a wallet or a counter moving', () => {
    expect(noticed({ ...base, gold: 9_999_999, totalSummons: 412, gachaPityCounter: 17 })).toBe(noticed(base));
  });

  it('changes when a hero is fielded', () => {
    expect(noticed({ ...base, activeTeamHeroIds: ['a', 'b'] })).not.toBe(noticed(base));
  });

  it('changes when a fielded hero levels or ranks up', () => {
    for (const change of [{ level: 40 }, { rank: 4 }]) {
      const after = noticed({ ...base, heroRoster: [row(FIRST.id, 'a', change), row(SECOND.id, 'b')] });
      expect(after, JSON.stringify(change)).not.toBe(noticed(base));
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
      expect(noticed(withRarity('legendary')), `rank ${rank}`).not.toBe(noticed(withRarity('rare')));
    }
  });

  it('changes when the player spends a stat point, because team health moves', () => {
    const before = fightTuningKey(rosterFromSave(saveWith(base)));
    const after = fightTuningKey(
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
    const forwards = fightTuningKey(rosterFromSave(saveWith({ ...base, activeTeamHeroIds: ['a', 'b'] })));
    const backwards = fightTuningKey(rosterFromSave(saveWith({ ...base, activeTeamHeroIds: ['b', 'a'] })));
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
    const before = fightTuningKey(rosterFromSave(saveWith(base)));
    const after = fightTuningKey(rosterFromSave(saveWith({ ...base, metaDamageLevel: 40, prestigeCount: 6 })));
    expect(after).not.toBe(before);
  });

  it('changes when the player levels, because the player fights', () => {
    // They were not a combatant at all for four phases. Their own level and
    // their spent points now move the damage the team deals.
    const before = fightTuningKey(rosterFromSave(saveWith(base)));
    const after = fightTuningKey(rosterFromSave(saveWith({ ...base, level: 80 })));
    expect(after).not.toBe(before);
  });

  it('is stable across two reads of the same save', () => {
    // It is compared as a string, so a `Decimal` that stringified differently
    // between reads — or a key order that moved — would restart the run on
    // every render.
    const save = saveWith(base);
    expect(fightTuningKey(rosterFromSave(save))).toBe(fightTuningKey(rosterFromSave(save)));
  });
});

describe('what needs a rebuild and what does not', () => {
  /*
   * The split, and the reason for it. A rebuild resumes from `RunProgress` —
   * wave, kills, deaths, burst charge, gold, exp — and carries nothing else,
   * so every rebuild heals both sides to full, clears every ability cooldown
   * and puts the clock back to zero. Before this split that happened whenever
   * a hero levelled or a piece of gear was equipped.
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
  const keys = (over: Record<string, unknown>) => {
    const roster = rosterFromSave(saveWith(over));
    return { identity: fightIdentity(roster), tuning: fightTuningKey(roster) };
  };

  it('retunes rather than rebuilds when a fielded hero levels', () => {
    // The case the split exists for. Levelling changes what they hit for and
    // nothing about who is on the field.
    const before = keys(base);
    const after = keys({ ...base, heroRoster: [row(FIRST.id, 'a', { level: 40 }), row(SECOND.id, 'b')] });
    expect(after.identity).toBe(before.identity);
    expect(after.tuning).not.toBe(before.tuning);
  });

  it('retunes rather than rebuilds when the account gets richer', () => {
    // A prestige upgrade moves what a kill pays and, through the damage chain,
    // what the team hits for. It moves nobody.
    const before = keys(base);
    const after = keys({ ...base, prestigeCount: 3, metaEconomyLevel: 4 });
    expect(after.identity).toBe(before.identity);
    expect(after.tuning).not.toBe(before.tuning);
  });

  it('retunes when only the damage chain moves', () => {
    /*
     * `rebirthDamagePath` is the one lever that moves a hero's damage and
     * nothing else — not the team's ceiling, which reads the *survival* meta
     * level, and not what a kill pays, which reads the *economy* path. So this
     * is the case that actually requires `damagePerHit` in the tuning key.
     *
     * Every other case here moves two things at once: levelling a hero raises
     * the team's maximum as well, so the tuning key shifts whether or not the
     * damage is in it, and the test passed with it stripped out.
     */
    const before = keys(base);
    const after = keys({ ...base, rebirthDamagePath: 5 });
    expect(after.identity).toBe(before.identity);
    expect(after.tuning).not.toBe(before.tuning);
  });

  it('rebuilds when a fielded hero moves rank', () => {
    /*
     * The renderer draws them somewhere else, so the cast has to be in the
     * identity — and a rank move is the case that requires it there. Fielding
     * someone moves the hero list too, so that test passed with the cast
     * stripped out of the key entirely.
     *
     * A monk, because they are the **only** class with a choice:
     * `VALID_FORMATION_ROLES_FOR_CLASS` gives them front and mid and everyone
     * else exactly one rank, so a warrior asked to stand back is corrected to
     * front and nothing moves at all. That is what my first version measured.
     */
    const monk = HERO_POOL.find(hero => hero.heroClass === 'monk')!;
    const withMonk = { ...base, heroRoster: [row(monk.id, 'm')], activeTeamHeroIds: ['m'] };
    const front = keys({ ...withMonk, heroFormationByUid: { m: 'front' } });
    const mid = keys({ ...withMonk, heroFormationByUid: { m: 'mid' } });
    expect(mid.identity).not.toBe(front.identity);
  });

  it('rebuilds when a hero is fielded', () => {
    // The renderer's cast changes and so does the swing schedule, and neither
    // can be handed to a running fight.
    const before = keys(base);
    const after = keys({ ...base, activeTeamHeroIds: ['a', 'b'] });
    expect(after.identity).not.toBe(before.identity);
  });

  it('does neither for a summon that lands on the bench', () => {
    const before = keys(base);
    const after = keys({ ...base, heroRoster: [row(FIRST.id, 'z'), ...base.heroRoster] });
    expect(after).toEqual(before);
  });
});
