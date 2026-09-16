import Decimal from 'break_eternity.js';

import { CLASS_ATTACK_INTERVAL_MS } from '../content/attackSpeeds';
import type { PlayerClass } from '../content/classes';
import { getIntendedFormationRole, type FormationHero } from '../engine/combat/formation';
import { createHeroEntity, type HeroEntity } from '../engine/entities/HeroEntity';
import { heroModelKey } from '../game/models/manifest';
import { silhouetteFor } from '../game/models/silhouette';
import type { Cast } from '../game/models/cast';
import { emptyProfile, rosterOrder, type PlayerProfile, type RosterEntry } from '../ui/profile/playerProfile';
import { HERO_POOL, getHeroTemplate } from '../content/heroes';

/**
 * A team and a player to look at until there is a save to load them from.
 *
 * Scaffolding, and labelled as such: Phase 3 builds the roster from the
 * player's save and this goes away. It exists because a renderer with nothing
 * in it cannot be judged, and because the shape it produces — heroes for the
 * simulation and a matching cast for the diorama, from one source — is the
 * shape the real loader has to produce too.
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
 * Supabase auth rather than in local storage. When Phase 5 wires that up, the
 * surfaces do not change: only which function the app calls does.
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
