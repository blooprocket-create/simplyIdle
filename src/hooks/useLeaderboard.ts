import { useState, useEffect } from 'react';
import { trackEvent } from '../telemetry';
import {
  fetchCurrentUserRank,
  fetchLeaderboardTop,
  isLiveLeaderboardAvailable,
  submitLeaderboardScore,
} from '../services/leaderboard';
import { refreshCurrentUserPublicUsername } from '../services/publicProfile';
import { getFirebaseAuth } from '../services/firebase';

export interface LiveLeaderboardRow {
  rank: number;
  name: string;
  score: number;
  badge: string;
  isYou: boolean;
}

interface LeaderboardState {
  seasonPoints: number;
  bestSeasonPoints: number;
  wave: number;
  highestWaveReached: number;
  prestigeCount: number;
  level: number;
  vipLevel: number;
  playerName: string | null;
  characterCreated: boolean;
}

interface UseLeaderboardParams {
  state: LeaderboardState;
  accountName: string;
  activeModal: string | null;
}

export function useLeaderboard({ state, accountName, activeModal }: UseLeaderboardParams) {
  const [publicUsername, setPublicUsername] = useState('');
  const [liveLeaderboardRows, setLiveLeaderboardRows] = useState<LiveLeaderboardRow[]>([]);
  const [liveLeaderboardRank, setLiveLeaderboardRank] = useState<number | null>(null);
  const [liveLeaderboardLoading, setLiveLeaderboardLoading] = useState(false);
  const [liveLeaderboardError, setLiveLeaderboardError] = useState<string | null>(null);

  const seasonScore = state.seasonPoints;
  const isEventsModalOpen = activeModal === 'events';
  const playerBoardScore =
    seasonScore +
    Math.floor(state.bestSeasonPoints * 0.35) +
    state.wave * 12 +
    state.highestWaveReached * 9 +
    state.prestigeCount * 280;

  // Fetch public username on mount / account change
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const fresh = await refreshCurrentUserPublicUsername();
      if (!cancelled && fresh) setPublicUsername(fresh);
    })();
    return () => {
      cancelled = true;
    };
  }, [accountName]);

  // Telemetry when events modal is open
  useEffect(() => {
    if (!isEventsModalOpen) return;
    void trackEvent('leaderboard_viewed', {
      rank: liveLeaderboardRank ?? 0,
      score: playerBoardScore,
    });
    void trackEvent('leaderboard_rank', {
      rank: liveLeaderboardRank ?? 0,
      score: playerBoardScore,
    });
  }, [isEventsModalOpen, liveLeaderboardRank, playerBoardScore]);

  // Periodic score submission (every 45 s)
  useEffect(() => {
    if (!state.characterCreated) return;
    if (!isLiveLeaderboardAvailable()) return;

    const submit = async () => {
      try {
        await submitLeaderboardScore({
          accountName,
          publicUsername: publicUsername || accountName,
          score: playerBoardScore,
          level: state.level,
          vipLevel: state.vipLevel,
          highestWaveReached: state.highestWaveReached,
          prestigeCount: state.prestigeCount,
        });
      } catch {
        // Non-blocking background sync.
      }
    };

    void submit();
    const timer = setInterval(() => {
      void submit();
    }, 45_000);

    return () => clearInterval(timer);
  }, [
    state.characterCreated,
    accountName,
    publicUsername,
    playerBoardScore,
    state.level,
    state.vipLevel,
    state.highestWaveReached,
    state.prestigeCount,
  ]);

  // Fetch leaderboard when events modal opens
  useEffect(() => {
    if (!isEventsModalOpen || !state.characterCreated) return;

    let cancelled = false;
    setLiveLeaderboardLoading(true);
    setLiveLeaderboardError(null);

    void (async () => {
      try {
        if (isLiveLeaderboardAvailable()) {
          await submitLeaderboardScore({
            accountName,
            publicUsername: publicUsername || accountName,
            score: playerBoardScore,
            level: state.level,
            vipLevel: state.vipLevel,
            highestWaveReached: state.highestWaveReached,
            prestigeCount: state.prestigeCount,
          });

          const [topRows, myRank] = await Promise.all([
            fetchLeaderboardTop(15),
            fetchCurrentUserRank(playerBoardScore),
          ]);

          if (cancelled) return;

          const mapped = topRows.map((row, index) => ({
            rank: index + 1,
            name: row.publicUsername,
            score: row.score,
            badge: index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⚔️',
            isYou: row.uid === (getFirebaseAuth()?.currentUser?.uid ?? ''),
          }));

          setLiveLeaderboardRows(mapped);
          setLiveLeaderboardRank(myRank);
          return;
        }

        const fallbackRows: LiveLeaderboardRow[] = [
          { rank: 1, name: state.playerName || 'You', score: playerBoardScore, badge: '🛰️', isYou: true },
        ];
        if (!cancelled) {
          setLiveLeaderboardRows(fallbackRows);
          setLiveLeaderboardRank(1);
        }
      } catch {
        if (cancelled) return;
        setLiveLeaderboardError('Leaderboard is currently unavailable.');
      } finally {
        if (!cancelled) {
          setLiveLeaderboardLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isEventsModalOpen,
    state.characterCreated,
    accountName,
    publicUsername,
    playerBoardScore,
    state.level,
    state.vipLevel,
    state.highestWaveReached,
    state.prestigeCount,
  ]);

  return {
    publicUsername,
    setPublicUsername,
    liveLeaderboardRows,
    liveLeaderboardRank,
    liveLeaderboardLoading,
    liveLeaderboardError,
    playerBoardScore,
  };
}
