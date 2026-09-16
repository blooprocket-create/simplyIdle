import { AUTOMATIONS, type Automation, type AutomationId } from '../../content/automation';
import type { SimulationSnapshot } from '../../engine/types';
import { measure } from '../achievements/measure';
import type { PlayerProfile } from '../profile/playerProfile';

/**
 * Which automations the player has earned.
 *
 * Measured against the same signals the achievements use, through the same
 * function, so "500 kills" means one thing in this game rather than two.
 *
 * Nothing here turns an automation *on*. Earning it makes it available; the
 * player still chooses. That distinction is the whole of REVAMP's "automation
 * as an earned reward rather than a default" — a reward that applies itself
 * is a default that took longer to arrive.
 */

export interface AutomationProgress {
  automation: Automation;
  /** 0 to 1 towards the unlock, clamped. */
  fraction: number;
  reached: number;
  unlocked: boolean;
  /** "312 / 500". */
  detail: string;
}

export function automationProgress(profile: PlayerProfile, snapshot: SimulationSnapshot): AutomationProgress[] {
  return AUTOMATIONS.map(automation => {
    const reached = measure(automation.signal, profile, snapshot) ?? 0;
    return {
      automation,
      reached,
      unlocked: reached >= automation.goal,
      fraction: fractionOf(reached, automation.goal),
      detail: `${Math.floor(Math.min(reached, automation.goal))} / ${automation.goal}`,
    };
  });
}

/**
 * Whether one particular automation is earned *and* honoured.
 *
 * An automation this build cannot honour is never reported as unlocked, even
 * when its signal is long past the goal: telling the player they have earned
 * something that does nothing is worse than telling them it is not ready.
 */
export function isUnlocked(id: AutomationId, profile: PlayerProfile, snapshot: SimulationSnapshot): boolean {
  const automation = AUTOMATIONS.find(entry => entry.id === id);
  if (automation === undefined || !automation.available) return false;
  const reached = measure(automation.signal, profile, snapshot);
  return reached !== null && reached >= automation.goal;
}

function fractionOf(reached: number, goal: number): number {
  if (!(goal > 0)) return 1;
  if (!(reached > 0)) return 0;
  if (reached >= goal) return 1;
  return reached / goal;
}
