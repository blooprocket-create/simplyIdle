import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { readFileSync as read } from 'fs';
import { USABLE_ITEMS, rollUsableItem, type PlayerClass } from '../src/gameConfig';
import { DEFAULT_STATE, reducer, type GameState } from '../src/useGameState';

/**
 * Reference behaviour for usable items: the eight of them, how they drop, and
 * what using one is worth.
 *
 * The last is the part a port guesses wrong. A usable is **not** worth its
 * `value`: each gain is the larger of a scaled base and a *wave floor*, so a
 * deep account's Gold Cache pays what three of their monsters pay rather than
 * the 350 written on it. The three gains scale by three different chains, too
 * — gold by VIP gold, EXP by achievements and VIP EXP, shards by the weekly
 * event — so one shared multiplier is wrong on two of them.
 *
 * Driven through the real reducer, because every one of those functions is
 * private and **duplicated**: `economyReducer.ts` and `useGameState.ts` each
 * carry their own copy of all four, exactly as the prestige cost formulas do.
 * There is a tripwire below asserting the copies agree.
 *
 * Regenerate deliberately:
 *   UPDATE_USABLE_FIXTURE=1 npx jest __tests__/usableItemFixture.test.ts
 */

const FIXTURE_PATH = join(__dirname, '..', 'web', 'src', 'content', '__fixtures__', 'usable-items.json');

/** `no_armor_week`; the shard scaling reads the weekly event. */
const PINNED_WEEK = 0;

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    ...DEFAULT_STATE,
    playerName: 'Ref',
    playerClass: 'warrior' as PlayerClass,
    characterCreated: true,
    weeklyEventWeek: PINNED_WEEK,
    teamHp: 100,
    teamMaxHp: 1_000,
    ...overrides,
  };
}

interface Fixture {
  note: string;
  generatedFrom: string;
  /** The catalogue, verbatim. */
  items: {
    id: string;
    name: string;
    itemType: string;
    effect: string;
    value: number;
    dropWeight: number;
  }[];
  /** Which item a roll returns, from each pool. */
  rolls: { roll: number; basic: string; advanced: string }[];
  /** Using one, at accounts of different depth. */
  uses: {
    name: string;
    itemId: string;
    held: number;
    amount: number | 'all';
    level: number;
    highestWave: number;
    prestige: number;
    vip: number;
    gold: number;
    exp: number;
    shards: number;
    teamHp: number;
    remaining: number;
  }[];
  /** The two copies of every scaling function, and whether they agree. */
  duplicatedFunctions: { name: string; inBothFiles: boolean; agree: boolean }[];
}

function buildItems(): Fixture['items'] {
  return USABLE_ITEMS.map(item => ({
    id: item.id,
    name: item.name,
    itemType: item.itemType,
    effect: item.effect,
    value: item.value,
    dropWeight: item.dropWeight,
  }));
}

/**
 * The roll boundaries, from both pools.
 *
 * `rollUsableItem` walks a cumulative weight and returns on `cursor <= 0`, so
 * the boundaries are where one item gives way to the next — and the two
 * coolants, whose weight is **zero**, can never be returned by it at all.
 */
function buildRolls(): Fixture['rolls'] {
  const rolls = [0, 0.001, 0.2, 0.44, 0.45, 0.46, 0.72, 0.73, 0.92, 0.93, 0.999, 1];
  return rolls.map(roll => ({
    roll,
    basic: rollUsableItem(roll, false).id,
    advanced: rollUsableItem(roll, true).id,
  }));
}

