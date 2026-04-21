import { useEffect, useState } from 'react';
import { getDoc, doc as firestoreDoc, setDoc } from 'firebase/firestore';
import { CLASSES, PlayerClass } from '../gameConfig';
import { getCharacterSaveSlot } from '../useGameState';
import { loadOnlineSaveSlotSummary } from '../services/onlineSave';
import { getFirebaseAuth, getFirebaseFirestore } from '../services/firebase';

export interface CharacterSlotSummary {
  classId: PlayerClass;
  playerName: string | null;
  level: number;
  highestWaveReached: number;
  vipLevel: number;
  occupied: boolean;
}

interface CharacterSlotStateSnapshot {
  characterCreated: boolean;
  playerName: string | null;
  level: number;
  highestWaveReached: number;
  vipLevel: number;
}

interface UseCharacterSlotsParams {
  accountName: string;
  selectedCharacterClass: PlayerClass | null;
  setSelectedCharacterClass: (playerClass: PlayerClass | null) => void;
  hydrated: boolean;
  state: CharacterSlotStateSnapshot;
}

async function loadLastCharacterSlot(uid: string): Promise<PlayerClass | null> {
  const db = getFirebaseFirestore();
  if (!db) return null;
  try {
    const snap = await getDoc(firestoreDoc(db, 'userPreferences', uid));
    if (!snap.exists()) return null;
    const val = snap.data()?.lastCharacterSlot;
    return typeof val === 'string' ? (val as PlayerClass) : null;
  } catch {
    return null;
  }
}

async function saveLastCharacterSlot(uid: string, playerClass: PlayerClass | null): Promise<void> {
  const db = getFirebaseFirestore();
  if (!db) return;
  try {
    await setDoc(firestoreDoc(db, 'userPreferences', uid), { lastCharacterSlot: playerClass ?? null }, { merge: true });
  } catch {
    // non-critical; ignore
  }
}

export function useCharacterSlots({
  accountName,
  selectedCharacterClass,
  setSelectedCharacterClass,
  hydrated,
  state,
}: UseCharacterSlotsParams) {
  const [lastUsedCharacterClass, setLastUsedCharacterClass] = useState<PlayerClass | null>(null);
  const [slotSummaries, setSlotSummaries] = useState<CharacterSlotSummary[]>([]);
  const [slotListLoading, setSlotListLoading] = useState(true);
  const [slotLoadProgress, setSlotLoadProgress] = useState(0);
  const [slotLoadDebugLabel, setSlotLoadDebugLabel] = useState('Checking cloud slot headers...');

  useEffect(() => {
    let cancelled = false;

    async function loadCharacterSlots() {
      setSlotListLoading(true);
      setSlotLoadProgress(0);
      setSlotLoadDebugLabel('Checking cloud slot headers...');
      let loaded = 0;
      const total = CLASSES.length;
      const uid = getFirebaseAuth()?.currentUser?.uid ?? '';
      const lastSelectedPromise = uid ? loadLastCharacterSlot(uid) : Promise.resolve(null);

      const summariesPromise = Promise.all(
        CLASSES.map(async cls => {
          const slotResult = await loadOnlineSaveSlotSummary(getCharacterSaveSlot(accountName, cls.id));
          loaded++;
          if (!cancelled) {
            setSlotLoadProgress(Math.round((loaded / total) * 88));
            setSlotLoadDebugLabel(`Loaded ${cls.name} slot (${loaded}/${total})`);
          }

          const summary = slotResult.ok ? slotResult.data : null;
          if (!summary) {
            return {
              classId: cls.id,
              playerName: null,
              level: 1,
              highestWaveReached: 1,
              vipLevel: 0,
              occupied: false,
            } satisfies CharacterSlotSummary;
          }

          return {
            classId: cls.id,
            playerName: summary.playerName,
            level: summary.level,
            highestWaveReached: summary.highestWaveReached,
            vipLevel: summary.vipLevel,
            occupied: summary.characterCreated,
          } satisfies CharacterSlotSummary;
        }),
      );

      const [summaries, lastSelected] = await Promise.all([summariesPromise, lastSelectedPromise]);

      if (cancelled) return;
      setSlotSummaries(summaries);

      const occupiedClasses = summaries.filter(slot => slot.occupied).map(slot => slot.classId);
      const normalizedLastSelected = lastSelected && CLASSES.some(cls => cls.id === lastSelected) ? lastSelected : null;

      if (cancelled) return;
      setSlotLoadProgress(94);
      setSlotLoadDebugLabel('Restoring last used slot...');
      setLastUsedCharacterClass(normalizedLastSelected);

      if (normalizedLastSelected && occupiedClasses.includes(normalizedLastSelected)) {
        setSelectedCharacterClass(normalizedLastSelected);
      } else if (occupiedClasses.length === 1) {
        setSelectedCharacterClass(occupiedClasses[0]);
      } else {
        setSelectedCharacterClass(null);
      }

      setSlotLoadProgress(100);
      setSlotLoadDebugLabel('Ready.');
      setSlotListLoading(false);
    }

    void loadCharacterSlots();
    return () => {
      cancelled = true;
    };
  }, [accountName, setSelectedCharacterClass]);

  useEffect(() => {
    if (!selectedCharacterClass) return;
    setLastUsedCharacterClass(selectedCharacterClass);
    const uid = getFirebaseAuth()?.currentUser?.uid ?? '';
    if (uid) void saveLastCharacterSlot(uid, selectedCharacterClass);
  }, [accountName, selectedCharacterClass, setSelectedCharacterClass]);

  useEffect(() => {
    if (!selectedCharacterClass || !hydrated || !state.characterCreated) return;
    setSlotSummaries(prev =>
      prev.map(slot =>
        slot.classId === selectedCharacterClass
          ? {
              ...slot,
              occupied: true,
              playerName: state.playerName,
              level: state.level,
              highestWaveReached: state.highestWaveReached,
              vipLevel: Math.max(0, Math.min(10, state.vipLevel ?? 0)),
            }
          : slot,
      ),
    );
  }, [
    hydrated,
    selectedCharacterClass,
    state.characterCreated,
    state.highestWaveReached,
    state.level,
    state.playerName,
    state.vipLevel,
  ]);

  const clearLastUsedClass = async (playerClass: PlayerClass) => {
    const uid = getFirebaseAuth()?.currentUser?.uid ?? '';
    const lastSelected = uid ? await loadLastCharacterSlot(uid) : null;
    if (lastSelected !== playerClass) return;
    if (uid) await saveLastCharacterSlot(uid, null);
    setLastUsedCharacterClass(null);
  };

  return {
    lastUsedCharacterClass,
    slotSummaries,
    setSlotSummaries,
    slotListLoading,
    slotLoadProgress,
    slotLoadDebugLabel,
    clearLastUsedClass,
  };
}
