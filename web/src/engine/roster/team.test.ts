import { describe, expect, it } from 'vitest';
import type { PlayerClass } from '../../content/classes';
import { HERO_POOL, heroTemplatesById } from '../../content/heroes';
import { equipmentTemplatesById } from '../../content/equipment';
import type { FormationRole } from '../combat/formation';
import type { SaveContent } from '../save/schema';
import { HERO_LEVEL_CAP, heroGoldLevelCost } from './progression';
import {
  MAX_FORMATION_ROLE_HEROES,
  type SparkExchangeOption,
  TEAM_SLOT_UNLOCK_RULES,
  batchLevel,
  loadLoadout,
  roleCounts,
  saveLoadout,
  setActiveTeam,
  setFormationRole,
  spendSpark,
  unlockNextSlot,
  unlockedSlotCap,
  type TeamHero,
} from './team';
import fixture from './__fixtures__/team-management.json';

/**
 * Team management, against the shipped game.
 *
 * The fixture drove the real reducer, because nearly everything interesting
 * here is a refusal rather than a formula. What this file checks is that the
 * same requests produce the same refusals — and that the three orderings the
 * fixture exposed are reproduced.
 */

const CONTENT: SaveContent = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };

/** The same two-of-each-class roster the fixture built, in the same order. */
function roster(): TeamHero[] {
  const classes: PlayerClass[] = ['warrior', 'berserker', 'archer', 'mage', 'monk'];
  const out: TeamHero[] = [];
  for (const heroClass of classes) {
    HERO_POOL.filter(entry => entry.heroClass === heroClass)
      .slice(0, 2)
      .forEach((template, index) => {
        out.push({
          id: template.id,
          uid: `${heroClass}${index}`,
          heroClass: template.heroClass,
          rarity: 'common',
          level: 1,
          rank: 1,
          teamBoost: template.baseTeamBoost,
          rebirthStatMult: 1,
        });
      });
  }
  return out;
}

const HEROES = roster();
const NO_FORMATION: Record<string, FormationRole> = {};

const selection = (name: string) => fixture.selections.find(entry => entry.name === name)!;

describe('choosing who is fielded', () => {
  it('produces the shipped selection for every recorded request', () => {
    for (const entry of fixture.selections) {
      const accepted = setActiveTeam(HEROES, NO_FORMATION, CONTENT, entry.slotsUnlocked, entry.requested);
      expect({ name: entry.name, accepted }).toEqual({ name: entry.name, accepted: entry.accepted });
    }
  });

  it('keeps the roster order the fixture recorded', () => {
    // The roster is rebuilt here from `HERO_POOL` rather than read out of the
    // fixture, so a hero leaving the catalogue breaks this loudly instead of
    // quietly changing which team a request produces.
    expect(HEROES.map(entry => entry.uid)).toEqual(fixture.rosterUids);
  });

  it('stops at the per-rank cap rather than at the slot count', () => {
    /*
     * Ten heroes requested into four slots does not give the first four: two
     * warriors fill the front rank, both berserkers are turned away because
     * front already holds its two, and the archers take the remaining places.
     * The cap is what makes a team of four not simply the first four.
     */
    expect(selection('over-slots').accepted).toEqual(['warrior0', 'warrior1', 'archer0', 'archer1']);
    expect(roleCounts(HEROES, NO_FORMATION, selection('over-slots').accepted as string[]).front).toBe(
      MAX_FORMATION_ROLE_HEROES,
    );
  });

  it('clamps the slot count into the range the game allows', () => {
    expect(unlockedSlotCap(0)).toBe(4);
    expect(unlockedSlotCap(99)).toBe(6);
    expect(unlockedSlotCap(Number.NaN)).toBe(4);
  });
});

describe('where a hero stands', () => {
  const ACTIVE = ['warrior0', 'berserker0', 'monk0', 'mage0'];

  it('produces the shipped answer for every recorded request', () => {
    for (const entry of fixture.formations) {
      const next = setFormationRole(HEROES, NO_FORMATION, ACTIVE, entry.uid, entry.role as FormationRole);
      const roleAfter = next?.[entry.uid] ?? null;
      expect({ name: entry.name, accepted: roleAfter === entry.role, roleAfter }).toEqual({
        name: entry.name,
        accepted: entry.accepted,
        roleAfter: entry.roleAfter,
      });
    }
  });

  it('refuses a role the class may not hold', () => {
    // Mages are mid-only. Coercing to a legal role instead of refusing would
    // put a hero somewhere the player did not ask for.
    expect(setFormationRole(HEROES, NO_FORMATION, ACTIVE, 'mage0', 'front')).toBeNull();
    expect(setFormationRole(HEROES, NO_FORMATION, ACTIVE, 'nobody', 'front')).toBeNull();
  });

  it('checks the rank cap only for a hero who is fielded', () => {
    /*
     * The subtlety the fixture exposed. A rank already holding its two refuses
     * a *fielded* hero moving into it — but a benched hero may take any legal
     * role regardless, because the count is taken against the line they are
     * not in.
     *
     * Not an oversight to tidy: it is what lets a player set up a bench before
     * swapping it in. Checking the cap unconditionally would make preparing a
     * second formation impossible.
     */
    const bothFront: Record<string, FormationRole> = { warrior0: 'front', berserker0: 'front' };
    const active = ['warrior0', 'berserker0', 'monk0'];

    // Fielded monk cannot join a full front rank.
    expect(setFormationRole(HEROES, bothFront, active, 'monk0', 'front')).toBeNull();
    // Benched monk can be set to front anyway.
    expect(setFormationRole(HEROES, bothFront, active, 'monk1', 'front')?.monk1).toBe('front');
  });

  it('counts a hero in their class default when nothing is stored', () => {
    // The stored map is sparse — most heroes never have a role written — so a
    // count that only read the map would see an empty front rank.
    expect(roleCounts(HEROES, NO_FORMATION, ['warrior0', 'berserker0'])).toEqual({ front: 2, mid: 0, back: 0 });
  });
});

