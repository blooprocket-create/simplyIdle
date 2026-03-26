import { useMemo } from 'react';

interface GameState {
  seasonPoints: number;
  bestSeasonPoints: number;
  wave: number;
  highestWaveReached: number;
  prestigeCount: number;
  playerName: string | null;
}

export interface LeaderboardRow {
  name: string;
  score: number;
  badge: string;
  isYou: boolean;
  rank: number;
}

export interface LeaderboardData {
  rows: LeaderboardRow[];
  myRank: number;
  playerBoardScore: number;
}

export function useLeaderboardCalculation(state: GameState): LeaderboardData {
  return useMemo(() => {
    const seasonScore = state.seasonPoints;
    const playerBoardScore =
      seasonScore
      + Math.floor(state.bestSeasonPoints * 0.35)
      + state.wave * 12
      + state.highestWaveReached * 9
      + state.prestigeCount * 280;

    const seeded = [
      { name: 'NovaMarshal', score: Math.floor(playerBoardScore * 1.22), badge: '👑', isYou: false },
      { name: 'AsterVow', score: Math.floor(playerBoardScore * 1.14), badge: '💎', isYou: false },
      { name: 'RiftKite', score: Math.floor(playerBoardScore * 1.07), badge: '🥇', isYou: false },
      { name: 'NightRelay', score: Math.floor(playerBoardScore * 0.98), badge: '🥈', isYou: false },
      { name: 'LumenForge', score: Math.floor(playerBoardScore * 0.9), badge: '🥉', isYou: false },
      { name: 'ShardNomad', score: Math.floor(playerBoardScore * 0.83), badge: '⚔️', isYou: false },
    ];

    const allRows = [
      ...seeded,
      { name: state.playerName || 'You', score: playerBoardScore, badge: '🛰️', isYou: true },
    ]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((row, idx) => ({ ...row, rank: idx + 1 }));

    const myRank = allRows.find(r => r.isYou)?.rank ?? allRows.length;

    return {
      rows: allRows,
      myRank,
      playerBoardScore,
    };
  }, [state.seasonPoints, state.bestSeasonPoints, state.wave, state.highestWaveReached, state.prestigeCount, state.playerName]);
}
