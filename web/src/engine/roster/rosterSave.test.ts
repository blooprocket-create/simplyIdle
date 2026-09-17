import { describe, expect, it } from 'vitest';
import { heroTemplatesById } from '../../content/heroes';
import type { SaveContent, SaveV3 } from '../save/schema';
import { readSave } from '../save/v3';
import { ACTIVE_TEAM_SIZE, MIN_TEAM_SLOTS } from '../save/migrate';
import { HERO_LEVEL_CAP, HERO_RANK_CAP, heroGoldLevelCost, rankUpShardCost } from './progression';
import { TEAM_SLOT_UNLOCK_RULES } from './team';
import {
  batchLevelHeroes,
  buySlot,
  fieldTeam,
  placeHero,
  recallLoadout,
  recycleHero,
  spendOnHero,
  storeLoadout,
} from './rosterSave';

/**
 * The roster verbs, against a save.
 *
 * The rules themselves are tested next door and against recorded runs. What is
 * here is the seam: which save fields each verb moves, which it must leave
 * alone, and — the part a screen depends on — when it refuses.
 */

const NOW = 1_700_000_000_000;
const CONTENT: SaveContent = { heroesById: heroTemplatesById() };
const OPTIONS = { nowMs: NOW, content: CONTENT };

/** `h1` warrior, `h3` berserker, `h5` archer, `h7` mage, `h9` monk. */
function saveWith(
  over: {
    heroes?: { id: string; uid: string; level?: number; rank?: number; rarity?: string }[];
    activeUids?: string[];
    formationByUid?: Record<string, string>;
    loadouts?: string[][];
    slotsUnlocked?: number;
    gold?: number;
    heroShards?: number;
    essence?: number;
    highestWave?: number;
    uniqueByHeroId?: Record<string, { rank: number; equippedByUid: string | null }>;
  } = {},
): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'Roster', playerClass: 'warrior', created: true },
      progression: { level: 40, wave: 1, highestWave: over.highestWave ?? 30 },
      wallet: { gold: over.gold ?? 0, heroShards: over.heroShards ?? 0, essence: over.essence ?? 0 },
      roster: {
        heroes: (over.heroes ?? [{ id: 'h1', uid: 'a' }]).map(hero => ({
          id: hero.id,
          uid: hero.uid,
          rarity: hero.rarity ?? 'common',
          level: hero.level ?? 1,
          rank: hero.rank ?? 1,
          rebirthStatMult: 1,
        })),
        activeUids: over.activeUids ?? [],
        formationByUid: over.formationByUid ?? {},
        loadouts: over.loadouts ?? [],
        slotsUnlocked: over.slotsUnlocked ?? MIN_TEAM_SLOTS,
        uniqueByHeroId: over.uniqueByHeroId ?? {},
      },
    },
    OPTIONS,
  );
}

const levelOf = (save: SaveV3, uid: string) => save.roster.heroes.find(hero => hero.uid === uid)!.level;