function buildUses(): Fixture['uses'] {
  const cases: { name: string; itemId: string; held: number; amount: number | 'all'; over: Partial<GameState> }[] = [
    { name: 'potion, shallow', itemId: 'small_potion', held: 1, amount: 1, over: {} },
    { name: 'gold, shallow', itemId: 'gold_cache', held: 1, amount: 1, over: {} },
    { name: 'gold, deep', itemId: 'gold_cache', held: 1, amount: 1, over: { level: 200, highestWaveReached: 400 } },
    {
      name: 'gold, deep and prestiged',
      itemId: 'gold_cache',
      held: 1,
      amount: 1,
      over: { level: 200, highestWaveReached: 400, prestigeCount: 6 },
    },
    { name: 'gold, shallow and prestiged', itemId: 'gold_cache', held: 1, amount: 1, over: { prestigeCount: 6 } },
    { name: 'gold, vip', itemId: 'gold_cache', held: 1, amount: 1, over: { vipLevel: 8 } },
    { name: 'exp, shallow', itemId: 'exp_scroll', held: 1, amount: 1, over: {} },
    { name: 'exp, deep', itemId: 'exp_scroll', held: 1, amount: 1, over: { level: 200, highestWaveReached: 400 } },
    { name: 'shards, shallow', itemId: 'shard_cluster', held: 1, amount: 1, over: {} },
    {
      name: 'shards, deep',
      itemId: 'shard_cluster',
      held: 1,
      amount: 1,
      over: { level: 200, highestWaveReached: 400 },
    },
    { name: 'grand potion', itemId: 'grand_potion', held: 1, amount: 1, over: {} },
    { name: 'vault cache', itemId: 'vault_cache', held: 1, amount: 1, over: {} },
    { name: 'three at once', itemId: 'gold_cache', held: 5, amount: 3, over: {} },
    { name: 'all of them', itemId: 'gold_cache', held: 4, amount: 'all', over: {} },
    { name: 'more than held', itemId: 'gold_cache', held: 2, amount: 9, over: {} },
    { name: 'none held', itemId: 'gold_cache', held: 0, amount: 1, over: {} },
  ];

  return cases.map(entry => {
    const before = state({ ...entry.over, usableItemCounts: { [entry.itemId]: entry.held } });
    const after = reducer(before, { type: 'USE_USABLE_ITEM', itemId: entry.itemId, amount: entry.amount } as never);
    return {
      name: entry.name,
      itemId: entry.itemId,
      held: entry.held,
      amount: entry.amount,
      level: before.level,
      highestWave: before.highestWaveReached,
      prestige: before.prestigeCount,
      vip: before.vipLevel,
      gold: after.gold - before.gold,
      exp: after.totalExp - before.totalExp,
      shards: after.heroShards - before.heroShards,
      teamHp: after.teamHp - before.teamHp,
      remaining: after.usableItemCounts[entry.itemId] ?? 0,
    };
  });
}

/**
 * The four scaling functions exist **twice** in the shipped tree.
 *
 * `economyReducer.ts` charges with its copies and `useGameState.ts` quotes
 * with its own, with nothing keeping them in step — the same fault the
 * prestige fixture found in the cost formulas. Compared as source text,
 * because there is no other way to compare two private functions.
 */
function duplicatedFunctions(): Fixture['duplicatedFunctions'] {
  const names = [
    'getUsableProgressScale',
    'getScaledUsableGoldGain',
    'getScaledUsableExpGain',
    'getScaledUsableShardGain',
  ];
  const hook = read(join(__dirname, '..', 'src', 'useGameState.ts'), 'utf8');
  const economy = read(join(__dirname, '..', 'src', 'reducers', 'economyReducer.ts'), 'utf8');

  return names.map(name => {
    const inHook = bodyOf(hook, name);
    const inReducer = bodyOf(economy, name);
    return {
      name,
      inBothFiles: inHook !== null && inReducer !== null,
      // Compared, not merely counted. My first version recorded that both
      // copies existed and never looked at either — so changing one of them
      // left this green, which is the whole thing it was supposed to catch.
      agree: inHook !== null && inReducer !== null && inHook === inReducer,
    };
  });
}

/**
 * A function's body, normalised, so two copies can be compared.
 *
 * Braces and whitespace come out along with the `ctx.` prefix the reducer's
 * copies carry. That is not laziness: the two copies of
 * `getScaledUsableGoldGain` differ only in whether a single-statement `if`
 * wears braces, and a comparison that called that a divergence would report
 * three false ones and bury a real one. The cost is that a body differing
 * *only* in where its braces fall would compare equal, which no pair of
 * copy-pasted functions does.
 */
function bodyOf(source: string, name: string): string | null {
  const at = source.indexOf(`function ${name}(`);
  if (at === -1) return null;
  const open = source.indexOf('{', source.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source
          .slice(open, i + 1)
          .replace(/ctx\./g, '')
          .replace(/[{}\s]/g, '');
      }
    }
  }
  return null;
}

function build(): Fixture {
  return {
    note: 'Usable items: the catalogue, the drop roll, and what using one is worth.',
    generatedFrom: 'src/gameConfig.ts USABLE_ITEMS, src/reducers/economyReducer.ts USE_USABLE_ITEM',
    items: buildItems(),
    rolls: buildRolls(),
    uses: buildUses(),
    duplicatedFunctions: duplicatedFunctions(),
  };
}

