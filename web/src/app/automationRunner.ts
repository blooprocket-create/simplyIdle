import type { AutomationId } from '../content/automation';
import { AUTO_SUMMON_COOLDOWN_MS, autoRecycleTargets, autoSummonTick } from '../engine/roster/automation';
import type { SaveV3 } from '../engine/save/schema';
import { teamHeroes } from '../engine/roster/rosterSave';
import { autoRecycleFloorFromLegacy } from '../engine/character/fromSave';
import { SAVE_CONTENT } from './playerActions';
import { equipmentActions } from './equipmentActions';
import { rosterActions, summonOnce } from './playerActions';

/**
 * The automations that touch the **save** rather than the simulation.
 *
 * `ui/architecture.test.ts` has gated automations since Phase 4 by requiring
 * the shell to call `loopRef.setAuto…` for each one marked available. That is
 * exactly right for `burst`, which is an in-fight behaviour, and has no shape
 * at all for one that spends currency or rearranges a roster — which is why
 * four automations have sat `available: false` across three phases with the
 * note "widening it once for all four belongs with Phase 10".
 *
 * This is that widening. An automation is honoured either by the loop, through
 * `setAuto…`, or here. Both halves are held to the catalogue by the same rule.
 *
 * The other blocker named in those notes was a wallet: "an automatic summon
 * spends boss tears and an automatic recycle pays into hero shards — neither
 * of which the simulation earns". It earns both now, and banks them.
 *
 * **Gated by construction rather than by a regex.** `run` skips anything not
 * in `active`, so an automation the player has not earned and switched on
 * cannot act however it is registered — and there is a test that asks.
 */

export interface AutomationContext {
  save: SaveV3;
  /** Since the last run, for the automations that hold a cooldown. */
  elapsedMs: number;
  nowMs: number;
  random: () => number;
}

/** What survives between runs. Nothing here belongs in the save. */
export interface AutomationState {
  summonCooldownMs: number;
}

export const EMPTY_AUTOMATION_STATE: AutomationState = { summonCooldownMs: 0 };

interface Runner {
  (context: AutomationContext, state: AutomationState): { save: SaveV3 | null; state: AutomationState };
}

/**
 * An automatic summon, paid the way the shipped one pays: a free charge first,
 * then a boss tear. Diamonds are never spent automatically — the shipped
 * automation does not touch them and a player would not thank a switch that
 * quietly spent the currency they bought.
 *
 * The cooldown is walked rather than ticked once, because this runs on the
 * shell's save cadence and not on the fight's frame: five seconds of elapsed
 * time is four summons at a 1.2-second cooldown, and firing one would make the
 * automation slower than the shipped one by the ratio of the two clocks.
 */
const runSummon: Runner = (context, state) => {
  let save = context.save;
  let cooldownMs = state.summonCooldownMs;
  let remaining = Math.max(0, context.elapsedMs);
  let acted = false;

  // Bounded by the elapsed window rather than by a count, and every pass
  // either spends the whole remainder or one cooldown's worth of it.
  for (let guard = 0; guard < MAX_SUMMONS_PER_RUN; guard += 1) {
    const step = Math.min(remaining, Math.max(cooldownMs, AUTO_SUMMON_COOLDOWN_MS));
    const tick = autoSummonTick(
      {
        cooldownMs,
        freeSummonCharges: save.summon.freeCharges,
        bossTears: save.wallet.bossTears,
      },
      step,
    );
    cooldownMs = tick.cooldownMs;
    remaining -= step;
    if (!tick.summon) break;

    const outcome = summonOnce({ save, pay: 'bossTears', nowMs: context.nowMs, random: context.random });
    if (outcome === null) break;
    save = outcome.save;
    acted = true;
    if (remaining <= 0) break;
  }

  return { save: acted ? save : null, state: { ...state, summonCooldownMs: cooldownMs } };
};

/** A window's worth of summons, so a long tab-switch cannot spend everything. */
export const MAX_SUMMONS_PER_RUN = 20;

/**
 * An automatic recycle, at the floor the player set.
 *
 * `autoRecycleTargets` already refuses the fielded and anyone carrying their
 * relic; this walks its answer through the ordinary verb rather than a second
 * path, so an automatic recycle pays exactly what a pressed one pays.
 */
const runRecycle: Runner = (context, state) => {
  const targets = autoRecycleTargets({
    heroes: teamHeroes(context.save, SAVE_CONTENT),
    activeUids: context.save.roster.activeUids,
    maxRarity: autoRecycleFloorFromLegacy(context.save),
    relicBearerUids: new Set(
      Object.values(context.save.roster.uniqueByHeroId)
        .map(gear => gear.equippedByUid)
        .filter((uid): uid is string => uid !== null),
    ),
  });

  let save = context.save;
  let acted = false;
  for (const target of targets) {
    const next = rosterActions.recycle(save, target.uid);
    if (next === null) continue;
    save = next;
    acted = true;
  }
  return { save: acted ? save : null, state };
};

/** An automatic sweep of the forge, at the rarity floor the player set. */
const runDismantle: Runner = (context, state) => ({ save: equipmentActions.sweep(context.save), state });

/**
 * Which automation is honoured here rather than by the loop.
 *
 * `equipBest` is deliberately absent and stays `available: false`.
 * `AUTO_EQUIP_BEST_HEROES` is misnamed — it sorts the roster and fields the
 * strongest, which has nothing to do with equipment — and **no rule for it has
 * been ported or measured**. Registering it here would honour a switch that
 * does nothing, which is the failure this whole gate exists to refuse.
 */
export const SAVE_SIDE_AUTOMATIONS: Partial<Record<AutomationId, Runner>> = {
  summon: runSummon,
  recycle: runRecycle,
  dismantle: runDismantle,
};

/**
 * Run every active save-side automation, in catalogue order.
 *
 * Null when none of them changed anything, so the caller can skip a render —
 * which matters, because this runs on a timer and most ticks do nothing.
 */
export function runAutomations(
  active: ReadonlySet<AutomationId>,
  context: AutomationContext,
  state: AutomationState = EMPTY_AUTOMATION_STATE,
): { save: SaveV3 | null; state: AutomationState } {
  let save = context.save;
  let next = state;
  let acted = false;

  for (const [id, runner] of Object.entries(SAVE_SIDE_AUTOMATIONS) as [AutomationId, Runner][]) {
    if (!active.has(id)) continue;
    const outcome = runner({ ...context, save }, next);
    next = outcome.state;
    if (outcome.save === null) continue;
    save = outcome.save;
    acted = true;
  }

  return { save: acted ? save : null, state: next };
}