describe('spending on one hero', () => {
  it('buys a level and takes the gold for it', () => {
    const save = saveWith({ gold: 10_000 });
    const next = spendOnHero(save, 'a', 'level')!;
    expect(levelOf(next, 'a')).toBe(2);
    expect(save.wallet.gold - next.wallet.gold).toBe(heroGoldLevelCost(1));
  });

  it('refuses a level it cannot pay for, and changes nothing', () => {
    // Null rather than the unchanged save: a screen greying out a button has
    // to be able to ask, and "it worked and changed nothing" is a different
    // answer from "it did not happen".
    expect(spendOnHero(saveWith({ gold: 0 }), 'a', 'level')).toBeNull();
  });

  it('refuses a hero who is not on the roster', () => {
    expect(spendOnHero(saveWith({ gold: 1e9 }), 'nobody', 'level')).toBeNull();
  });

  it('buys a rank with shards rather than gold', () => {
    const save = saveWith({ heroShards: 1e6, gold: 1e6, heroes: [{ id: 'h1', uid: 'a', rarity: 'rare' }] });
    const next = spendOnHero(save, 'a', 'rank')!;
    expect(next.roster.heroes[0].rank).toBe(2);
    expect(save.wallet.heroShards - next.wallet.heroShards).toBe(rankUpShardCost('rare', 2));
    expect(next.wallet.gold).toBe(save.wallet.gold);
  });

  it('buys every rank at once, and lands on the cap', () => {
    const save = saveWith({ heroShards: 1e9, heroes: [{ id: 'h1', uid: 'a', rarity: 'rare' }] });
    const next = spendOnHero(save, 'a', 'rankToMax')!;
    expect(next.roster.heroes[0].rank).toBe(HERO_RANK_CAP);
  });

  it('refuses a rebirth for a hero who has only reached one cap', () => {
    /*
     * Rank ten **and** level 999. Checking either alone is the obvious mistake
     * and would let a player reset a hero they had not finished — and a
     * rebirth is not undoable.
     */
    const rich = { heroShards: 1e9, essence: 1e9 };
    const maxRank = saveWith({ ...rich, heroes: [{ id: 'h1', uid: 'a', rank: HERO_RANK_CAP, level: 500 }] });
    const maxLevel = saveWith({ ...rich, heroes: [{ id: 'h1', uid: 'a', rank: 4, level: HERO_LEVEL_CAP }] });
    expect(spendOnHero(maxRank, 'a', 'rebirth')).toBeNull();
    expect(spendOnHero(maxLevel, 'a', 'rebirth')).toBeNull();

    const both = saveWith({ ...rich, heroes: [{ id: 'h1', uid: 'a', rank: HERO_RANK_CAP, level: HERO_LEVEL_CAP }] });
    const reborn = spendOnHero(both, 'a', 'rebirth')!;
    expect({ level: reborn.roster.heroes[0].level, rank: reborn.roster.heroes[0].rank }).toEqual({ level: 1, rank: 1 });
    expect(reborn.roster.heroes[0].rebirthStatMult).toBeGreaterThan(1);
  });

  it('leaves every other hero alone', () => {
    const save = saveWith({
      gold: 1e6,
      heroes: [
        { id: 'h1', uid: 'a' },
        { id: 'h3', uid: 'b' },
      ],
    });
    const next = spendOnHero(save, 'a', 'level')!;
    expect(levelOf(next, 'b')).toBe(levelOf(save, 'b'));
  });
});

describe('levelling a batch', () => {
  const six = [
    { id: 'h1', uid: 'a' },
    { id: 'h3', uid: 'b' },
    { id: 'h5', uid: 'c' },
  ];

  it('levels everyone it can afford', () => {
    const save = saveWith({ gold: 1e6, heroes: six });
    const next = batchLevelHeroes(save, CONTENT, ['a', 'b', 'c'], 3)!;
    expect(six.map(hero => levelOf(next, hero.uid))).toEqual([4, 4, 4]);
    expect(next.wallet.gold).toBeLessThan(save.wallet.gold);
  });

  it('refuses only when nothing at all moved', () => {
    // A batch that levelled four of six is a success with a shorter answer;
    // a batch that levelled nobody is a button that did nothing.
    expect(batchLevelHeroes(saveWith({ gold: 0, heroes: six }), CONTENT, ['a'], 1)).toBeNull();
    expect(batchLevelHeroes(saveWith({ gold: 1e6, heroes: six }), CONTENT, [], 1)).toBeNull();
  });

  it('spends in roster order rather than the order asked for', () => {
    /*
     * Shipped, and the proof is that asking backwards produces the same
     * result. A port that walked the request would hand the last level to
     * whoever the player named first.
     */
    const save = saveWith({ gold: 1e6, heroes: six });
    const forwards = batchLevelHeroes(save, CONTENT, ['a', 'b', 'c'], 'max')!;
    const backwards = batchLevelHeroes(save, CONTENT, ['c', 'b', 'a'], 'max')!;
    expect(six.map(hero => levelOf(backwards, hero.uid))).toEqual(six.map(hero => levelOf(forwards, hero.uid)));
  });
});

