import Decimal from 'break_eternity.js';
import type { SimulationSnapshot } from '../../engine/types';
import { formatDamage } from '../../format/bigNumber';

/**
 * What the player is working towards, as one line in the HUD.
 *
 * REVAMP, section 3: Achievements' five sub-tabs become one ledger, and the
 * part worth seeing moves into the HUD as a ticker. The shipped game had a
 * screen you had to go and check, which meant a goal you were three kills
 * from was invisible unless you happened to navigate to it — and navigating
 * to it stopped the fight.
 *
 * So the ticker shows exactly one: the first thing not yet done. Objectives
 * read monotonic totals off the snapshot and nothing else, which is what
 * makes "done" derivable rather than a second piece of state to persist and
 * get out of step.
 */

export interface Objective {
  id: string;
  label: string;
  /** Reads a total off the snapshot. Must never decrease within a run. */
  reached: (snapshot: SimulationSnapshot) => Decimal;
  goal: Decimal;
  /** How the numbers are spelled. Counts are plain; damage is abbreviated. */
  scale: 'count' | 'big';
}

export interface ObjectiveTrack {
  id: string;
  label: string;
  /** 0 to 1. Clamped and always finite, however large the figures get. */
  fraction: number;
  /** "3 / 10", or "1.20K / 10.0K". */
  detail: string;
  done: boolean;
}

export const OBJECTIVES: readonly Objective[] = [
  {
    id: 'first-blood',
    label: 'Kill ten enemies',
    reached: snapshot => new Decimal(snapshot.totals.kills),
    goal: new Decimal(10),
    scale: 'count',
  },
  {
    id: 'push-to-ten',
    label: 'Reach wave 10',
    reached: snapshot => new Decimal(snapshot.wave),
    goal: new Decimal(10),
    scale: 'count',
  },
  {
    id: 'hundred-kills',
    label: 'Kill a hundred enemies',
    reached: snapshot => new Decimal(snapshot.totals.kills),
    goal: new Decimal(100),
    scale: 'count',
  },
  {
    id: 'first-boss',
    label: 'Reach wave 25',
    reached: snapshot => new Decimal(snapshot.wave),
    goal: new Decimal(25),
    scale: 'count',
  },
  {
    id: 'million-damage',
    label: 'Deal a million damage',
    reached: snapshot => snapshot.totals.dealt,
    goal: new Decimal(1e6),
    scale: 'big',
  },
];

/** Where one objective stands. */
export function trackOf(objective: Objective, snapshot: SimulationSnapshot): ObjectiveTrack {
  const reached = objective.reached(snapshot);
  const done = reached.gte(objective.goal);
  return {
    id: objective.id,
    label: objective.label,
    fraction: fractionOf(reached, objective.goal),
    detail: `${spell(done ? objective.goal : reached, objective.scale)} / ${spell(objective.goal, objective.scale)}`,
    done,
  };
}

/**
 * The first objective not yet met, or null when there is nothing left.
 *
 * Nothing left shows nothing. Looping back to the first would read as
 * progress being taken away.
 */
export function currentObjective(snapshot: SimulationSnapshot): ObjectiveTrack | null {
  for (const objective of OBJECTIVES) {
    const track = trackOf(objective, snapshot);
    if (!track.done) return track;
  }
  return null;
}

/** Invariants a hand-written objective list stops holding quietly. */
export function objectiveProblems(objectives: readonly Objective[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const objective of objectives) {
    if (seen.has(objective.id)) problems.push(`duplicate id "${objective.id}"`);
    seen.add(objective.id);
    if (objective.goal.lte(0)) problems.push(`"${objective.id}" has a goal of ${objective.goal} and is done on sight`);
    if (objective.label.trim() === '') problems.push(`"${objective.id}" has no label`);
  }
  return problems;
}

/**
 * A ratio as a plain number, for a pair that can be past 1e308.
 *
 * The three early returns are what keep this finite rather than a clamp on
 * the way out: a goal of zero never reaches the division, and neither does a
 * `reached` at or past it, so what divides is always strictly smaller than
 * what it divides by. `1e-4000 / 1` underflows to 0, which is a bar drawn
 * empty — right — where `Infinity` would be a bar drawn as nothing at all.
 */
function fractionOf(reached: Decimal, goal: Decimal): number {
  if (goal.lte(0)) return 1;
  if (reached.lte(0)) return 0;
  if (reached.gte(goal)) return 1;
  return reached.div(goal).toNumber();
}

function spell(value: Decimal, scale: Objective['scale']): string {
  if (scale === 'big') return formatDamage(value);
  // A count is small by construction, but `toNumber` on something past a
  // double would still print in exponent form, so it goes through the same
  // formatter once it is out of range.
  return value.lt(1e6) ? String(Math.floor(value.toNumber())) : formatDamage(value);
}
