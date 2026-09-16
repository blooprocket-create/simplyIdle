import type { TellSpec } from '../engine/combat/bossTells';
import { ACTS, getActForWave } from './acts';

/**
 * One mechanic per act, which is what REVAMP's Phase 4 asks for.
 *
 * **What this is, stated plainly.** It is one mechanic — the boss tells, the
 * player answers inside a window — tuned six ways, not six unrelated systems.
 * That is a deliberate call and worth being honest about. Six distinct boss
 * mechanics would need six telegraphs, six controls and six things to learn,
 * and the player currently owns one verb; a phase that added five more inputs
 * before any of them had a home would be building the menu simulator this
 * rewrite exists to replace. The shape is shared. What each act asks of the
 * player is not.
 *
 * The escalation across the six is the design: the window narrows from a
 * comfortable 1.4 seconds to 0.7, the cadence tightens, the payout grows, and
 * from the Glass Citadel onward answering without missing starts to compound.
 * An act you have just reached asks you to notice. An act you have earned
 * asks you to keep noticing.
 *
 * Authored data only. Nothing here computes; `bossTells.ts` holds every rule
 * these numbers are read by.
 */
export interface BossMechanic extends TellSpec {
  actId: number;
  /** What the HUD calls it. */
  name: string;
  /** One line, in the act's voice, for the surface that lists them. */
  tell: string;
}

export const BOSS_MECHANICS: readonly BossMechanic[] = [
  {
    actId: 1,
    name: 'Ember Tell',
    tell: 'It draws breath before it throws. Break the breath.',
    cadenceMs: 3_000,
    windowMs: 1_400,
    charge: 3,
    chipSeconds: 2,
    chains: false,
  },
  {
    actId: 2,
    name: 'Rootgrasp',
    tell: 'Roots gather under the guardian. Cut them while they show.',
    cadenceMs: 2_800,
    windowMs: 1_200,
    charge: 3,
    chipSeconds: 2.5,
    chains: false,
  },
  {
    actId: 3,
    name: 'Refraction',
    tell: 'The sentinel splits its own light. Strike the true one, then the next.',
    cadenceMs: 2_600,
    windowMs: 1_000,
    charge: 4,
    chipSeconds: 3,
    chains: true,
  },
  {
    actId: 4,
    name: 'Thunderhead',
    tell: 'The storm gathers to a point. Answer each one and it never lands.',
    cadenceMs: 2_400,
    windowMs: 900,
    charge: 4,
    chipSeconds: 3.5,
    chains: true,
  },
  {
    actId: 5,
    name: 'Crownguard',
    tell: 'The king raises the guard he was buried in. Take it off him.',
    cadenceMs: 2_200,
    windowMs: 800,
    charge: 5,
    chipSeconds: 4,
    chains: true,
  },
  {
    actId: 6,
    name: 'Eclipse',
    tell: 'The dark passes over. Everything you do in it counts twice over.',
    cadenceMs: 2_000,
    windowMs: 700,
    charge: 5,
    chipSeconds: 5,
    chains: true,
  },
];

/**
 * The mechanic a boss on this wave runs.
 *
 * Keyed off the act rather than the wave, so the open-ended sixth act keeps
 * its mechanic at wave 70, 700 and 7,000 — the shipped data stops naming boss
 * waves after 60 and the campaign does not stop there.
 */
export function bossMechanicForWave(wave: number): BossMechanic {
  const act = getActForWave(wave);
  return BOSS_MECHANICS.find(mechanic => mechanic.actId === act.id) ?? BOSS_MECHANICS[BOSS_MECHANICS.length - 1];
}

/** The act a mechanic belongs to, for anything that lists them together. */
export function actForMechanic(mechanic: BossMechanic): (typeof ACTS)[number] {
  return ACTS.find(act => act.id === mechanic.actId) ?? ACTS[ACTS.length - 1];
}