describe('loadouts', () => {
  it('saves the fielded team and restores it', () => {
    const entry = fixture.loadouts.find(candidate => candidate.name === 'save-then-load')!;
    const saved = saveLoadout([[], [], []], entry.slot, entry.activeBefore as string[]);
    expect(saved[entry.slot]).toEqual(entry.savedSlot);
    expect(loadLoadout(HEROES, NO_FORMATION, CONTENT, 4, saved, entry.slot)).toEqual(entry.activeAfterLoad);
  });

  it('clamps an out-of-range slot instead of rejecting it', () => {
    /*
     * Slot 99 writes slot 2, and loading 99 reads slot 2 back. Rejecting would
     * be safer — but a port that rejected would silently drop a save the
     * shipped app accepted, and the two apps share accounts.
     */
    const entry = fixture.loadouts.find(candidate => candidate.name === 'slot-clamped')!;
    const saved = saveLoadout([[], [], []], 99, entry.activeBefore as string[]);
    expect(saved[2]).toEqual(entry.savedSlot);
    expect(loadLoadout(HEROES, NO_FORMATION, CONTENT, 4, saved, 99)).toEqual(entry.activeAfterLoad);
  });

  it('always keeps three slots, however few it was handed', () => {
    // Padding rather than growing: slot two staying empty must not shift what
    // the player saved in slot three. The save schema relies on this too.
    expect(saveLoadout([], 0, ['warrior0'])).toHaveLength(3);
    expect(saveLoadout([['a']], 2, ['warrior0'])).toEqual([['a'], [], ['warrior0']]);
  });

  it('replays a stored loadout through the selection rules', () => {
    // A loadout saved when a hero was owned must not field them after they are
    // recycled, so loading goes through selection rather than being trusted.
    const stale = [[], ['warrior0', 'gone-hero'], []];
    expect(loadLoadout(HEROES, NO_FORMATION, CONTENT, 4, stale, 1)).toEqual(['warrior0']);
  });
});

describe('unlocking a slot', () => {
  it('produces the shipped answer for every recorded attempt', () => {
    for (const entry of fixture.slotUnlocks) {
      const result = unlockNextSlot({
        slotsUnlocked: entry.from,
        gold: entry.gold,
        heroShards: entry.shards,
        highestWave: entry.highestWave,
      });
      expect({
        name: entry.name,
        slots: result?.slotsUnlocked ?? entry.from,
        gold: result?.gold ?? entry.gold,
        shards: result?.heroShards ?? entry.shards,
      }).toEqual({ name: entry.name, slots: entry.slotsAfter, gold: entry.goldAfter, shards: entry.shardsAfter });
    }
  });

  it('asks a higher wave for the sixth than for the fifth', () => {
    // A player at wave 60 can buy the fifth and not the sixth, however rich.
    expect(TEAM_SLOT_UNLOCK_RULES[5].requiredWave).toBe(50);
    expect(TEAM_SLOT_UNLOCK_RULES[6].requiredWave).toBe(100);
    const rich = { gold: 1e9, heroShards: 1e9, highestWave: 60 };
    expect(unlockNextSlot({ ...rich, slotsUnlocked: 4 })?.slotsUnlocked).toBe(5);
    expect(unlockNextSlot({ ...rich, slotsUnlocked: 5 })).toBeNull();
  });

  it('refuses rather than part-charging when one currency is short', () => {
    const rule = TEAM_SLOT_UNLOCK_RULES[5];
    const base = { slotsUnlocked: 4, highestWave: 100 };
    expect(unlockNextSlot({ ...base, gold: rule.goldCost - 1, heroShards: rule.shardCost })).toBeNull();
    expect(unlockNextSlot({ ...base, gold: rule.goldCost, heroShards: rule.shardCost - 1 })).toBeNull();
    expect(unlockNextSlot({ ...base, gold: rule.goldCost, heroShards: rule.shardCost })).not.toBeNull();
  });

  it('stops at six', () => {
    expect(unlockNextSlot({ slotsUnlocked: 6, gold: 1e9, heroShards: 1e9, highestWave: 1e6 })).toBeNull();
  });
});

