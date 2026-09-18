import { boundedInt, boundedIntList, boundedStringList, isRecord, MAX_SAVE_COLLECTION } from './guards';
import { MAX_VIP_LEVEL, vipLevelFromPoints } from '../../content/vip';

/**
 * VIP, claimed out of the `legacy` bag.
 *
 * Read but not claimed since Phase 8 — `playerActions.vipLevel` reaches into
 * the bag for the summon discount, and said in its own comment that VIP was "a
 * whole system … that Phase 10 owns". This is that phase, so it is typed:
 * a screen that shows a track, a claim button per rung and a codex that pays
 * into it cannot read any of that out of an untyped record.
 *
 * Five v2 keys come across: `vipPoints`, `vipLevel`, `vipRewardClaimedLevels`,
 * `codexVipClaimedHeroIds` and `codexVipClaimedUniqueIds`.
 *
 * **The level is recomputed rather than trusted.** The shipped state stores it
 * beside the points and the two can disagree — every write sets both, but a
 * hand-edited save or a partial write leaves a level with no points behind it,
 * and the level is worth 3% damage and 2.5% of each purse *per rung*. Deriving
 * it makes the points the single source of truth and the stored level a
 * cache we can simply rebuild.
 */

export interface SavedVip {
  points: number;
  /** Derived from `points`. Never read from the save; see above. */
  level: number;
  /** Milestone rungs already collected, ascending. */
  claimedRewardLevels: number[];
  /** Hero template ids whose lore has been recorded. */
  codexHeroIds: string[];
  /** Hero template ids whose unique weapon has been recorded. */
  codexUniqueIds: string[];
}

/** Nobody accumulates more than this, and a save claiming to is clamped. */
export const MAX_VIP_POINTS = 100_000_000;

export function emptyVip(): SavedVip {
  return { points: 0, level: 0, claimedRewardLevels: [], codexHeroIds: [], codexUniqueIds: [] };
}

/**
 * The two readers, because the two saves spell it differently.
 *
 * A v2 save carries five flat keys; a v3 save carries the block below. Both
 * normalise through `normalise`, so a rule about de-duplicating claimed rungs
 * is written once and cannot drift between the migration path and the reload
 * path — which is exactly how a save bug survives a rewrite.
 */
function normalise(points: unknown, claimed: unknown, heroIds: unknown, uniqueIds: unknown): SavedVip {
  const total = boundedInt(points, 0, MAX_VIP_POINTS, 0);
  return {
    points: total,
    level: vipLevelFromPoints(total),
    // Sorted and de-duplicated: the shipped list is appended to without either
    // check, so a save can carry the same rung twice and pay it once.
    claimedRewardLevels: [...new Set(boundedIntList(claimed, MAX_VIP_LEVEL))]
      .filter(level => level >= 1 && level <= MAX_VIP_LEVEL)
      .sort((left, right) => left - right),
    codexHeroIds: [...new Set(boundedStringList(heroIds, MAX_SAVE_COLLECTION))],
    codexUniqueIds: [...new Set(boundedStringList(uniqueIds, MAX_SAVE_COLLECTION))],
  };
}

/** From the flat v2 bag, where the five keys sit beside everything else. */
export function readVipFromLegacy(raw: unknown): SavedVip {
  if (!isRecord(raw)) return emptyVip();
  return normalise(raw.vipPoints, raw.vipRewardClaimedLevels, raw.codexVipClaimedHeroIds, raw.codexVipClaimedUniqueIds);
}

/** From a v3 save's own block. */
export function readVip(raw: unknown): SavedVip {
  if (!isRecord(raw)) return emptyVip();
  return normalise(raw.points, raw.claimedRewardLevels, raw.codexHeroIds, raw.codexUniqueIds);
}

/** Back out to the five keys the shipped game reads. */
export function vipToLegacy(vip: SavedVip): Record<string, unknown> {
  return {
    vipPoints: vip.points,
    // Written from the derived level, not from a stored one, so a save that
    // came in disagreeing with itself goes back out agreeing.
    vipLevel: vip.level,
    vipRewardClaimedLevels: [...vip.claimedRewardLevels],
    codexVipClaimedHeroIds: [...vip.codexHeroIds],
    codexVipClaimedUniqueIds: [...vip.codexUniqueIds],
  };
}

/** Add points and re-derive the level. The only way points ever move. */
export function addVipPoints(vip: SavedVip, points: number): SavedVip {
  const total = Math.min(MAX_VIP_POINTS, Math.max(0, vip.points + Math.floor(points)));
  return { ...vip, points: total, level: vipLevelFromPoints(total) };
}
