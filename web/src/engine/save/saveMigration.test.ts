import { describe, expect, it } from 'vitest';
import type { PlayerClass } from '../../content/classes';
import { RARITY_BOOST_MULTIPLIER } from '../../content/rarities';
import { MAX_FORMATION_ROLE_HEROES, VALID_FORMATION_ROLES_FOR_CLASS } from '../combat/formation';
import { roundTo4 } from '../math/safe';
import { MAX_SAVE_PLAYER_LEVEL, MAX_SAVE_WAVE, SAFE_NUMBER_CAP } from './guards';
import {
  CLAIMED_V2_KEYS,
  MAX_FORMATION_ROLE_HEROES_IN_SELECTION,
  expForLevel,
  migrateSave,
  readStatAllocation,
} from './migrate';
import { SAVE_VERSION, type SaveContent } from './schema';
import fixture from './__fixtures__/v2-saves.json';

/**
 * The new side of the save contract.
 * `__tests__/saveMigrationFixture.test.ts` owns the other.
 *
 * Unlike the damage fixtures, the thing being protected here is not a number
 * being right — it is an account not being emptied. The dormant saves this has
 * to read were written by a build nobody is running any more, and there is no
 * second copy.
 */

/** Mirror of the fixture's encoder. See the note there for why it exists. */
const SPECIAL_NUMBERS: Record<string, number> = {
  __NaN__: Number.NaN,
  __Infinity__: Number.POSITIVE_INFINITY,
  '__-Infinity__': Number.NEGATIVE_INFINITY,
};

function decodeSpecials(value: unknown): unknown {
  if (typeof value === 'string' && value in SPECIAL_NUMBERS) return SPECIAL_NUMBERS[value];
  if (Array.isArray(value)) return value.map(decodeSpecials);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decodeSpecials(entry)]));
  }
  return value;
}

const CONTENT: SaveContent = {
  heroesById: new Map(
    fixture.heroTemplates.map(template => [
      template.id,
      { heroClass: template.heroClass as PlayerClass, baseTeamBoost: template.baseTeamBoost },
    ]),
  ),
};

const NOW = fixture.nowMs;

function migrateCase(name: string) {
  const entry = fixture.cases.find(candidate => candidate.name === name);
  if (!entry) throw new Error(`no fixture case named ${name}`);
  return {
    entry,
    payload: decodeSpecials(entry.payload) as Record<string, unknown>,
    result: migrateSave(decodeSpecials(entry.payload), { nowMs: NOW, content: CONTENT }),
  };
}

