import { useMemo } from 'react';
import { ACHIEVEMENTS } from '../gameConfig';

interface Achievement {
  id: string;
}

interface GameState {
  achievements: Set<string>;
  dailyLoginStreak: number;
  essence: number;
  heroRoster: Array<{ id: string }>;
  heroShards: number;
  highestWaveReached: number;
  level: number;
  activeTeamHeroIds: string[];
  permanentUnlocks: string[];
  prestigeCount: number;
  totalGold: number;
  totalKills: number;
  totalSummons: number;
  wave: number;
}

export interface NearUnlockAchievement {
  ach: Achievement;
  ratio: number;
  remaining: number | null;
  progress: { label: string; value: number; target: number } | null;
}

function parseMagnitudeToken(token: string): number {
  const t = token.toLowerCase();
  if (t.endsWith('k')) return Math.floor(Number(t.slice(0, -1)) * 1000);
  if (t.endsWith('m')) return Math.floor(Number(t.slice(0, -1)) * 1_000_000);
  return Number(t);
}

function progressForAchievement(id: string, state: GameState): { label: string; value: number; target: number } | null {
  if (id === 'first_blood') return { label: 'Kills', value: state.totalKills, target: 1 };
  if (id.startsWith('kills_')) return { label: 'Kills', value: state.totalKills, target: parseMagnitudeToken(id.split('_')[1]) };
  if (id.startsWith('wave_')) return { label: 'Wave', value: state.wave, target: parseMagnitudeToken(id.split('_')[1]) };
  if (id.startsWith('level_')) return { label: 'Level', value: state.level, target: parseMagnitudeToken(id.split('_')[1]) };
  if (id.startsWith('gold_')) return { label: 'Gold', value: state.totalGold, target: parseMagnitudeToken(id.split('_')[1]) };
  if (id.startsWith('summon_')) return { label: 'Summons', value: state.totalSummons, target: parseMagnitudeToken(id.split('_')[1]) };
  if (id === 'equip_5') return { label: 'Active Team', value: state.activeTeamHeroIds.length, target: 4 };
  if (id.startsWith('rebirth_')) return { label: 'Rebirths', value: state.prestigeCount, target: parseMagnitudeToken(id.split('_')[1]) };
  if (id.startsWith('roster_')) return { label: 'Roster Size', value: state.heroRoster.length, target: parseMagnitudeToken(id.split('_')[1]) };
  if (id.startsWith('shards_')) return { label: 'Shards', value: state.heroShards, target: parseMagnitudeToken(id.split('_')[1]) };
  if (id.startsWith('essence_')) return { label: 'Essence', value: state.essence, target: parseMagnitudeToken(id.split('_')[1]) };
  if (id.startsWith('unlocks_')) return { label: 'Permanent Unlocks', value: state.permanentUnlocks.length, target: parseMagnitudeToken(id.split('_')[1]) };
  if (id.startsWith('streak_')) return { label: 'Login Streak', value: state.dailyLoginStreak, target: parseMagnitudeToken(id.split('_')[1]) };
  if (id.startsWith('highest_wave_')) return { label: 'Highest Wave', value: state.highestWaveReached, target: parseMagnitudeToken(id.split('_')[2]) };
  if (id === 'legend_slate') return { label: 'Achievements', value: state.achievements.size, target: 20 };
  return null;
}

export function useNearUnlockAchievements(state: GameState): NearUnlockAchievement[] {
  return useMemo(() => {
    return (ACHIEVEMENTS as Achievement[])
      .filter(ach => !state.achievements.has(ach.id))
      .map(ach => {
        const progress = progressForAchievement(ach.id, state);
        if (!progress) {
          return { ach, ratio: 0, remaining: null, progress: null };
        }
        const ratio = Math.max(0, Math.min(1, progress.value / Math.max(1, progress.target)));
        const remaining = Math.max(0, progress.target - progress.value);
        return { ach, ratio, remaining, progress };
      })
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 3);
  }, [
    state.achievements,
    state.dailyLoginStreak,
    state.essence,
    state.heroRoster.length,
    state.heroShards,
    state.highestWaveReached,
    state.level,
    state.activeTeamHeroIds.length,
    state.permanentUnlocks.length,
    state.prestigeCount,
    state.totalGold,
    state.totalKills,
    state.totalSummons,
    state.wave,
  ]);
}
