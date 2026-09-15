import Decimal from 'break_eternity.js';

import { CLASS_ATTACK_INTERVAL_MS } from '../content/attackSpeeds';
import type { PlayerClass } from '../content/classes';
import { getIntendedFormationRole, type FormationHero } from '../engine/combat/formation';
import { createHeroEntity, type HeroEntity } from '../engine/entities/HeroEntity';
import { heroModelKey } from '../game/models/manifest';
import type { Cast } from '../game/models/cast';

/**
 * A team to look at until there is a save to load one from.
 *
 * Scaffolding, and labelled as such: Phase 3 builds the roster from the
 * player's save and this goes away. It exists because a renderer with nothing
 * in it cannot be judged, and because the shape it produces — heroes for the
 * simulation and a matching cast for the diorama, from one source — is the
 * shape the real loader has to produce too.
 */

interface DemoHero {
  uid: string;
  name: string;
  heroClass: PlayerClass;
  dps: number;
}

const DEMO: readonly DemoHero[] = [
  { uid: 'h1', name: 'Kael Ironheart', heroClass: 'warrior', dps: 120 },
  { uid: 'h2', name: 'Lunara Frostweave', heroClass: 'mage', dps: 180 },
  { uid: 'h3', name: 'Bran Stonefist', heroClass: 'monk', dps: 105 },
  { uid: 'h4', name: 'Sera Windrunner', heroClass: 'archer', dps: 160 },
  { uid: 'h5', name: 'Torvald Rageborn', heroClass: 'berserker', dps: 150 },
  { uid: 'h6', name: 'Mira Dawnlight', heroClass: 'mage', dps: 140 },
];

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
    };
  });
}
