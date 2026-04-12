import { useEffect, useMemo, useState } from 'react';
import { useStoryUnlockToast } from './useStoryUnlockToast';

interface StoryEntry {
  unlocked: boolean;
  id: string;
  title: string;
  chapter: string;
  body: string;
  unlockWave: number;
}

interface RewardPopup {
  title: string;
  detail: string;
}

interface UseGameOverlaysArgs {
  storyEntries: StoryEntry[];
  rewardPopup: RewardPopup | null;
  activeModal: string | null;
  setActiveModal: (modal: string | null) => void;
  clearRewardPopup: () => void;
}

export function useGameOverlays({
  storyEntries,
  rewardPopup,
  activeModal,
  setActiveModal,
  clearRewardPopup,
}: UseGameOverlaysArgs) {
  const [idleChestReward, setIdleChestReward] = useState<{ title: string; detail: string } | null>(null);
  const [storyBeatModal, setStoryBeatModal] = useState<{
    chapter: string;
    title: string;
    body: string;
    wave: number;
  } | null>(null);
  const { storyUnlockToast, setStoryUnlockToast } = useStoryUnlockToast(storyEntries);

  const isOfflineRewardPopup = useMemo(() => {
    if (!rewardPopup) return false;
    return `${rewardPopup.title} ${rewardPopup.detail}`.toLowerCase().includes('offline progress');
  }, [rewardPopup]);

  useEffect(() => {
    if (!storyUnlockToast) return;

    const unlockedStory = storyEntries.find(entry => entry.id === storyUnlockToast.id);
    if (!unlockedStory) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStoryBeatModal({
      chapter: unlockedStory.chapter,
      title: unlockedStory.title,
      body: unlockedStory.body,
      wave: unlockedStory.unlockWave,
    });
  }, [storyUnlockToast, storyEntries]);

  useEffect(() => {
    if (!rewardPopup) return;

    if (isOfflineRewardPopup) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIdleChestReward(rewardPopup);
      setActiveModal('idleChest');
      return;
    }

    const timer = setTimeout(() => {
      clearRewardPopup();
    }, 1500);

    return () => clearTimeout(timer);
  }, [rewardPopup, isOfflineRewardPopup, setActiveModal, clearRewardPopup]);

  useEffect(() => {
    if (!rewardPopup && activeModal !== 'idleChest') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIdleChestReward(null);
    }
  }, [rewardPopup, activeModal]);

  return {
    isOfflineRewardPopup,
    idleChestReward,
    setIdleChestReward,
    storyUnlockToast,
    setStoryUnlockToast,
    storyBeatModal,
    setStoryBeatModal,
  };
}
