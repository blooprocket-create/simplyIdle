import Decimal from 'break_eternity.js';
import type { ActiveCaster } from './HeroActiveClock';
import { retuneHeroes } from '../entities/HeroEntity';
import type { HeroEntity } from '../entities/HeroEntity';
import type { RewardRates } from './rewards';
import { rescaleVitals, type TeamVitals } from './survival';

/**
 * New numbers for a fight already in progress.
 *
 * The seam that stops an account change restarting a run. `fightSignature` was
 * one string, so levelling a hero — or equipping a piece, or buying a prestige
 * upgrade — moved it and rebuilt the loop. A rebuild resumes from
 * `RunProgress`: wave, kills, deaths, burst charge, gold and exp, and
 * **nothing else**. Measured on a fight two seconds in, a rebuild healed the
 * team from 967 to full, healed the enemy from 15,688 to full, took every
 * ability cooldown from 8,100ms to zero, and put the clock back to nil.
 *
 * So the *identity* of a fight and its *tuning* are separated. Who is fighting
 * needs a rebuild: the renderer's cast changes and so does the swing schedule.
 * What they hit for does not.
 */
export interface FightTuning {
  heroes: readonly HeroEntity[];
  teamMaxHp: number;
  incomingMult: number;
  rates: RewardRates;
  casters: readonly ActiveCaster[];
}

/**
 * The two pieces a retune actually rewrites.
 *
 * The rest — the rates, the mitigation scalar, who can cast — are plain
 * assignments the caller makes, and putting them behind a function would hide
 * nothing. These two are rules: a swing timer that must survive, and a health
 * share that must not become a heal.
 */
export function retuneFight(
  current: { heroes: readonly HeroEntity[]; vitals: TeamVitals },
  next: FightTuning,
): { heroes: HeroEntity[]; vitals: TeamVitals } {
  return {
    heroes: retuneHeroes(current.heroes, next.heroes),
    vitals: rescaleVitals(current.vitals, new Decimal(next.teamMaxHp)),
  };
}