describe('the codec for numbers JSON cannot hold', () => {
  it('decodes the sentinels the fixture writes', () => {
    expect(decodeSpecials({ a: '__NaN__', b: ['__Infinity__', '__-Infinity__'], c: 'plain' })).toEqual({
      a: Number.NaN,
      b: [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
      c: 'plain',
    });
  });

  it('is actually exercised by the fixture, not just present', () => {
    // If the hostile case ever stops carrying a non-finite value, the decoder
    // silently stops being tested by the migration cases below.
    const serialized = JSON.stringify(fixture.cases.find(entry => entry.name === 'hostile'));
    expect(serialized).toContain('__NaN__');
  });

  it('has a case whose summon counters are not all zero', () => {
    /*
     * Same reasoning, for the slice Phase 8 claimed. Every other case carries
     * a pity counter of zero and no milestones, so the round-trip law and the
     * comparison below would both hold for a reader that returned constants.
     */
    const midGacha = fixture.cases.find(entry => entry.name === 'mid-gacha');
    expect(midGacha?.expected.summon.pityCounter).toBeGreaterThan(0);
    expect(midGacha?.expected.summon.claimedMilestones.length).toBeGreaterThan(0);
    expect(midGacha?.expected.summon.guaranteedMinRarity).not.toBeNull();
  });
});

describe('migrating every fixture case', () => {
  it('reproduces the shipped reader on all of them', () => {
    expect(fixture.cases.length).toBeGreaterThanOrEqual(9);

    for (const entry of fixture.cases) {
      const result = migrateSave(decodeSpecials(entry.payload), { nowMs: NOW, content: CONTENT });
      expect({
        name: entry.name,
        identity: result.identity,
        progression: result.progression,
        stats: result.stats,
        wallet: result.wallet,
        summon: result.summon,
        roster: result.roster,
        lastActiveAt: result.awayAtMs,
      }).toEqual({
        name: entry.name,
        identity: entry.expected.identity,
        progression: entry.expected.progression,
        stats: entry.expected.stats,
        wallet: entry.expected.wallet,
        summon: entry.expected.summon,
        roster: entry.expected.roster,
        lastActiveAt: entry.expected.lastActiveAt,
      });
    }
  });

  it('stamps every result as v3 regardless of what the payload claimed', () => {
    for (const entry of fixture.cases) {
      const result = migrateSave(decodeSpecials(entry.payload), { nowMs: NOW, content: CONTENT });
      expect(result.version).toBe(SAVE_VERSION);
    }
    // Including the one claiming to be from the future.
    expect(migrateCase('hostile').payload.saveVersion).toBe(99);
    expect(migrateCase('hostile').result.version).toBe(3);
  });
});

describe('nothing is dropped', () => {
  it('carries every unclaimed v2 key through verbatim', () => {
    const { payload, result } = migrateCase('veteran');
    const claimed = new Set(CLAIMED_V2_KEYS);

    for (const [key, value] of Object.entries(payload)) {
      if (claimed.has(key)) continue;
      expect({ key, value: result.legacy[key] }).toEqual({ key, value });
    }
  });

  it('leaves a real account with a substantial legacy blob, not an empty one', () => {
    // A v2 save is about 120 fields and this migration types roughly 35 of
    // them. If `legacy` ever came back near-empty it would mean the carry had
    // silently stopped working, and the loss would not surface until someone
    // went looking for a field years later.
    const { result } = migrateCase('veteran');
    expect(Object.keys(result.legacy).length).toBeGreaterThan(60);
    expect(result.legacy.achievements).toBeDefined();
    expect(result.legacy.equippedItems).toBeDefined();
    expect(result.legacy.classMasteryXp).toBeDefined();
  });

  it('partitions the payload: every key is either claimed or carried', () => {
    for (const entry of fixture.cases) {
      const payload = decodeSpecials(entry.payload) as Record<string, unknown>;
      const result = migrateSave(payload, { nowMs: NOW, content: CONTENT });
      const claimed = new Set(CLAIMED_V2_KEYS);
      const accounted = new Set([...Object.keys(result.legacy), ...Object.keys(payload).filter(k => claimed.has(k))]);
      expect({ name: entry.name, missing: Object.keys(payload).filter(key => !accounted.has(key)) }).toEqual({
        name: entry.name,
        missing: [],
      });
    }
  });

  it('never lets a claimed key also sit in legacy', () => {
    const { result } = migrateCase('veteran');
    const overlap = CLAIMED_V2_KEYS.filter(key => key in result.legacy);
    expect(overlap).toEqual([]);
  });
});

describe('the migrations that are driven by shape, not by version', () => {
  it('reads the pre-v2 highestLevelReached spelling', () => {
    const { payload, result } = migrateCase('pre-v2-field-names');
    expect(payload.saveVersion).toBeUndefined();
    expect(payload.highestWaveReached).toBeUndefined();
    expect(result.progression.highestWave).toBe(175);
  });

  it('reads a bare rank number where v2 stores a record', () => {
    const { result } = migrateCase('pre-v2-unique-gear-number');
    expect(result.roster.uniqueByHeroId.h1.rank).toBe(7);
    // Two copies of h1; the epic outranks the common, so it takes the relic.
    expect(result.roster.uniqueByHeroId.h1.equippedByUid).toBe('r2');
  });

  it('reads the intermediate `equipped` boolean', () => {
    const { result } = migrateCase('unique-gear-unequipped-flag');
    expect(result.roster.uniqueByHeroId.h1).toEqual({ rank: 4, equippedByUid: null });
    // h7 is flagged equipped but no h7 is in the roster, so there is no bearer.
    expect(result.roster.uniqueByHeroId.h7).toEqual({ rank: 2, equippedByUid: null });
  });

  it('re-derives the relic bearer instead of trusting the stored uid', () => {
    const { payload, result } = migrateCase('veteran');
    const stored = payload.heroUniqueGearByHeroId as Record<string, { equippedByUid: string }>;
    // The save says w2 carries it. w2 is a rare at level 40; w1 is a legendary
    // at level 300, so the reader moves the relic. That is not a correction of
    // the save — it is how the shipped game behaves when the better copy of a
    // hero exists, and a port that trusted the uid would quietly nerf accounts.
    expect(stored.h1.equippedByUid).toBe('w2');
    expect(result.roster.uniqueByHeroId.h1.equippedByUid).toBe('w1');
  });
});

describe('what a dormant account keeps', () => {
  it('keeps stat points spent beyond what the level now grants', () => {
    const { result } = migrateCase('over-allocated-stats');
    const spent = Object.values(result.stats.alloc).reduce((sum, value) => sum + value, 0);
    expect(spent).toBe(900);
    expect(result.stats.unspent).toBe(40);
  });

  it('tops up unspent points when the level budget exceeds the spend', () => {
    // Level 40 grants 195 points; 15 are spent, so 180 come back unspent.
    const { alloc, unspent } = readStatAllocation({ strength: 15 }, 40, 0);
    expect(alloc.strength).toBe(15);
    expect(unspent).toBe(180);
  });

  it('adds the saved unspent pool on top in both directions', () => {
    // Under budget: budget - spent + saved.
    expect(readStatAllocation({ strength: 15 }, 40, 7).unspent).toBe(187);
    // Over budget: the saved pool survives and nothing is confiscated.
    expect(readStatAllocation({ strength: 900 }, 12, 7).unspent).toBe(7);
  });

  it('keeps a wallet past the point where integers stop being exact', () => {
    const { result } = migrateCase('wallet-past-2-53');
    expect(result.wallet.gold).toBe(1e30);
    expect(result.wallet.essence).toBe(1e40);
    // The shipped "cap" is Number.MAX_VALUE, so it caps nothing. Ported at its
    // shipped value: tightening it would delete currency from exactly the
    // accounts this migration exists to protect.
    expect(SAFE_NUMBER_CAP).toBe(Number.MAX_VALUE);
  });

  it('raises lifetime gold to current gold but leaves lifetime exp alone', () => {
    const asymmetric = migrateSave(
      { playerName: 'A', playerClass: 'mage', characterCreated: true, gold: 500, totalGold: 1, exp: 50, totalExp: 1 },
      { nowMs: NOW, content: CONTENT },
    );
    expect(asymmetric.wallet.totalGold).toBe(500);
    // Shipped asymmetry, pinned rather than fixed: a save can report having
    // earned less exp in its life than it currently holds.
    expect(asymmetric.progression.totalExp).toBe(1);
  });
});

describe('a save that is wrong in every way', () => {
  it('drops roster rows whose hero template no longer exists', () => {
    const { payload, result } = migrateCase('hostile');
    const ids = (payload.heroRoster as { id?: string }[]).map(entry => entry?.id);
    expect(ids).toContain('does_not_exist');
    expect(result.roster.heroes.map(entry => entry.id)).not.toContain('does_not_exist');
  });

  it('keeps the first of two rows sharing a uid', () => {
    const { result } = migrateCase('hostile');
    const dup = result.roster.heroes.filter(entry => entry.uid === 'dup');
    expect(dup.length).toBe(1);
    // The warrior came first in the array, so the berserker is the one dropped.
    expect(dup[0].id).toBe('h1');
  });

  it('raises a hero whose stored team boost is below their own base', () => {
    const { result } = migrateCase('hostile');
    const mage = result.roster.heroes.find(entry => entry.uid === 'm9')!;
    const template = CONTENT.heroesById.get(mage.id)!;
    expect(mage.teamBoost).toBe(roundTo4(template.baseTeamBoost * RARITY_BOOST_MULTIPLIER.common));
    expect(mage.teamBoost).toBeGreaterThan(0.000_001);
  });

  it('drops a formation role the hero class may not hold', () => {
    const { payload, result } = migrateCase('hostile');
    // A mage is a mid-rank class and `dup` is a warrior, who is front-only.
    expect(payload.heroFormationByUid).toEqual({ m9: 'front', dup: 'mid', ghost: 'back' });
    expect(result.roster.formationByUid).toEqual({});
  });

  it('turns non-finite and wrongly-typed scalars into defaults', () => {
    const { payload, result } = migrateCase('hostile');
    expect(Number.isNaN(payload.level)).toBe(true);
    expect(payload.exp).toBe(Number.POSITIVE_INFINITY);
    expect(result.progression.level).toBe(1);
    expect(result.progression.exp).toBe(0);
    expect(result.progression.wave).toBe(1);
    // A string where a number belongs falls back rather than parsing.
    expect(payload.highestWaveReached).toBe('eleven');
    expect(result.progression.highestWave).toBe(1);
  });

  it('trims and truncates a hostile player name', () => {
    const { result } = migrateCase('hostile');
    expect(result.identity.name).toBe('an extremely long player');
    expect(result.identity.name.length).toBe(24);
  });

  it('disbelieves a created character with no class', () => {
    const { payload, result } = migrateCase('hostile');
    expect(payload.characterCreated).toBe(true);
    expect(payload.playerClass).toBe('necromancer');
    expect(result.identity.playerClass).toBe(null);
    expect(result.identity.created).toBe(false);
  });

  it('survives an empty payload', () => {
    const result = migrateSave({}, { nowMs: NOW, content: CONTENT });
    expect(result.identity).toEqual({ name: '', playerClass: null, created: false });
    expect(result.progression.level).toBe(1);
    expect(result.roster.heroes).toEqual([]);
    expect(result.roster.loadouts).toEqual([[], [], []]);
    expect(result.legacy).toEqual({});
  });

  it('survives a payload that is not an object at all', () => {
    for (const junk of [null, undefined, 42, 'a string', [1, 2, 3]]) {
      expect(migrateSave(junk, { nowMs: NOW, content: CONTENT }).version).toBe(SAVE_VERSION);
    }
  });
});

describe('team selection is replayed, not trusted', () => {
  it('admits one copy per hero template', () => {
    const { payload, result } = migrateCase('veteran');
    // The save asks for both w1 and w2, which are two copies of h1.
    expect(payload.activeTeamHeroIds).toContain('w2');
    expect(result.roster.activeUids).not.toContain('w2');
    expect(result.roster.activeUids).toContain('w1');
  });

  it('honours the stored order when deciding which copy survives', () => {
    // w1 comes first in the saved team, so w1 is the one kept. Reversing the
    // stored order reverses the answer — the player's priority is the input.
    const { payload } = migrateCase('veteran');
    const reversed = migrateSave(
      { ...payload, activeTeamHeroIds: ['w2', 'w1', 'b1', 'a1'] },
      { nowMs: NOW, content: CONTENT },
    );
    expect(reversed.roster.activeUids).toContain('w2');
    expect(reversed.roster.activeUids).not.toContain('w1');
  });

  it('enforces the per-rank cap on selection, not just on the combat bonus', () => {
    const { payload } = migrateCase('veteran');
    // w1, b1 and a third front-rank hero: the third does not fit.
    const crowded = migrateSave(
      {
        ...payload,
        heroRoster: [
          ...(payload.heroRoster as Record<string, unknown>[]),
          { id: 'h2', uid: 'w3', rarity: 'common', level: 10, rank: 1 },
        ],
        heroFormationByUid: { ...(payload.heroFormationByUid as object), w3: 'front' },
        activeTeamHeroIds: ['w1', 'b1', 'w3', 'a1'],
      },
      { nowMs: NOW, content: CONTENT },
    );
    expect(crowded.roster.activeUids).toEqual(['w1', 'b1', 'a1']);
  });

  it('keeps the selection cap and the combat cap equal, or says so', () => {
    // Two constants, deliberately not one import: changing the combat cap must
    // not silently invalidate teams people already have saved. If they ever
    // need to differ, this failing is the place to decide that.
    expect(MAX_FORMATION_ROLE_HEROES_IN_SELECTION).toBe(MAX_FORMATION_ROLE_HEROES);
    expect(MAX_FORMATION_ROLE_HEROES_IN_SELECTION).toBe(2);
  });

  it('respects the account slot count rather than the array length', () => {
    const { payload } = migrateCase('veteran');
    const narrow = migrateSave({ ...payload, teamSlotsUnlocked: 4 }, { nowMs: NOW, content: CONTENT });
    expect(narrow.roster.slotsUnlocked).toBe(4);
    expect(narrow.roster.activeUids.length).toBe(4);
  });

  it('runs loadouts through the same rules as the active team', () => {
    const { result } = migrateCase('veteran');
    // Saved as ['b1','w1','k1']; all three are legal and distinct templates.
    expect(result.roster.loadouts[2]).toEqual(['b1', 'w1', 'k1']);
    expect(result.roster.loadouts.length).toBe(3);
  });

  it('falls back to the class default rank when no role is stored', () => {
    // Three archers with nothing stored all default to `back`, which holds
    // two, so the third does not fit. This is the path with no
    // `formationByUid` entry at all, which every fresh save takes.
    const archers = migrateSave(
      {
        playerName: 'Bows',
        playerClass: 'archer',
        characterCreated: true,
        teamSlotsUnlocked: 6,
        heroRoster: ['h5', 'h6', 'h13'].map((id, index) => ({
          id,
          uid: `x${index + 1}`,
          rarity: 'common',
          level: 1,
          rank: 1,
        })),
        activeTeamHeroIds: ['x1', 'x2', 'x3'],
      },
      { nowMs: NOW, content: CONTENT },
    );
    for (const id of ['h5', 'h6', 'h13']) {
      expect(CONTENT.heroesById.get(id)?.heroClass).toBe('archer');
    }
    expect(VALID_FORMATION_ROLES_FOR_CLASS.archer).toEqual(['back']);
    expect(archers.roster.activeUids).toEqual(['x1', 'x2']);
  });

  it('defaults a monk to front, the first of their two legal ranks', () => {
    // The monk is the only class with a choice, and the default is `front`.
    // That is also the class the shipped formation bug bites, so a save that
    // stores `mid` for a monk has to keep storing it — the fix, when it comes,
    // reads this field.
    const monks = migrateSave(
      {
        playerName: 'Fists',
        playerClass: 'monk',
        characterCreated: true,
        teamSlotsUnlocked: 6,
        heroRoster: ['h9', 'h10', 'h15'].map((id, index) => ({
          id,
          uid: `k${index + 1}`,
          rarity: 'common',
          level: 1,
          rank: 1,
        })),
        heroFormationByUid: { k3: 'mid' },
        activeTeamHeroIds: ['k1', 'k2', 'k3'],
      },
      { nowMs: NOW, content: CONTENT },
    );
    expect(VALID_FORMATION_ROLES_FOR_CLASS.monk).toEqual(['front', 'mid']);
    // k1 and k2 fill `front`; k3 is stored as `mid`, so all three fit.
    expect(monks.roster.formationByUid).toEqual({ k3: 'mid' });
    expect(monks.roster.activeUids).toEqual(['k1', 'k2', 'k3']);
  });
});

describe('bounds ported from the shipped reader', () => {
  it('bounds level and wave at a million', () => {
    const huge = migrateSave({ level: 9e9, wave: 9e9 }, { nowMs: NOW, content: CONTENT });
    expect(huge.progression.level).toBe(MAX_SAVE_PLAYER_LEVEL);
    expect(huge.progression.wave).toBe(MAX_SAVE_WAVE);
    expect(MAX_SAVE_PLAYER_LEVEL).toBe(1_000_000);
  });

  it('bounds exp by the level that holds it', () => {
    const level10 = migrateSave({ level: 10, exp: 1e9 }, { nowMs: NOW, content: CONTENT });
    expect(level10.progression.exp).toBe(expForLevel(10) - 1);
    expect(expForLevel(10)).toBe(Math.floor(80 * Math.pow(1.16, 9)));
  });

  it('never lets highestWave fall below the current wave', () => {
    const behind = migrateSave({ wave: 500, highestWaveReached: 3 }, { nowMs: NOW, content: CONTENT });
    expect(behind.progression.highestWave).toBe(500);
  });

  it('caps the roster at five hundred rows', () => {
    const overflowing = migrateSave(
      {
        heroRoster: Array.from({ length: 700 }, (_, i) => ({
          id: 'h1',
          uid: `u${i}`,
          rarity: 'common',
          level: 1,
          rank: 1,
        })),
      },
      { nowMs: NOW, content: CONTENT },
    );
    expect(overflowing.roster.heroes.length).toBe(500);
  });
});
