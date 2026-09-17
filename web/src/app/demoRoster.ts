import Decimal from 'break_eternity.js';

import { CLASS_ATTACK_INTERVAL_MS } from '../content/attackSpeeds';
import type { PlayerClass } from '../content/classes';
import { getIntendedFormationRole, type FormationHero } from '../engine/combat/formation';
import { EMPTY_STATS, teamMaxHp, type HealthHero } from '../engine/character/stats';
import { createHeroEntity, type HeroEntity } from '../engine/entities/HeroEntity';
import { heroModelKey } from '../game/models/manifest';
import { silhouetteFor } from '../game/models/silhouette';
import type { Cast } from '../game/models/cast';
import { emptyProfile, rosterOrder, type PlayerProfile, type RosterEntry } from '../ui/profile/playerProfile';
import { HERO_POOL, getHeroTemplate } from '../content/heroes';
import type { LoadedRoster } from './roster';

/**
 * The team a player starts on, and what they see before they have a save.
 *
 * This was scaffolding — "a team and a player to look at until there is a
 * save to load them from" — and `saveStore.ts` is now that somewhere, so the
 * shell reaches for this only when there is no save at all. What is left is
 * not a placeholder but an answer the cutover owed anyway: what does someone
 * who has never played see?
 *
 * The shape it produces — heroes for the simulation and a matching cast for
 * the diorama, from one source — is the shape `rosterFromSave` produces too,
 * which is why the shell can take either without knowing which it got.
 */

/**
 * Six heroes taken from the catalogue rather than written out here.
 *
 * An earlier version listed six names by hand, which drifted the moment the
 * catalogue landed: the name came from this file and the emoji and tier came
 * from `content/heroes.ts` under the same id, so a mage was displayed with a
 * warrior's shield. Reading both from one place makes that impossible rather
 * than merely fixed.
 *
 * One of each class, so the silhouettes, the formation ranks and the roster's
 * rarity tones all have something to show.
 */
const DEMO_UIDS: readonly string[] = pickOnePerClass();

function pickOnePerClass(): string[] {
  const seen = new Set<PlayerClass>();
  const picked: string[] = [];
  for (const hero of HERO_POOL) {
    if (seen.has(hero.heroClass)) continue;
    seen.add(hero.heroClass);
    picked.push(hero.id);
  }
  // A sixth, so a rank holds two and the formation is not all singletons.
  const spare = HERO_POOL.find(hero => !picked.includes(hero.id));
  if (spare) picked.push(spare.id);
  return picked;
}

interface DemoHero {
  uid: string;
  name: string;
  heroClass: PlayerClass;
  emoji: string;
  tier: number;
  baseTeamBoost: number;
  dps: number;
}

const DEMO: readonly DemoHero[] = DEMO_UIDS.map((id, index) => {
  const template = getHeroTemplate(id);
  if (!template) throw new Error(`demo roster names a hero the catalogue does not have: ${id}`);
  return {
    uid: template.id,
    name: template.name,
    heroClass: template.heroClass,
    emoji: template.emoji,
    tier: template.tier,
    baseTeamBoost: template.baseTeamBoost,
    // Spread apart so the cast bars visibly run at different rates.
    dps: 100 + index * 18,
  };
});

export function demoHeroes(): HeroEntity[] {
  return DEMO.map(hero => createHeroEntity(hero.uid, new Decimal(hero.dps), CLASS_ATTACK_INTERVAL_MS[hero.heroClass]));
}

export function demoCast(): Cast {
  return DEMO.map(hero => {
    const formation: FormationHero = { uid: hero.uid, heroClass: hero.heroClass };
    return {
      uid: hero.uid,
      name: hero.name,
      // The rank the player asked for, not the one the shipped bug awards.
      // Where a hero *stands* is presentation; reproducing the monk formation
      // bug in the renderer as well would put a monk in the wrong place on
      // screen, which is a second wrong rather than parity.
      role: getIntendedFormationRole(formation),
      modelKey: heroModelKey(hero.uid),
      silhouette: silhouetteFor(hero.uid, hero.heroClass),
    };
  });
}

/**
 * The same six heroes, as the read model the surfaces take.
 *
 * Scaffolding like the rest of this file, and the same shape a real save
 * produces — which is the point. `profileFromSave` already builds this from a
 * migrated `SaveV3` and is tested against the shipped fixtures; what is
 * missing is somewhere to get a save from, since the shipped one lives behind
 * Firebase auth rather than in local storage. `saveStore.ts` is now that
 * somewhere for a local save; the surfaces do not change either way, because
 * only which function the app calls does.
 */