describe('recycling', () => {
  it('pays shards and takes the hero off the roster', () => {
    const save = saveWith({
      heroes: [
        { id: 'h1', uid: 'a', level: 20, rarity: 'rare' },
        { id: 'h3', uid: 'b' },
      ],
    });
    const next = recycleHero(save, 'a', 1)!;
    expect(next.roster.heroes.map(hero => hero.uid)).toEqual(['b']);
    expect(next.wallet.heroShards).toBeGreaterThan(save.wallet.heroShards);
  });

  it('spares a hero who is fighting', () => {
    // Recycling a fielded hero would empty the line the player chose.
    const save = saveWith({ heroes: [{ id: 'h1', uid: 'a' }], activeUids: ['a'] });
    expect(recycleHero(save, 'a', 1)).toBeNull();
  });

  it('spares a hero carrying their relic', () => {
    // The relic has no other home, so recycling its bearer destroys it.
    const save = saveWith({
      heroes: [
        { id: 'h1', uid: 'a' },
        { id: 'h3', uid: 'b' },
      ],
      uniqueByHeroId: { h1: { rank: 3, equippedByUid: 'a' } },
    });
    expect(recycleHero(save, 'a', 1)).toBeNull();
    expect(recycleHero(save, 'b', 1)).not.toBeNull();
  });

  it('takes them out of the saved lineups too', () => {
    /*
     * Otherwise loading a loadout silently fields a shorter team and the
     * player never learns why — the roster row is gone but the lineup still
     * names it.
     */
    const save = saveWith({
      heroes: [
        { id: 'h1', uid: 'a' },
        { id: 'h3', uid: 'b' },
      ],
      loadouts: [['a', 'b'], [], []],
      formationByUid: { a: 'front' },
    });
    const next = recycleHero(save, 'a', 1)!;
    expect(next.roster.loadouts[0]).toEqual(['b']);
    expect(next.roster.formationByUid.a).toBeUndefined();
  });

  it('pays the weekly rate', () => {
    const save = saveWith({ heroes: [{ id: 'h1', uid: 'a', level: 40, rarity: 'epic' }] });
    const flat = recycleHero(save, 'a', 1)!.wallet.heroShards;
    const doubled = recycleHero(save, 'a', 2)!.wallet.heroShards;
    expect(doubled).toBeGreaterThan(flat);
  });
});

