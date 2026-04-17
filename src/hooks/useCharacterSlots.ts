import { useEffect, useState } from 'react';
import { getDoc, doc as firestoreDoc, setDoc } from 'firebase/firestore';
import { CLASSES, PlayerClass } from '../gameConfig';
import { getCharacterSaveSlot } from '../useGameState';
import { loadOnlineSave } from '../services/onlineSave';
import { getFirebaseAuth, getFirebaseFirestore } from '../services/firebase';

const VIP_LEVEL_THRESHOLDS = [0, 50, 150, 350, 700, 1500, 3000, 6500, 15000, 35000, 100000] as const;

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

function getVipLevelFromPoints(points: number): number {
  let level = 0;
  for (let i = 0; i < VIP_LEVEL_THRESHOLDS.length; i += 1) {
    if (points >= VIP_LEVEL_THRESHOLDS[i]) {
      level = i;
    } else {
      break;
    }
  }
  return Math.max(0, Math.min(10, level));
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

  useEffect(() => {
    let cancelled = false;

    async function loadCharacterSlots() {
      setSlotListLoading(true);
      setSlotLoadProgress(0);
      let loaded = 0;
      const total = CLASSES.length;
      const summaries = await Promise.all(
        CLASSES.map(async cls => {
          const slotResult = await loadOnlineSave<Record<string, unknown>>(getCharacterSaveSlot(accountName, cls.id));
          loaded++;
          if (!cancelled) setSlotLoadProgress(Math.round((loaded / total) * 80));
          const parsed = slotResult.ok && slotResult.data ? slotResult.data.payload : null;
          if (!parsed) {
            return {
              classId: cls.id,
              playerName: null,
              level: 1,
              highestWaveReached: 1,
              vipLevel: 0,
              occupied: false,
            } satisfies CharacterSlotSummary;
          }

          const playerName = typeof parsed.playerName === 'string' ? parsed.playerName.trim().slice(0, 24) : '';
          const occupied = !!playerName && parsed.characterCreated === true;
          const parsedVipPoints =
            typeof parsed.vipPoints === 'number' && Number.isFinite(parsed.vipPoints)
              ? Math.max(0, Math.floor(parsed.vipPoints))
              : 0;
          const parsedVipLevel =
            typeof parsed.vipLevel === 'number' && Number.isFinite(parsed.vipLevel)
              ? Math.max(0, Math.min(10, Math.floor(parsed.vipLevel)))
              : getVipLevelFromPoints(parsedVipPoints);

          return {
            classId: cls.id,
            playerName: occupied ? playerName : null,
            level:
              typeof parsed.level === 'number' && Number.isFinite(parsed.level)
                ? Math.max(1, Math.floor(parsed.level))
                : 1,
            highestWaveReached:
              typeof parsed.highestWaveReached === 'number' && Number.isFinite(parsed.highestWaveReached)
                ? Math.max(1, Math.floor(parsed.highestWaveReached))
                : typeof parsed.wave === 'number' && Number.isFinite(parsed.wave)
                  ? Math.max(1, Math.floor(parsed.wave))
                  : 1,
            vipLevel: occupied ? parsedVipLevel : 0,
            occupied,
          } satisfies CharacterSlotSummary;
        }),
      );

      if (cancelled) return;
      setSlotSummaries(summaries);

      const occupiedClasses = summaries.filter(slot => slot.occupied).map(slot => slot.classId);
      const uid = getFirebaseAuth()?.currentUser?.uid ?? '';
      const lastSelected = uid ? await loadLastCharacterSlot(uid) : null;
      const normalizedLastSelected = lastSelected && CLASSES.some(cls => cls.id === lastSelected) ? lastSelected : null;

      if (cancelled) return;
      setSlotLoadProgress(90);
      setLastUsedCharacterClass(normalizedLastSelected);

      if (normalizedLastSelected && occupiedClasses.includes(normalizedLastSelected)) {
        setSelectedCharacterClass(normalizedLastSelected);
      } else if (occupiedClasses.length === 1) {
        setSelectedCharacterClass(occupiedClasses[0]);
      } else {
        setSelectedCharacterClass(null);
      }

      setSlotLoadProgress(100);
      setSlotListLoading(false);
    }

    void loadCharacterSlots();
    return () => {
      cancelled = true;
    };
  }, [accountName]);

  useEffect(() => {
    if (!selectedCharacterClass) return;
    setLastUsedCharacterClass(selectedCharacterClass);
    const uid = getFirebaseAuth()?.currentUser?.uid ?? '';
    if (uid) void saveLastCharacterSlot(uid, selectedCharacterClass);
  }, [accountName, selectedCharacterClass]);

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
    clearLastUsedClass,
  };
}
