import { useMemo } from 'react';
import type { Tab } from '../screens/GameScreen';

interface GameState {
  wave: number;
  activeTeamHeroIds: string[];
  unspentStatPoints: number;
}

interface MissionCard {
  claimed: boolean;
  progress: { done: boolean };
  mission: { title: string; id: string };
}

interface CurrentAct {
  bossWave: number;
}

export function useGameGuidance(
  canRebirthNow: boolean,
  state: GameState,
  teamSlotCap: number,
  missionCards: MissionCard[],
  currentAct: CurrentAct,
) {
  return useMemo(() => {
    const recs: Array<{ title: string; detail: string; tab: Tab }> = [];

    if (canRebirthNow) {
      recs.push({ title: 'Rebirth Ready', detail: 'Reset now for permanent cores and stronger scaling.', tab: 'battle' });
    }
    if (state.activeTeamHeroIds.length < teamSlotCap) {
      recs.push({ title: 'Build Full Team', detail: `Equip ${teamSlotCap} heroes to stabilize damage and survival.`, tab: 'heroes' });
    }
    if (state.unspentStatPoints > 0) {
      recs.push({ title: 'Spend Stat Points', detail: 'Use unspent points to increase immediate power.', tab: 'stats' });
    }
    const firstUnclaimedMission = missionCards.find(m => !m.claimed && m.progress.done);
    if (firstUnclaimedMission) {
      recs.push({ title: 'Claim Mission Reward', detail: `Claim "${firstUnclaimedMission.mission.title}" for instant resources.`, tab: 'achievements' });
    }
    recs.push({ title: 'Push Act Boss', detail: `Advance to Wave ${currentAct.bossWave} for permanent unlock progress.`, tab: 'battle' });

    return recs.slice(0, 3);
  }, [canRebirthNow, state.activeTeamHeroIds.length, state.unspentStatPoints, missionCards, currentAct.bossWave, teamSlotCap]);
}
