import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStoryUnlockToast } from './useStoryUnlockToast';

interface StoryEntry {
  unlocked: boolean;
  id: string;
  title: string;
  chapter: string;
  body: string;
  unlockWave: number;
  hasCutscene: boolean;
}

interface RewardPopup {
  title: string;
  detail: string;
}

interface UseGameOverlaysArgs {
  storyEntries: StoryEntry[];
  seenStoryBeatIds: string[];
  storySequenceEnabled: boolean;
  rewardPopup: RewardPopup | null;
  activeModal: string | null;
  allowInitialStoryModal: boolean;
  markStoryBeatSeen: (storyBeatId: string) => void;
  setActiveModal: (modal: string | null) => void;
  clearRewardPopup: () => void;
}

export function useGameOverlays({
  storyEntries,
  seenStoryBeatIds,
  storySequenceEnabled,
  rewardPopup,
  activeModal,
  allowInitialStoryModal,
  markStoryBeatSeen,
  setActiveModal,
  clearRewardPopup,
}: UseGameOverlaysArgs) {
  const [idleChestReward, setIdleChestReward] = useState<{ title: string; detail: string } | null>(null);
  const [storyCutscene, setStoryCutscene] = useState<{
    id: string;
    chapter: string;
    title: string;
    body: string;
    wave: number;
  } | null>(null);
  const [storyBeatModal, setStoryBeatModal] = useState<{
    id: string;
    chapter: string;
    title: string;
    body: string;
    wave: number;
    presentationMode: 'full' | 'brief';
  } | null>(null);
  const { storyUnlockToast, setStoryUnlockToast } = useStoryUnlockToast(storyEntries);

  const queueStorySequence = useCallback(
    (entry: StoryEntry) => {
      if (seenStoryBeatIds.includes(entry.id)) {
        return;
      }

      markStoryBeatSeen(entry.id);
      queueMicrotask(() => {
        if (!entry.hasCutscene) {
          setStoryBeatModal({
            id: entry.id,
            chapter: entry.chapter,
            title: entry.title,
            body: entry.body,
            wave: entry.unlockWave,
            presentationMode: 'full',
          });
          return;
        }

        setStoryCutscene({
          id: entry.id,
          chapter: entry.chapter,
          title: entry.title,
          body: entry.body,
          wave: entry.unlockWave,
        });
      });
    },
    [markStoryBeatSeen, seenStoryBeatIds],
  );

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

  useEffect(() => {
    if (!storySequenceEnabled) {
      prevBeatIndexRef.current = null;
      return;
    }

    if (prevBeatIndexRef.current === null) {
      // First run — seed baseline index.
      // For brand-new runs, allow the currently unlocked opening story beat
      // to present before regular unlock delta tracking takes over.
      const initialEntry = highestUnlockedIndex >= 0 ? storyEntries[highestUnlockedIndex] : null;
      if (allowInitialStoryModal && initialEntry) {
        queueStorySequence(initialEntry);
      }

      prevBeatIndexRef.current = highestUnlockedIndex;
      return;
    }

    if (highestUnlockedIndex > prevBeatIndexRef.current) {
      const entry = storyEntries[highestUnlockedIndex];
      if (entry) {
        queueStorySequence(entry);
      }
    }

    prevBeatIndexRef.current = highestUnlockedIndex;
  }, [allowInitialStoryModal, highestUnlockedIndex, queueStorySequence, storyEntries, storySequenceEnabled]);

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
    storyCutscene,
    setStoryCutscene,
    storyUnlockToast,
    setStoryUnlockToast,
    storyBeatModal,
    setStoryBeatModal,
  };
}
