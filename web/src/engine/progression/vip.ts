import type { SaveV3 } from '../save/schema';
import { addVipPoints, type SavedVip } from '../save/vipSlice';
import { CODEX_VIP_POINTS, MAX_VIP_LEVEL, vipMilestone, type VipMilestone } from '../../content/vip';

/**
 * Raising VIP, and spending it.
 *
 * Three verbs, and between them they are the only way a VIP level moves in
 * this build. The shipped game has a fourth — a simulated dollar purchase —
 * which is switched off there and not ported here, so the codex is the whole
 * supply. `content/vip.ts` records what that ceiling costs.
 *
 * The milestone is the interesting one: it is the **only source of diamonds**
 * this rewrite has. Everything that spends them — the diamond shop, the
 * discounted summon — has had no inflow at all until now, which is why the
 * shop and VIP are one commit rather than two.
 */

export interface VipClaim {
  save: SaveV3;
  milestone: VipMilestone;
}

/** Which rungs are earned, unclaimed, and would pay out right now. */
export function claimableVipLevels(vip: SavedVip): number[] {
  const claimed = new Set(vip.claimedRewardLevels);
  const levels: number[] = [];
  for (let level = 1; level <= Math.min(vip.level, MAX_VIP_LEVEL); level++) {
    if (!claimed.has(level)) levels.push(level);
  }
  return levels;
}

/**
 * Collect one rung.
 *
 * Null when the rung is not earned, already taken, or not a rung at all. The
 * three refusals are one `null` on purpose: a screen only ever needs to know
 * whether the button does anything, and `claimableVipLevels` is how it decides
 * what to draw.
 */
export function claimVipReward(save: SaveV3, level: number): VipClaim | null {
  const milestone = vipMilestone(Math.floor(level));
  if (milestone === null) return null;
  if (save.vip.level < milestone.level) return null;
  if (save.vip.claimedRewardLevels.includes(milestone.level)) return null;

  return {
    milestone,
    save: {
      ...save,
      vip: {
        ...save.vip,
        claimedRewardLevels: [...save.vip.claimedRewardLevels, milestone.level].sort((left, right) => left - right),
      },
      wallet: {
        ...save.wallet,
        diamonds: save.wallet.diamonds + milestone.diamonds,
        gold: save.wallet.gold + milestone.gold,
        // Lifetime gold moves with it, exactly as the shipped claim does.
        // A milestone that raised the purse without raising the total would
        // make every achievement measured on `totalGold` quietly cheaper.
        totalGold: save.wallet.totalGold + milestone.gold,
        heroShards: save.wallet.heroShards + milestone.shards,
        essence: save.wallet.essence + milestone.essence,
      },
    },
  };
}

/** Everything a codex claim needs to know about the hero it is for. */
export interface CodexSubject {
  heroId: string;
  /** Whether the account owns one. A lore entry needs the hero. */
  owned: boolean;
  /** The rank of their unique weapon. A weapon entry needs it above zero. */
  uniqueRank: number;
}

/**
 * Record a hero's lore, for ten points.
 *
 * The ownership test is an argument rather than a roster scan because the
 * roster is a list of *instances* and this is a question about a *template* —
 * and because the caller has already had to look the hero up to draw the row.
 */
export function recordCodexHero(save: SaveV3, subject: CodexSubject): SaveV3 | null {
  if (!subject.owned) return null;
  if (save.vip.codexHeroIds.includes(subject.heroId)) return null;
  return {
    ...save,
    vip: {
      ...addVipPoints(save.vip, CODEX_VIP_POINTS),
      codexHeroIds: [...save.vip.codexHeroIds, subject.heroId],
    },
  };
}

/** Record a hero's unique weapon, for ten points. Needs it ranked at least once. */
export function recordCodexUnique(save: SaveV3, subject: CodexSubject): SaveV3 | null {
  if (subject.uniqueRank <= 0) return null;
  if (save.vip.codexUniqueIds.includes(subject.heroId)) return null;
  return {
    ...save,
    vip: {
      ...addVipPoints(save.vip, CODEX_VIP_POINTS),
      codexUniqueIds: [...save.vip.codexUniqueIds, subject.heroId],
    },
  };
}

/**
 * Every codex entry this account could still record, in one sweep.
 *
 * A player with sixty heroes is not going to press a hundred and twenty
 * buttons, and the shipped game makes them: one claim per hero per kind,
 * each behind its own codex row. Collapsing it is the same correction
 * `useUsableItem` makes by taking an amount.
 */
export function recordEveryCodexEntry(
  save: SaveV3,
  subjects: readonly CodexSubject[],
): { save: SaveV3; recorded: number } {
  let current = save;
  let recorded = 0;
  for (const subject of subjects) {
    const lore = recordCodexHero(current, subject);
    if (lore !== null) {
      current = lore;
      recorded += 1;
    }
    const weapon = recordCodexUnique(current, subject);
    if (weapon !== null) {
      current = weapon;
      recorded += 1;
    }
  }
  return { save: current, recorded };
}
