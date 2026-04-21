import { useMemo } from 'react';
import type { Tab } from '../screens/gameScreenShared';

interface GameState {
  wave: number;
  activeTeamHeroIds: string[];
  unspentStatPoints: number;
  heroRoster: { id: string }[];
  rebirthCount: number;
}

interface MissionCard {
  claimed: boolean;
  progress: { done: boolean };
  mission: { title: string; id: string };
}

export function useGameGuidance(
  canRebirthNow: boolean,
  state: GameState,
  teamSlotCap: number,
  missionCards: MissionCard[],
) {
  return useMemo(() => {
    const recs: Array<{ title: string; detail: string; tab: Tab }> = [];

    // Early-game guidance for new players
    if (state.wave < 5 && state.heroRoster.length === 0) {
      recs.push({
        title: 'Recruit a Hero',
        detail: 'Summon your first hero to start dealing automatic DPS.',
        tab: 'heroes',
      });
    }

    if (canRebirthNow) {
      recs.push({
        title: 'Rebirth Ready',
        detail: 'Open War Room and trigger rebirth for permanent cores.',
        tab: 'warroom',
      });
    }
    if (state.activeTeamHeroIds.length < teamSlotCap) {
      recs.push({
        title: 'Build Full Team',
        detail: `Equip ${teamSlotCap} heroes to stabilize damage and survival.`,
        tab: 'heroes',
      });
    }
    if (state.unspentStatPoints > 0) {
      recs.push({
        title: 'Spend Stat Points',
        detail: 'Use unspent points to increase immediate power.',
        tab: 'stats',
      });
    }
    const firstUnclaimedMission = missionCards.find(m => !m.claimed && m.progress.done);
    if (firstUnclaimedMission) {
      recs.push({
        title: 'Claim Mission Reward',
        detail: `Claim "${firstUnclaimedMission.mission.title}" for instant resources.`,
        tab: 'achievements',
      });
    }

    return recs.slice(0, 3);
  }, [
    canRebirthNow,
    state.wave,
    state.heroRoster.length,
    state.activeTeamHeroIds.length,
    state.unspentStatPoints,
    missionCards,
    teamSlotCap,
  ]);
}
