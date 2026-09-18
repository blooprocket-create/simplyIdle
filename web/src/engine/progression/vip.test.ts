import { describe, expect, it } from 'vitest';
import fixture from '../../content/__fixtures__/shops.json';
import { equipmentTemplatesById } from '../../content/equipment';
import { heroTemplatesById, HERO_POOL } from '../../content/heroes';
import {
  CODEX_VIP_POINTS,
  MAX_VIP_LEVEL,
  VIP_LEVEL_THRESHOLDS,
  VIP_MILESTONES,
  pointsToNextVipLevel,
  vipLevelFromPoints,
} from '../../content/vip';
import { readSave } from '../save/v3';
import type { SaveV3 } from '../save/schema';
import { addVipPoints, readVip, readVipFromLegacy } from '../save/vipSlice';
import { claimableVipLevels, claimVipReward, recordCodexHero, recordCodexUnique, recordEveryCodexEntry } from './vip';

/**
 * VIP, against what the shipped reducers were measured paying.
 *
 * The three verbs here are the only way a VIP level moves in this build, and
 * between them they are the only source of diamonds the rewrite has — which is
 * why they arrive in the same commit as the shop that spends them.
 */

const CONTENT = { heroesById: heroTemplatesById(), equipmentById: equipmentTemplatesById() };
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

function save(over: Record<string, unknown> = {}): SaveV3 {
  return readSave(
    {
      version: 3,
      identity: { name: 'P', playerClass: 'warrior', created: true },
      progression: { level: 40 },
      wallet: { gold: 0, diamonds: 0 },
      ...over,
    },
    { nowMs: NOW, content: CONTENT },
  );
}

/** A save sitting at a chosen level, by giving it the points for it. */
const atLevel = (level: number, over: Record<string, unknown> = {}) =>
  save({ vip: { points: VIP_LEVEL_THRESHOLDS[level], ...over } });

describe('the milestone table', () => {
  it('pays what the shipped claim paid, rung for rung', () => {
    expect(VIP_MILESTONES.map(milestone => ({ ...milestone }))).toEqual(fixture.vip.milestones);
  });

  it('asks the thresholds the shipped game asks', () => {
    expect([...VIP_LEVEL_THRESHOLDS]).toEqual(fixture.vip.thresholds);
    expect(MAX_VIP_LEVEL).toBe(10);
  });
});

