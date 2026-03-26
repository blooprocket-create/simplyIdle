import { useEffect, useRef, useState } from 'react';

interface StoryBeat {
  unlocked: boolean;
  id: string;
  title: string;
  chapter: string;
}

export function useStoryUnlockToast(storyEntries: StoryBeat[]) {
  const [storyUnlockToast, setStoryUnlockToast] = useState<{ id: string; title: string; chapter: string } | null>(null);
  const storyUnlockInitRef = useRef(false);
  const seenStoryUnlockIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const unlockedIds = storyEntries.filter(entry => entry.unlocked).map(entry => entry.id);
    if (!storyUnlockInitRef.current) {
      seenStoryUnlockIdsRef.current = new Set(unlockedIds);
      storyUnlockInitRef.current = true;
      return;
    }

    const newlyUnlocked = unlockedIds.filter(id => !seenStoryUnlockIdsRef.current.has(id));
    if (newlyUnlocked.length === 0) return;

    const latestId = newlyUnlocked[newlyUnlocked.length - 1];
    const latestEntry = storyEntries.find(entry => entry.id === latestId);
    newlyUnlocked.forEach(id => seenStoryUnlockIdsRef.current.add(id));

    if (latestEntry) {
      setStoryUnlockToast({
        id: latestEntry.id,
        title: latestEntry.title,
        chapter: latestEntry.chapter,
      });
    }
  }, [storyEntries]);

  useEffect(() => {
    if (!storyUnlockToast) return;
    const timer = setTimeout(() => setStoryUnlockToast(null), 4500);
    return () => clearTimeout(timer);
  }, [storyUnlockToast]);

  return { storyUnlockToast, setStoryUnlockToast };
}