describe('usable items', () => {
  const fixture = build();
  const item = (id: string) => fixture.items.find(entry => entry.id === id)!;
  const use = (name: string) => fixture.uses.find(entry => entry.name === name)!;

  it('carries eight items across two tiers', () => {
    expect(fixture.items).toHaveLength(8);
    expect(fixture.items.filter(entry => entry.itemType === 'basic')).toHaveLength(4);
    expect(fixture.items.filter(entry => entry.itemType === 'advanced')).toHaveLength(4);
  });

  it('gives the two coolants a drop weight of zero', () => {
    /*
     * So they can never be found. They are shop stock — `BUY_PREMIUM_COOLANT`
     * — and a port that treated every catalogue row as droppable would hand
     * them out free, which is most of the point of selling them.
     */
    expect(item('coolant_mk1').dropWeight).toBe(0);
    expect(item('coolant_mk2').dropWeight).toBe(0);
    expect(fixture.rolls.every(roll => !roll.advanced.startsWith('coolant'))).toBe(true);
  });

  it('rolls out of the basic pool until advanced is unlocked', () => {
    // The same roll gives different items from the two pools, which is the
    // unlock doing something rather than being recorded and ignored.
    expect(fixture.rolls.some(roll => roll.basic !== roll.advanced)).toBe(true);
    expect(fixture.rolls.every(roll => item(roll.basic).itemType === 'basic')).toBe(true);
  });

  it('walks the weights in order, so a roll of nothing takes the first', () => {
    expect(fixture.rolls.find(roll => roll.roll === 0)!.basic).toBe('small_potion');
    expect(fixture.rolls.find(roll => roll.roll === 1)!.basic).toBe('shard_cluster');
  });

  it('heals a share of the team maximum, not a flat amount', () => {
    // 35% of a thousand, and the team was on a hundred.
    expect(use('potion, shallow').teamHp).toBe(Math.ceil(1_000 * item('small_potion').value));
    expect(use('grand potion').teamHp).toBeGreaterThan(use('potion, shallow').teamHp);
  });

  it('pays a deep account far more than the number written on the item', () => {
    /*
     * The finding. A Gold Cache says 350, and a port that granted 350 would be
     * right for exactly one account: a brand new one. Each gain is the larger
     * of a scaled base and a **wave floor** — three of the player's own
     * monsters for a basic item, eight for an advanced one — so at wave 400 it
     * pays orders of magnitude more.
     */
    expect(use('gold, shallow').gold).toBeGreaterThanOrEqual(item('gold_cache').value);
    expect(use('gold, deep').gold).toBeGreaterThan(use('gold, shallow').gold * 100);
    expect(use('exp, deep').exp).toBeGreaterThan(use('exp, shallow').exp);
    expect(use('shards, deep').shards).toBeGreaterThan(use('shards, shallow').shards);
  });

  it('scales a shallow account by the chains, and a deep one not at all', () => {
    /*
     * The finding, and it is the opposite of what I asserted first.
     *
     * Every gain is `max(scaledBase, waveFloor)`. On a shallow account the
     * scaled base wins, so VIP and prestige move it. On a deep one the wave
     * floor wins by twenty orders of magnitude — a Gold Cache at wave 400 pays
     * 8.5e24 — and once it does, **none of the multipliers matter at all**.
     * Prestige, VIP, achievements: all of them vanish into the `max`.
     *
     * Measured: `gold, deep` and `gold, deep and prestiged` are the same
     * number to the last digit, with six rebirths between them.
     */
    expect(use('gold, vip').gold).toBeGreaterThan(use('gold, shallow').gold);
    expect(use('gold, shallow and prestiged').gold).toBeGreaterThan(use('gold, shallow').gold);

    expect(use('gold, deep and prestiged').gold).toBe(use('gold, deep').gold);
  });

  it('uses as many as asked for, and never more than are held', () => {
    expect(use('three at once').remaining).toBe(2);
    expect(use('three at once').gold).toBe(use('gold, shallow').gold * 3);
    expect(use('all of them').remaining).toBe(0);
    expect(use('all of them').gold).toBe(use('gold, shallow').gold * 4);
    // Asking for nine when two are held spends two rather than refusing.
    expect(use('more than held').remaining).toBe(0);
    expect(use('more than held').gold).toBe(use('gold, shallow').gold * 2);
  });

  it('refuses when none are held', () => {
    expect(use('none held').gold).toBe(0);
    expect(use('none held').remaining).toBe(0);
  });

  it('has the same four scaling functions in two files', () => {
    /*
     * Recorded rather than fixed, and this is a claim about the shipped tree:
     * `economyReducer.ts` charges with its copies and `useGameState.ts` quotes
     * with its own. The port carries one of each, so this exists to say why
     * the duplication was not reproduced.
     */
    expect(fixture.duplicatedFunctions.map(entry => entry.name)).toEqual([
      'getUsableProgressScale',
      'getScaledUsableGoldGain',
      'getScaledUsableExpGain',
      'getScaledUsableShardGain',
    ]);
    expect(fixture.duplicatedFunctions.every(entry => entry.inBothFiles)).toBe(true);

    /*
     * And the copies must **agree**. Recording that two copies exist is not
     * checking them — my first version did only that, so changing one of them
     * left this test green. The bodies are compared as normalised source,
     * which is the only way to compare two private functions, and the port
     * carries one of each precisely so this cannot happen there.
     */
    const diverged = fixture.duplicatedFunctions.filter(entry => !entry.agree).map(entry => entry.name);
    expect(diverged).toEqual([]);
  });

  it('matches the committed fixture the rewrite is measured against', () => {
    if (process.env.UPDATE_USABLE_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(fixture, null, 2)}\n`);
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))).toEqual(fixture);
  });
});
