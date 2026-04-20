import { useEffect, useMemo, useRef, useState } from 'react';
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

  // Direct chapter transition detection — track the highest unlocked beat
  // index and show the modal whenever it increases, regardless of how the
  // unlock was triggered (game-start load, gameplay progression, etc.).
  const highestUnlockedIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < storyEntries.length; i++) {
      if (storyEntries[i].unlocked) idx = i;
    }
    return idx;
  }, [storyEntries]);

  const prevBeatIndexRef = useRef<number | null>(null);
  const initialPrologueShownRef = useRef(false);

  useEffect(() => {
    if (prevBeatIndexRef.current === null) {
      // First run — seed baseline index.
      // Exception: show the testing prologue beat when it is already unlocked.
      const initialEntry = highestUnlockedIndex >= 0 ? storyEntries[highestUnlockedIndex] : null;
      if (initialEntry && initialEntry.id === 'prologue_ash' && !initialPrologueShownRef.current) {
        queueMicrotask(() => {
          setStoryBeatModal({
            chapter: initialEntry.chapter,
            title: initialEntry.title,
            body: initialEntry.body,
            wave: initialEntry.unlockWave,
          });
        });
        initialPrologueShownRef.current = true;
      }

      prevBeatIndexRef.current = highestUnlockedIndex;
      return;
    }

    if (highestUnlockedIndex > prevBeatIndexRef.current) {
      const entry = storyEntries[highestUnlockedIndex];
      if (entry) {
        queueMicrotask(() => {
          setStoryBeatModal({
            chapter: entry.chapter,
            title: entry.title,
            body: entry.body,
            wave: entry.unlockWave,
          });
        });
      }
    }

    prevBeatIndexRef.current = highestUnlockedIndex;
  }, [highestUnlockedIndex, storyEntries]);

  const isOfflineRewardPopup = useMemo(() => {
    if (!rewardPopup) return false;
    return `${rewardPopup.title} ${rewardPopup.detail}`.toLowerCase().includes('offline progress');
  }, [rewardPopup]);

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