describe('the level a point total buys', () => {
  it('answers each rung at its threshold and one below it', () => {
    // Both sides of every boundary in one table, which is where an off-by-one
    // in a `>=` lives. Rung 0 has no "one below" to check.
    expect(VIP_LEVEL_THRESHOLDS.map(points => vipLevelFromPoints(points))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(VIP_LEVEL_THRESHOLDS.slice(1).map(points => vipLevelFromPoints(points - 1))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('stops at ten rather than running off the end of the table', () => {
    expect(vipLevelFromPoints(100_000_000)).toBe(MAX_VIP_LEVEL);
    expect(pointsToNextVipLevel(100_000)).toBeNull();
  });

  it('treats a negative or fractional total as the whole points below it', () => {
    expect(vipLevelFromPoints(-500)).toBe(0);
    expect(vipLevelFromPoints(49.9)).toBe(0);
    expect(vipLevelFromPoints(50.9)).toBe(1);
  });

  it('says what the next rung still costs', () => {
    expect(pointsToNextVipLevel(0)).toBe(50);
    expect(pointsToNextVipLevel(49)).toBe(1);
    expect(pointsToNextVipLevel(50)).toBe(100);
  });
});

describe('claiming a milestone', () => {
  it('pays all four purses, and moves lifetime gold with the purse', () => {
    const before = atLevel(1);
    const claim = claimVipReward(before, 1)!;
    const reward = fixture.vip.milestones[0];
    expect({
      diamonds: claim.save.wallet.diamonds - before.wallet.diamonds,
      gold: claim.save.wallet.gold - before.wallet.gold,
      shards: claim.save.wallet.heroShards - before.wallet.heroShards,
      essence: claim.save.wallet.essence - before.wallet.essence,
      totalGold: claim.save.wallet.totalGold - before.wallet.totalGold,
    }).toEqual({
      diamonds: reward.diamonds,
      gold: reward.gold,
      shards: reward.shards,
      essence: reward.essence,
      // A milestone that raised the purse without raising the lifetime total
      // would make every achievement measured on `totalGold` quietly cheaper.
      totalGold: reward.gold,
    });
  });

  it('refuses a rung above the account, a rung already taken, and one that is not a rung', () => {
    const earned = atLevel(2);
    expect(claimVipReward(earned, 3)).toBeNull();
    expect(claimVipReward(claimVipReward(earned, 1)!.save, 1)).toBeNull();
    expect(claimVipReward(atLevel(10), 0)).toBeNull();
    expect(claimVipReward(atLevel(10), 11)).toBeNull();
  });

  it('lists every rung earned and not yet taken', () => {
    expect(claimableVipLevels(atLevel(3).vip)).toEqual([1, 2, 3]);
    expect(claimableVipLevels(atLevel(3, { claimedRewardLevels: [2] }).vip)).toEqual([1, 3]);
    expect(claimableVipLevels(atLevel(0).vip)).toEqual([]);
  });

  it('is the only source of diamonds this build has', () => {
    /*
     * Worth pinning rather than assuming. The diamond shop, the discounted
     * summon and the doubled bag cap all spend or depend on diamonds, and
     * until this commit nothing in the rewrite paid any in: the shipped
     * inflows are minigames, expeditions, mail and the dollar shop, and none
     * of those exist here yet.
     */
    const ten = VIP_MILESTONES.reduce((sum, milestone) => sum + milestone.diamonds, 0);
    expect(ten).toBe(13_380);
  });
});

describe('the codex, which is where VIP points come from', () => {
  const subject = (heroId: string, over: Partial<{ owned: boolean; uniqueRank: number }> = {}) => ({
    heroId,
    owned: true,
    uniqueRank: 1,
    ...over,
  });

  it('pays ten for a hero the account owns, once', () => {
    const first = recordCodexHero(save(), subject('h1'))!;
    expect(first.vip.points).toBe(CODEX_VIP_POINTS);
    expect(recordCodexHero(first, subject('h1'))).toBeNull();
  });

  it('pays ten for a ranked unique weapon, once', () => {
    const first = recordCodexUnique(save(), subject('h1'))!;
    expect(first.vip.points).toBe(CODEX_VIP_POINTS);
    expect(recordCodexUnique(first, subject('h1'))).toBeNull();
  });

  it('refuses a hero nobody owns and a weapon nobody has ranked', () => {
    expect(recordCodexHero(save(), subject('h1', { owned: false }))).toBeNull();
    expect(recordCodexUnique(save(), subject('h1', { uniqueRank: 0 }))).toBeNull();
  });

  it('raises the level as the points cross a threshold', () => {
    // Five entries is 50 points, which is exactly VIP 1.
    const subjects = HERO_POOL.slice(0, 5).map(hero => subject(hero.id, { uniqueRank: 0 }));
    const swept = recordEveryCodexEntry(save(), subjects);
    expect({ recorded: swept.recorded, points: swept.save.vip.points, level: swept.save.vip.level }).toEqual({
      recorded: 5,
      points: 50,
      level: 1,
    });
  });

  it('records everything outstanding in one sweep, and nothing twice', () => {
    const subjects = HERO_POOL.map(hero => subject(hero.id));
    const once = recordEveryCodexEntry(save(), subjects);
    const twice = recordEveryCodexEntry(once.save, subjects);
    expect(once.recorded).toBe(fixture.vip.maxCodexClaims);
    expect(twice.recorded).toBe(0);
  });

  it('cannot reach level five, which is the ceiling the fixture measured', () => {
    /*
     * With the dollar shop off there are exactly two point sources, both here,
     * and only so many heroes to claim them for. 65 heroes is 130 entries
     * worth 1,300 points, and VIP 5 costs 1,500 — so six of the ten rungs are
     * unreachable by anything the shipped game offers.
     *
     * Ported as measured rather than tuned around. The rewrite's answer is a
     * later phase adding a second source, and the tables above do not change
     * when it does.
     */
    const swept = recordEveryCodexEntry(
      save(),
      HERO_POOL.map(hero => subject(hero.id)),
    );
    expect(HERO_POOL.length).toBe(fixture.vip.heroCount);
    expect(swept.save.vip.points).toBe(fixture.vip.maxPointsWithoutPaying);
    expect(swept.save.vip.level).toBe(fixture.vip.maxLevelWithoutPaying);
    expect(claimableVipLevels(swept.save.vip)).toEqual([1, 2, 3, 4]);
  });
});

describe('the stored block', () => {
  it('derives the level from the points rather than trusting a stored one', () => {
    /*
     * The shipped state stores both and writes both together, so they agree
     * until something writes one — and a level with no points behind it is
     * worth 3% damage and 2.5% of each purse per rung. Deriving makes the
     * points the single source of truth.
     */
    expect(readVip({ points: 700, level: 10 }).level).toBe(4);
    expect(readVipFromLegacy({ vipPoints: 700, vipLevel: 10 }).level).toBe(4);
    expect(readVip({ points: 0, level: 9 }).level).toBe(0);
  });

  it('reads the five v2 keys off a flat bag and its own block off a v3 save', () => {
    const fromV2 = readVipFromLegacy({
      vipPoints: 150,
      vipRewardClaimedLevels: [2, 1, 2],
      codexVipClaimedHeroIds: ['h1', 'h1', 'h2'],
      codexVipClaimedUniqueIds: ['h3'],
    });
    expect(fromV2).toEqual({
      points: 150,
      level: 2,
      // Sorted and de-duplicated on the way in: the shipped list is appended
      // to without either check, so a rung can be stored twice and paid once.
      claimedRewardLevels: [1, 2],
      codexHeroIds: ['h1', 'h2'],
      codexUniqueIds: ['h3'],
    });
    expect(
      readVip({ points: 150, claimedRewardLevels: [2, 1], codexHeroIds: ['h1'], codexUniqueIds: [] }),
    ).toMatchObject({ points: 150, level: 2, claimedRewardLevels: [1, 2] });
  });

  it('drops a rung that is not a rung, and a total that is not a number', () => {
    expect(readVipFromLegacy({ vipPoints: 'lots', vipRewardClaimedLevels: [0, 11, 3] })).toMatchObject({
      points: 0,
      level: 0,
      claimedRewardLevels: [3],
    });
    expect(readVipFromLegacy(null)).toEqual({
      points: 0,
      level: 0,
      claimedRewardLevels: [],
      codexHeroIds: [],
      codexUniqueIds: [],
    });
  });

  it('re-derives the level every time points move', () => {
    expect(addVipPoints({ ...readVip(null), points: 49, level: 0 }, 1).level).toBe(1);
    expect(addVipPoints({ ...readVip(null), points: 50, level: 1 }, -50).level).toBe(0);
  });
});