export function demoProfile(): PlayerProfile {
  const roster: RosterEntry[] = DEMO.map((hero, index) => {
    const formation: FormationHero = { uid: hero.uid, heroClass: hero.heroClass };
    return {
      uid: hero.uid,
      templateId: hero.uid,
      name: hero.name,
      emoji: hero.emoji,
      heroClass: hero.heroClass,
      tier: hero.tier,
      rarity: DEMO_RARITY[index % DEMO_RARITY.length],
      level: 40 + index * 7,
      rank: index % 3,
      teamBoost: hero.baseTeamBoost,
      role: getIntendedFormationRole(formation),
      active: true,
    };
  });

  return {
    ...emptyProfile(),
    name: 'Wanderer',
    playerClass: 'warrior',
    created: true,
    level: 42,
    exp: 1_200,
    wave: 1,
    highestWave: 37,
    totalKills: 1_482,
    stats: { alloc: { strength: 12, vitality: 8, agility: 5, intelligence: 2, spirit: 3 }, unspent: 4 },
    wallet: {
      ...emptyProfile().wallet,
      gold: 8_421_000,
      totalGold: 41_900_000,
      diamonds: 312,
      heroShards: 1_840,
      essence: 26,
    },
    roster: rosterOrder(roster),
    slotsUnlocked: 6,
  };
}

/** Enough spread to show the roster's rarity tones actually differ. */
const DEMO_RARITY = ['legendary', 'epic', 'rare', 'mythic', 'uncommon', 'common'] as const;

/**
 * What the demo hands the loop, beyond the heroes.
 *
 * `incomingMult` defaults to zero in `Simulation`, which is right for a test
 * that wants to isolate damage dealt — and wrong for the app, where it made
 * the team literally invulnerable: they stalled out around wave 59 and sat
 * there forever, never dying, so the wipe offer could not be reached at all.
 * A shell demonstrating a game with no failure state is demonstrating the
 * wrong game.
 *
 * Health used to be here too, as a flat 2000 with a note saying nothing
 * derived it yet. Phase 7 derives it; see `startingTeamMaxHp` below, and
 * `LoadedRoster.teamMaxHp` for the save-backed path it now shares.
 */
export function demoSimulationOptions(): { incomingMult: number } {
  return { incomingMult: 1 };
}

/**
 * The starting team's health, derived rather than chosen.
 *
 * Six level-one commons and a warrior with nothing spent, run through the same
 * `teamMaxHp` a save goes through — so a new player and a returning one are
 * measured by one rule and not two.
 *
 * It lands on 843 against the flat 2000 this file used to hand out, and the
 * demo still does what that constant was chosen to make it do: climb into the
 * forties within a minute and then sawtooth there. That is worth stating,
 * because the derivation was not tuned to preserve it — six heroes across six
 * classes pick up the formation and synergy multipliers, and those are most of
 * the difference between 250 and 843.
 */
export function startingTeamMaxHp(): number {
  return teamMaxHp({
    // No character has been created yet, so there is no class to read. The
    // shipped `derivedStats` defaults a null class to warrior, and following
    // it here keeps the no-save path on the same rule as every other path.
    playerClass: null,
    alloc: EMPTY_STATS,
    activeHeroes: DEMO.map(
      (hero): HealthHero => ({
        uid: hero.uid,
        heroClass: hero.heroClass,
        rarity: 'common',
        level: 1,
        rank: 1,
        rebirthStatMult: 1,
      }),
    ),
    metaSurvivalLevel: 0,
    rebirthSurvivalPath: 0,
    classMasteryXp: 0,
    tacticsFacilityLevel: 0,
  });
}

/**
 * The team a player with no save starts on.
 *
 * This file was written as scaffolding — "a team and a player to look at
 * until there is a save to load them from" — and `saveStore.ts` is now that
 * somewhere. What is left is not scaffolding but the answer to a real
 * question the cutover has to answer anyway: what does someone who has never
 * played see? One of each class and a spare, taken from the catalogue,
 * derived rather than authored, and identical on every load.
 *
 * Bundled into the same shape `rosterFromSave` returns, so the shell asks
 * one question and does not care which branch answered it.
 */
export function startingRoster(): LoadedRoster {
  return { heroes: demoHeroes(), cast: demoCast(), profile: demoProfile(), teamMaxHp: startingTeamMaxHp() };
}
