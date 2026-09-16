import type { PlayerClass } from '../../content/classes';
import { getHeroTemplate } from '../../content/heroes';
import type { Rarity } from '../../content/rarities';
import { getIntendedFormationRole, type FormationRole } from '../../engine/combat/formation';
import type { SaveV3, StatBlock } from '../../engine/save/schema';

/**
 * Everything a surface needs that is not per-frame.
 *
 * `SimulationSnapshot` is the read model for the fight; this is the read model
 * for the player. The split is the same one the cast already makes: a hero's
 * name and rarity do not change sixty times a second, so they do not travel
 * with the things that do.
 *
 * It exists because the save is a *storage* shape, not a display one. A
 * `SavedHero` has a template id and no name, no emoji and no class — those are
 * in the catalogue — so something has to join the two. Doing it here means
 * doing it once, rather than in each of the five surfaces that list heroes.
 *
 * The join lives in `ui` rather than in `engine` on purpose: the engine is
 * deliberately free of the catalogue (see `SaveContent`), and half of what is
 * joined on is presentation.
 */

export interface RosterEntry {
  /** Unique instance id. What formations and loadouts point at. */
  uid: string;
  /** Catalogue id, e.g. `h1`. Several heroes may share one. */
  templateId: string;
  name: string;
  emoji: string;
  heroClass: PlayerClass;
  tier: number;
  rarity: Rarity;
  level: number;
  rank: number;
  teamBoost: number;
  role: FormationRole;
  active: boolean;
}

export interface PlayerProfile {
  name: string;
  playerClass: PlayerClass | null;
  created: boolean;
  level: number;
  exp: number;
  wave: number;
  highestWave: number;
  totalKills: number;
  prestigeCount: number;
  stats: { alloc: StatBlock; unspent: number };
  wallet: SaveV3['wallet'];
  roster: RosterEntry[];
  slotsUnlocked: number;
}

const NO_STATS: StatBlock = { strength: 0, vitality: 0, agility: 0, intelligence: 0, spirit: 0 };

const NO_WALLET: SaveV3['wallet'] = {
  gold: 0,
  totalGold: 0,
  diamonds: 0,
  heroShards: 0,
  bossTears: 0,
  essence: 0,
  rebirthCores: 0,
  equipmentScrap: 0,
  sparkTokens: 0,
};

/** A player who has not made a character yet. Built, not shared. */
export function emptyProfile(): PlayerProfile {
  return {
    name: '',
    playerClass: null,
    created: false,
    level: 1,
    exp: 0,
    wave: 1,
    highestWave: 1,
    totalKills: 0,
    prestigeCount: 0,
    stats: { alloc: { ...NO_STATS }, unspent: 0 },
    wallet: { ...NO_WALLET },
    roster: [],
    slotsUnlocked: 0,
  };
}

export function profileFromSave(save: SaveV3): PlayerProfile {
  const active = new Set(save.roster.activeUids);

  const roster = save.roster.heroes.map((hero): RosterEntry => {
    const template = getHeroTemplate(hero.id);
    // The migration drops a row whose template is gone, so by here every row
    // should have one. Should is not the same as does, and a surface that
    // renders `undefined` as a hero's name is worse than one that says the
    // catalogue is missing an entry.
    const heroClass = template?.heroClass ?? 'warrior';
    return {
      uid: hero.uid,
      templateId: hero.id,
      name: template?.name ?? hero.id,
      emoji: template?.emoji ?? '❔',
      heroClass,
      tier: template?.tier ?? 1,
      rarity: hero.rarity,
      level: hero.level,
      rank: hero.rank,
      teamBoost: hero.teamBoost,
      // The rank the player asked for when the save does not say — the same
      // choice the cast makes, and for the same reason.
      role: save.roster.formationByUid[hero.uid] ?? getIntendedFormationRole({ uid: hero.uid, heroClass }),
      active: active.has(hero.uid),
    };
  });

  return {
    name: save.identity.name,
    playerClass: save.identity.playerClass,
    created: save.identity.created,
    level: save.progression.level,
    exp: save.progression.exp,
    wave: save.progression.wave,
    highestWave: save.progression.highestWave,
    totalKills: save.progression.totalKills,
    prestigeCount: save.progression.prestigeCount,
    stats: { alloc: { ...save.stats.alloc }, unspent: save.stats.unspent },
    wallet: { ...save.wallet },
    roster: rosterOrder(roster),
    slotsUnlocked: save.roster.slotsUnlocked,
  };
}

/**
 * The order a roster is listed in, anywhere it is listed.
 *
 * The team first, because that is what the player is asking about; then the
 * strongest, because that is what they would field next. Ties fall through to
 * the uid so the list never reorders between two renders of the same data —
 * a roster whose rows move as you look at it cannot be read.
 */
export function rosterOrder(roster: readonly RosterEntry[]): RosterEntry[] {
  return [...roster].sort(
    (a, b) =>
      Number(b.active) - Number(a.active) ||
      b.tier - a.tier ||
      b.rank - a.rank ||
      b.level - a.level ||
      (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0),
  );
}