describe('the team', () => {
  const five = [
    { id: 'h1', uid: 'a' },
    { id: 'h3', uid: 'b' },
    { id: 'h5', uid: 'c' },
    { id: 'h7', uid: 'd' },
    { id: 'h9', uid: 'e' },
  ];

  it('fields who the rules allow, not who was asked for', () => {
    /*
     * The warrior, the berserker and the monk all want the front rank and a
     * rank holds two, so asking for all five fields **four** — the rules are
     * `normalizeTeamSelection`'s, replayed rather than reimplemented.
     *
     * Asserted as a count rather than as "no more than asked for", which was
     * the first version and passed for a build that simply trusted the
     * request.
     */
    const save = saveWith({ heroes: five, slotsUnlocked: ACTIVE_TEAM_SIZE });
    const next = fieldTeam(save, CONTENT, ['a', 'b', 'c', 'd', 'e'])!;
    expect(next.roster.activeUids).toHaveLength(4);
    // The archer and the mage are the only ones with a rank to themselves, so
    // both survive whichever front-ranker is dropped.
    expect(next.roster.activeUids).toContain('c');
    expect(next.roster.activeUids).toContain('d');
  });

  it('refuses a request that changes nothing', () => {
    const save = saveWith({ heroes: five, activeUids: ['a'], slotsUnlocked: ACTIVE_TEAM_SIZE });
    expect(fieldTeam(save, CONTENT, ['a'])).toBeNull();
  });

  it('moves a hero to a rank their class may hold, and refuses one it may not', () => {
    // A mage may only stand at mid; a warrior only at front.
    const save = saveWith({ heroes: five, activeUids: ['d'], slotsUnlocked: ACTIVE_TEAM_SIZE });
    expect(placeHero(save, CONTENT, 'd', 'mid')!.roster.formationByUid.d).toBe('mid');
    expect(placeHero(save, CONTENT, 'd', 'front')).toBeNull();
    expect(placeHero(save, CONTENT, 'a', 'back')).toBeNull();
  });

  it('stores a lineup and recalls it', () => {
    const save = saveWith({ heroes: five, activeUids: ['a', 'c'], slotsUnlocked: ACTIVE_TEAM_SIZE });
    const stored = storeLoadout(save, 1);
    expect(stored.roster.loadouts[1]).toEqual(['a', 'c']);

    const moved = fieldTeam(stored, CONTENT, ['b'])!;
    expect(moved.roster.activeUids).toEqual(['b']);
    expect(recallLoadout(moved, CONTENT, 1)!.roster.activeUids).toEqual(['a', 'c']);
  });

  it('replays a recalled lineup through the rules rather than trusting it', () => {
    /*
     * A stored lineup is a claim, not a fact. It can name three front-rankers
     * — legal to *store*, because storing writes whatever is fielded and the
     * rules already refused the third — or a hero since recycled. Trusting it
     * would field a team the game says cannot stand together.
     *
     * Written into the save by hand, because `storeLoadout` can only ever
     * store a team that was already legal.
     */
    const save: SaveV3 = {
      ...saveWith({ heroes: five, slotsUnlocked: ACTIVE_TEAM_SIZE }),
      roster: {
        ...saveWith({ heroes: five, slotsUnlocked: ACTIVE_TEAM_SIZE }).roster,
        // a, b and e all want the front rank, which holds two.
        loadouts: [['a', 'b', 'e'], [], []],
      },
    };
    const recalled = recallLoadout(save, CONTENT, 0)!;
    expect(recalled.roster.activeUids).toHaveLength(2);
  });

  it('clamps a loadout slot rather than rejecting it, as shipped', () => {
    // Asking for slot 99 writes slot 2. Rejecting would be safer and would
    // silently drop a save the shipped app accepted.
    const save = saveWith({ heroes: five, activeUids: ['a'], slotsUnlocked: ACTIVE_TEAM_SIZE });
    expect(storeLoadout(save, 99).roster.loadouts[2]).toEqual(['a']);
  });
});

describe('buying a team slot', () => {
  const rule = TEAM_SLOT_UNLOCK_RULES[MIN_TEAM_SLOTS + 1];

  it('takes both currencies and raises the cap by one', () => {
    const save = saveWith({
      gold: rule.goldCost,
      heroShards: rule.shardCost,
      highestWave: rule.requiredWave,
    });
    const next = buySlot(save)!;
    expect(next.roster.slotsUnlocked).toBe(MIN_TEAM_SLOTS + 1);
    expect(next.wallet.gold).toBe(0);
    expect(next.wallet.heroShards).toBe(0);
  });

  it('refuses a player who has not been deep enough, however rich', () => {
    // The sixth slot asks for twice the wave the fifth did, so money alone
    // never buys it.
    const save = saveWith({ gold: 1e9, heroShards: 1e9, highestWave: rule.requiredWave - 1 });
    expect(buySlot(save)).toBeNull();
  });

  it('refuses a player who cannot pay, however deep', () => {
    const save = saveWith({ gold: 0, heroShards: 1e9, highestWave: 1_000 });
    expect(buySlot(save)).toBeNull();
  });

  it('runs out at the sixth', () => {
    const save = saveWith({ gold: 1e9, heroShards: 1e9, highestWave: 1_000, slotsUnlocked: ACTIVE_TEAM_SIZE });
    expect(buySlot(save)).toBeNull();
  });
});
