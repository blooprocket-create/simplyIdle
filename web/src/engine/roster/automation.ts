import { RARITY_IDS, type Rarity } from '../../content/rarities';
import { calculateShardReward } from './progression';
import type { TeamHero } from './team';

/**
 * The two roster automations, as rules — and not yet as something switched on.
 *
 * `content/automation.ts` has listed `summon` and `recycle` since Phase 4 with
 * `available: false`, on the grounds that "the systems they automate do not
 * exist in this rewrite yet". Phase 8 built the systems. **The flags stay
 * false anyway**, and the reason is worth stating because it is not obvious.
 *
 * `available` is a claim that the *shell wires this flag to the running
 * simulation*, not that rules for it exist somewhere — and
 * `ui/architecture.test.ts` enforces that correspondence directly, by reading
 * `App.tsx` for `setAuto…` calls and requiring the set to equal the set marked
 * available. It caught an attempt to flip these two on the strength of this
 * file alone, which is precisely the failure it was written for.
 *
 * What the wiring waits on is the **rest of the wallet**. The snapshot carries
 * gold and EXP now — `combat/rewards.ts` pulled that much of Phase 10 forward,
 * because the roster UI is priced in gold — but an automatic summon spends
 * **boss tears** and an automatic recycle pays into **hero shards**, and the
 * simulation earns neither. Nor could it usefully: both are spent as well as
 * earned, and a counter that only ever goes up is not something an automation
 * can be allowed to draw on. Spending is Phase 10, and these two get switched
 * on there rather than here.
 *
 * So the parity plan's line that Phase 8 "unlocks the summon, recycle and
 * tempo automations" is wrong on all three, for two different reasons:
 *
 * - `summon` and `recycle` have their rules here and wait on the wallet.
 * - `tempo` has no rules at all and cannot get them here. Auto-tempo raises
 *   `combatTempo` when `combatHeat` is zero, and this engine has neither —
 *   heat does not exist in it, and `tempo` survives only as a scalar the
 *   offline estimator multiplies by. It waits on whichever phase builds heat.
 *
 * REVAMP is corrected to say so.
 */

/** Cooldown between automatic summons, in ms. Matches the shipped `1200`. */
export const AUTO_SUMMON_COOLDOWN_MS = 1_200;

export interface AutoSummonState {
  cooldownMs: number;
  freeSummonCharges: number;
  bossTears: number;
}

export interface AutoSummonTick {
  /** True when this tick should perform one summon. */
  summon: boolean;
  cooldownMs: number;
  freeSummonCharges: number;
  bossTears: number;
}

/**
 * Whether an automatic summon fires this tick, and what it costs.
 *
 * Boss tears rather than diamonds — the manual action takes either, and the
 * automatic one only ever spends tears. A free charge is spent first when one
 * is held, which is what stops the automation from burning tears while charges
 * sit unused.
 *
 * The cooldown is counted down by the caller and only *set* here, so a tick
 * that does not summon does not reset it — otherwise an account with no tears
 * would hold the cooldown at full forever and never notice it had run dry.
 */
export function autoSummonTick(state: AutoSummonState, elapsedMs: number): AutoSummonTick {
  const cooldownMs = Math.max(0, state.cooldownMs - Math.max(0, elapsedMs));
  const idle: AutoSummonTick = {
    summon: false,
    cooldownMs,
    freeSummonCharges: state.freeSummonCharges,
    bossTears: state.bossTears,
  };

  if (cooldownMs > 0) return idle;

  const useFree = state.freeSummonCharges > 0;
  if (!useFree && state.bossTears < 1) return idle;

  return {
    summon: true,
    cooldownMs: AUTO_SUMMON_COOLDOWN_MS,
    freeSummonCharges: useFree ? state.freeSummonCharges - 1 : state.freeSummonCharges,
    bossTears: useFree ? state.bossTears : state.bossTears - 1,
  };
}

export interface AutoRecycleInput {
  heroes: readonly TeamHero[];
  activeUids: readonly string[];
  /** Everything at or below this rarity is recycled. */
  maxRarity: Rarity;
  /** Template ids whose unique relic is equipped. Those heroes are spared. */
  relicBearerUids: ReadonlySet<string>;
}

/**
 * Which heroes an automatic recycle would take.
 *
 * Three exclusions and all three matter:
 *
 * - **The active team.** Recycling a hero who is fighting would empty the line
 *   the player chose.
 * - **A relic bearer.** A hero carrying their unique weapon is spared, because
 *   recycling them destroys progress the relic represents and the relic has no
 *   other home.
 * - **Anything above the floor.** The floor is inclusive: a floor of `rare`
 *   takes commons, uncommons and rares. Reading it as exclusive would leave a
 *   player's rares piling up after they asked for them to go.
 *
 * Returns the heroes rather than performing the recycle: paying for them is
 * `autoRecycleShards`' job, and it is not simply the sum of `recycleShards`
 * over the same heroes. See the note there.
 */
export function autoRecycleTargets(input: AutoRecycleInput): TeamHero[] {
  const active = new Set(input.activeUids);
  const floor = RARITY_IDS.indexOf(input.maxRarity);
  if (floor < 0) return [];

  return input.heroes.filter(hero => {
    if (active.has(hero.uid)) return false;
    if (input.relicBearerUids.has(hero.uid)) return false;
    return RARITY_IDS.indexOf(hero.rarity) <= floor;
  });
}

/**
 * What a batch recycle pays.
 *
 * **Summed first, then rounded once** — `Math.ceil(sum * multiplier)`, not a
 * sum of per-hero ceilings. The difference is real money during a weekly shard
 * event: recycling ten heroes in one sweep pays *less* than recycling them one
 * at a time, because nine fractional shards that would each have rounded up are
 * absorbed into the sum.
 *
 * Ported as it stands rather than made consistent with `recycleShards`. The two
 * apps share accounts, and a player who noticed the sweep paying differently
 * from the manual button would be noticing a divergence rather than a fix.
 */
export function autoRecycleShards(targets: readonly TeamHero[], weeklyShardMultiplier: number): number {
  const total = targets.reduce((sum, hero) => sum + calculateShardReward(hero.rarity, hero.level), 0);
  return Math.ceil(total * weeklyShardMultiplier);
}