describe('batch levelling', () => {
  it('produces the shipped result for every recorded batch', () => {
    for (const entry of fixture.batchLevels) {
      const result = batchLevel(HEROES, entry.requested, entry.mode === 'max' ? 'max' : Number(entry.mode), entry.gold);
      expect({ name: entry.name, levels: result.levelByUid, gold: result.gold }).toEqual({
        name: entry.name,
        levels: entry.levelsAfter,
        gold: entry.goldAfter,
      });
    }
  });

  it('spends in roster order rather than the order asked in', () => {
    /*
     * The ordering the fixture exposed. The shipped loop builds its working set
     * by walking the roster and keeping the selected uids, so when gold runs
     * out partway it is a hero's position in the *roster* that decides who got
     * the last level — not where the player put them in the request.
     *
     * A port that iterated the request would spend the same total and give the
     * levels to different heroes, which is invisible until a player notices
     * the wrong one moved.
     */
    const short = fixture.batchLevels.find(entry => entry.name === 'five-each-short')!;
    expect(short.requested).toEqual(['warrior0', 'mage0', 'archer0']);
    expect(short.levelsAfter.archer0).toBeGreaterThan(short.levelsAfter.mage0);

    // Asked in the other order, the same thing happens — which is the proof
    // that the request order is not what decides it.
    const reversed = batchLevel(HEROES, ['archer0', 'mage0', 'warrior0'], 5, short.gold);
    expect(reversed.levelByUid).toEqual(short.levelsAfter);
  });

  it('skips a step it cannot afford rather than stopping', () => {
    /*
     * `continue`, not `break`. A short purse does not end the batch — the
     * heroes who stay cheap keep levelling while the expensive one stalls.
     * With `break` the cheap heroes would be left unlevelled.
     */
    const expensive: TeamHero[] = [
      { ...HEROES[0], uid: 'rich', level: 200 },
      { ...HEROES[1], uid: 'cheap', level: 1 },
    ];
    // Enough for several of the cheap hero's levels and none of the other's.
    const result = batchLevel(expensive, ['rich', 'cheap'], 3, 400);
    expect(result.levelByUid.rich).toBe(200);
    expect(result.levelByUid.cheap).toBeGreaterThan(1);
  });

  it('buys the cheapest next level first in max mode', () => {
    /*
     * `'max'` is a different algorithm rather than a large count: it maximises
     * total levels bought, so the selection ends within one level of each
     * other instead of one hero running away.
     */
    const max = fixture.batchLevels.find(entry => entry.name === 'max')!;
    const levels = Object.values(max.levelsAfter);
    expect(Math.max(...levels) - Math.min(...levels)).toBeLessThanOrEqual(1);

    // And it stops the moment the cheapest next level is unaffordable, leaving
    // change rather than looping.
    expect(max.goldAfter).toBeLessThan(heroGoldLevelCost(Math.min(...levels)));
  });

  it('does nothing for an empty selection or a zero count', () => {
    expect(batchLevel(HEROES, [], 'max', 1e9)).toEqual({ levelByUid: {}, gold: 1e9 });
    expect(batchLevel(HEROES, ['warrior0'], 0, 1e9)).toEqual({ levelByUid: { warrior0: 1 }, gold: 1e9 });
    // A negative count is floored at zero rather than refunding levels.
    expect(batchLevel(HEROES, ['warrior0'], -5, 1e9)).toEqual({ levelByUid: { warrior0: 1 }, gold: 1e9 });
  });

  it('never levels past the cap', () => {
    const capped: TeamHero[] = [{ ...HEROES[0], uid: 'done', level: HERO_LEVEL_CAP }];
    expect(batchLevel(capped, ['done'], 'max', 1e30)).toEqual({
      levelByUid: { done: HERO_LEVEL_CAP },
      gold: 1e30,
    });
  });
});

describe('the spark exchange', () => {
  /*
   * Its own two-row table rather than the catalogue's six. What is under test
   * here is the *rule* — find the option, check the purse, subtract — and a
   * rule proven against the shipped rows would silently stop being proven the
   * day someone reprices one. The rows themselves are checked against the
   * fixture in `content/summon.test.ts`, which is where they live.
   */
  const OPTIONS: readonly SparkExchangeOption[] = [
    { id: 'cheap', sparkCost: 50, kind: 'free_summon' },
    { id: 'dear', sparkCost: 1_500, kind: 'targeted_hero', minRarity: 'legendary' },
  ];

  it('refuses an unknown option and an unaffordable one', () => {
    expect(spendSpark(OPTIONS, 1e9, 'no-such-option')).toBeNull();
    expect(spendSpark(OPTIONS, 49, 'cheap')).toBeNull();
    expect(spendSpark(OPTIONS, 50, 'cheap')).toEqual({ option: OPTIONS[0], left: 0 });
  });

  it('spends exactly the option’s cost', () => {
    const result = spendSpark(OPTIONS, 2_000, 'dear')!;
    expect(result.option.sparkCost).toBe(1_500);
    expect(result.left).toBe(500);
  });
});
