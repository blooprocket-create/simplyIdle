import {
  ACHIEVEMENTS,
  TRACKED_SIGNALS,
  isTracked,
  type Achievement,
  type AchievementSignal,
} from '../../content/achievements';
import { HERO_LEVEL_CAP, HERO_RANK_CAP } from '../../engine/save/migrate';
import type { SimulationSnapshot } from '../../engine/types';
import { formatDamage } from '../../format/bigNumber';
import type { PlayerProfile } from '../profile/playerProfile';

/**
 * What an achievement's signal reads, now.
 *
 * The shipped conditions were closures over a state shape this rewrite does
 * not have, so `content/achievements.ts` carries the signal each one watched
 * and this decides what that signal means against the current read models.
 *
 * Signals nothing feeds yet return null rather than zero. Showing `0 / 50`
 * for summons in a build with no summoning tells the player they have made no
 * progress, when the truth is that nothing is counting.
 */
export function measure(
  signal: AchievementSignal,
  profile: PlayerProfile,
  snapshot: SimulationSnapshot,
): number | null {
  if (!TRACKED_SIGNALS.has(signal)) return null;

  switch (signal) {
    case 'level':
      return profile.level;
    case 'prestigeCount':
      return profile.prestigeCount;
    /*
     * The saved figure alone, exactly as `totalGold` below is read.
     *
     * It was `profile.totalKills + snapshot.totals.kills`, and that was right
     * while nothing banked a run's kills: reading the profile alone froze
     * every kill achievement at whatever the save held. Now that `bankRun`
     * credits them, the sum **double counts** every kill already banked —
     * `snapshot.totals.kills` is the whole run and does not reset when the
     * purse does.
     *
     * So it lags by at most one bank tick, which is what `totalGold` has
     * always done and nobody has noticed.
     */
    case 'totalKills':
      return profile.totalKills;
    /*
     * A *max* rather than a sum, so it stays right either way. Banking raises
     * the record now, and until the next tick the snapshot is still ahead.
     */
    case 'highestWaveReached':
      return Math.max(profile.highestWave, snapshot.wave);
    // The wave being fought, from whichever read model is further along —
    // the snapshot leads once a run is under way, the save leads before it
    // starts. Deliberately *not* folded in with `highestWave`: the shipped
    // game has both signals, and a `wave` achievement that read the record
    // would unlock at the same instant as its `highestWaveReached` twin.
    case 'wave':
      return Math.max(profile.wave, snapshot.wave);
    case 'totalGold':
      return profile.wallet.totalGold;
    case 'bossTears':
      return profile.wallet.bossTears;
    case 'heroShards':
      return profile.wallet.heroShards;
    case 'essence':
      return profile.wallet.essence;
    case 'equipmentScrap':
      return profile.wallet.equipmentScrap;
    case 'heroRosterCount':
      return profile.roster.length;
    case 'teamSlotCount':
      return profile.slotsUnlocked;
    case 'equippedCount':
      return profile.roster.filter(hero => hero.active).length;
    case 'activeTeamClassCount':
      return new Set(profile.roster.filter(hero => hero.active).map(hero => hero.heroClass)).size;
    case 'maxHeroLevelCount':
      return profile.roster.filter(hero => hero.level >= HERO_LEVEL_CAP).length;
    case 'maxHeroRankCount':
      return profile.roster.filter(hero => hero.rank >= HERO_RANK_CAP).length;
    case 'godlyHeroCount':
      return profile.roster.filter(hero => hero.rarity === 'godly').length;
    case 'transcendentHeroCount':
      return profile.roster.filter(hero => hero.rarity === 'transcendent').length;
    default:
      // In `TRACKED_SIGNALS` but not handled here. The test that walks the set
      // catches this rather than the player finding it.
      return null;
  }
}

export interface AchievementTrack {
  id: string;
  name: string;
  description: string;
  emoji: string;
  /** 0 to 1, clamped and always finite. */
  fraction: number;
  /** "7 / 10", or "1.20T / 1.00Qa". */
  detail: string;
  done: boolean;
}

/** Where one achievement stands, or null if this build cannot say. */
export function trackOf(
  entry: Achievement,
  profile: PlayerProfile,
  snapshot: SimulationSnapshot,
): AchievementTrack | null {
  if (!isTracked(entry) || entry.signal === null || entry.goal === null) return null;
  const reached = measure(entry.signal, profile, snapshot);
  if (reached === null) return null;

  const done = reached >= entry.goal;
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    emoji: entry.emoji,
    fraction: fractionOf(reached, entry.goal),
    detail: `${spell(done ? entry.goal : reached)} / ${spell(entry.goal)}`,
    done,
  };
}

/**
 * Every achievement this build can measure, nearest first.
 *
 * Done ones sink to the bottom: a ledger is read for what is left, and the
 * ones already earned are the ones you do not need to find. Ties fall through
 * to the id so the list never reorders between two renders of the same data.
 */
export function tracks(profile: PlayerProfile, snapshot: SimulationSnapshot): AchievementTrack[] {
  const found: AchievementTrack[] = [];
  for (const entry of ACHIEVEMENTS) {
    const track = trackOf(entry, profile, snapshot);
    if (track !== null) found.push(track);
  }
  return found.sort(
    (a, b) => Number(a.done) - Number(b.done) || b.fraction - a.fraction || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * A ratio as a plain number. The early returns are what keep it finite: a
 * goal of zero never reaches the division, and neither does a figure at or
 * past it, so what divides is always smaller than what it divides by.
 */
function fractionOf(reached: number, goal: number): number {
  if (!(goal > 0)) return 1;
  if (!(reached > 0)) return 0;
  if (reached >= goal) return 1;
  return reached / goal;
}

/** Counts stay digits; anything large enough to be unreadable gets spelled. */
function spell(value: number): string {
  return value < 1e6 ? String(Math.floor(value)) : formatDamage(value);
}
