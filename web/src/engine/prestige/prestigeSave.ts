import type { SaveContent, SaveV3 } from '../save/schema';
import { normalizeTeamSelection } from '../save/migrate';
import { teamHeroes } from '../roster/rosterSave';
import { FACILITY_MAX_LEVEL, facilityUpgradeCost, type FacilityId } from './facilities';
import {
  REBIRTH_SEASON_POINTS,
  canRebirth,
  essenceUpgradeCost,
  rebirthCoreGain,
  rebirthPathCost,
  rebirthWaveRequirement,
  type PrestigePath,
} from './rebirth';

/**
 * Prestige, applied to a save.
 *
 * The rules are in `rebirth.ts` and `facilities.ts`; this is the half with a
 * schema. Every verb answers the next save or **null**, the same contract the
 * roster and equipment verbs keep.
 *
 * The one that needs reading carefully is `rebirth`, because most of what it
 * does is leave things alone.
 */

/** What a rebirth would give, for a screen to show before the press. */
export interface RebirthPreview {
  requirement: number;
  /** Waves past the wall. The surplus term is most of the reward. */
  surplus: number;
  cores: number;
  ready: boolean;
}

export function previewRebirth(save: SaveV3): RebirthPreview {
  const requirement = rebirthWaveRequirement(save.progression.prestigeCount);
  return {
    requirement,
    surplus: Math.max(0, save.progression.highestWave - requirement),
    cores: rebirthCoreGain(save.progression.prestigeCount, save.progression.highestWave),
    ready: canRebirth(save.progression.prestigeCount, save.progression.highestWave),
  };
}

/**
 * Reset the run, or refuse.
 *
 * **It clears the run and nothing else.** Level, exp and wave go back to one;
 * the gold, the heroes, the equipment, the spent and unspent stat points, the
 * essence, the meta levels and the rebirth paths already bought all survive. An
 * implementation reading the word "prestige" would guess wrong about every one
 * of those, and a reset that cleared the meta levels would delete the thing the
 * cores it pays out are spent on.
 *
 * `highestWave` survives too, which is worth stating because it is what the
 * *next* wall is measured against — a rebirth does not make the account forget
 * how deep it has been.
 *
 * The active team is replayed through the selection rules rather than kept
 * verbatim, as the shipped action does. It cannot actually change anything
 * today — nothing in a rebirth makes a legal team illegal — and it is the
 * shipped call, so a later rule that *did* would be honoured without anybody
 * having to remember this line.
 */
export function rebirth(save: SaveV3, content: SaveContent): SaveV3 | null {
  if (!canRebirth(save.progression.prestigeCount, save.progression.highestWave)) return null;

  const cores = rebirthCoreGain(save.progression.prestigeCount, save.progression.highestWave);
  const activeUids = normalizeTeamSelection(
    teamHeroes(save, content),
    save.roster.formationByUid,
    content,
    save.roster.slotsUnlocked,
    save.roster.activeUids,
  );

  return {
    ...save,
    progression: {
      ...save.progression,
      level: 1,
      exp: 0,
      wave: 1,
      prestigeCount: save.progression.prestigeCount + 1,
    },
    wallet: { ...save.wallet, rebirthCores: save.wallet.rebirthCores + cores },
    roster: { ...save.roster, activeUids },
    legacy: {
      ...save.legacy,
      // Season points are still in the bag — the season system is Phase 11's —
      // so the 250 a rebirth pays is written back where the shipped game keeps
      // it rather than being dropped on the floor.
      seasonPoints: seasonPointsOf(save) + REBIRTH_SEASON_POINTS,
    },
  };
}

function seasonPointsOf(save: SaveV3): number {
  const points = save.legacy.seasonPoints;
  return typeof points === 'number' && Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
}

function pathLevel(save: SaveV3, path: PrestigePath): number {
  if (path === 'damage') return save.progression.rebirthDamagePath;
  if (path === 'economy') return save.progression.rebirthEconomyPath;
  return save.progression.rebirthSurvivalPath;
}

function metaLevel(save: SaveV3, path: PrestigePath): number {
  if (path === 'damage') return save.progression.metaDamageLevel;
  if (path === 'economy') return save.progression.metaEconomyLevel;
  return save.progression.metaSurvivalLevel;
}

const PATH_FIELD: Record<PrestigePath, 'rebirthDamagePath' | 'rebirthEconomyPath' | 'rebirthSurvivalPath'> = {
  damage: 'rebirthDamagePath',
  economy: 'rebirthEconomyPath',
  survival: 'rebirthSurvivalPath',
};

const META_FIELD: Record<PrestigePath, 'metaDamageLevel' | 'metaEconomyLevel' | 'metaSurvivalLevel'> = {
  damage: 'metaDamageLevel',
  economy: 'metaEconomyLevel',
  survival: 'metaSurvivalLevel',
};

/** What the next step up a rebirth path costs, for a screen to show. */
export function priceOfRebirthPath(save: SaveV3, path: PrestigePath): number {
  return rebirthPathCost(pathLevel(save, path));
}

/** Buy one level of a rebirth path, or refuse. Priced off the level being left. */
export function spendRebirthCore(save: SaveV3, path: PrestigePath): SaveV3 | null {
  const cost = rebirthPathCost(pathLevel(save, path));
  if (save.wallet.rebirthCores < cost) return null;
  return {
    ...save,
    wallet: { ...save.wallet, rebirthCores: save.wallet.rebirthCores - cost },
    progression: { ...save.progression, [PATH_FIELD[path]]: pathLevel(save, path) + 1 },
  };
}

/** What the next meta level costs. */
export function priceOfEssenceUpgrade(save: SaveV3, path: PrestigePath): number {
  return essenceUpgradeCost(metaLevel(save, path));
}

/** Buy one meta level, or refuse. */
export function spendEssence(save: SaveV3, path: PrestigePath): SaveV3 | null {
  const cost = essenceUpgradeCost(metaLevel(save, path));
  if (save.wallet.essence < cost) return null;
  return {
    ...save,
    wallet: { ...save.wallet, essence: save.wallet.essence - cost },
    progression: { ...save.progression, [META_FIELD[path]]: metaLevel(save, path) + 1 },
  };
}

/** What raising a facility costs. `Infinity` at the cap. */
export function priceOfFacility(save: SaveV3, facilityId: FacilityId): number {
  return facilityUpgradeCost(facilityId, save.facilities[facilityId]);
}

/**
 * Raise a facility a level, or refuse.
 *
 * Paid in **gold**, which is the only prestige verb that is — and the reason
 * a screen has to read the banked balance plus the run's earnings rather than
 * the save's `wallet.gold` alone.
 */
export function upgradeFacility(save: SaveV3, facilityId: FacilityId, gold: number): SaveV3 | null {
  const level = save.facilities[facilityId];
  if (level >= FACILITY_MAX_LEVEL) return null;
  const cost = facilityUpgradeCost(facilityId, level);
  if (!Number.isFinite(cost) || gold < cost) return null;

  return {
    ...save,
    // Spent from the *save's* balance, which may go negative against a purse
    // that included the run's unbanked earnings — so the caller checks against
    // what the player can see and the subtraction is floored here.
    wallet: { ...save.wallet, gold: Math.max(0, save.wallet.gold - cost) },
    facilities: { ...save.facilities, [facilityId]: level + 1 },
  };
}
