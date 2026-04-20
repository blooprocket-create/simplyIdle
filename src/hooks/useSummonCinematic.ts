import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { Rarity } from '../gameConfig';

type SummonHistoryEntry = {
  id: string;
  heroName: string;
  heroEmoji: string;
  rarity: Rarity;
};

type SummonReveal = {
  id: string;
  heroId: string | null;
  heroName: string;
  emoji: string;
  rarity: Rarity;
};

interface UseSummonCinematicParams {
  activeModal: string | null;
  setActiveModal: (modal: 'cinematicSummon' | null) => void;
  canGachaX10: boolean;
  summonHistory: SummonHistoryEntry[];
  heroTemplateIdByName: Map<string, string>;
  featuredHeroId: string;
  summonHeroX10Cinematic: (featuredHeroId?: string, payWithDiamonds?: boolean) => void;
}

export function useSummonCinematic({
  activeModal,
  setActiveModal,
  canGachaX10,
  summonHistory,
  heroTemplateIdByName,
  featuredHeroId,
  summonHeroX10Cinematic,
}: UseSummonCinematicParams) {
  const [summonReveal, setSummonReveal] = useState<SummonReveal | null>(null);
  const [cinematicSummonPhase, setCinematicSummonPhase] = useState<'charge' | 'warp' | 'reveal'>('charge');
  const [cinematicSummonResults, setCinematicSummonResults] = useState<SummonReveal[]>([]);

  const lastSummonIdRef = useRef<string | null>(null);
  const pendingCinematicSummonRef = useRef(false);
  const cinematicTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const cinematicPulse = useMemo(() => new Animated.Value(0), []);
  const cinematicRevealScale = useMemo(() => new Animated.Value(0.8), []);
  const isCinematicModalOpen = activeModal === 'cinematicSummon';

  const clearCinematicTimers = () => {
    cinematicTimersRef.current.forEach(timer => clearTimeout(timer));
    cinematicTimersRef.current = [];
  };

  const mapLatestTen = () =>
    summonHistory.slice(0, 10).map(entry => ({
      id: entry.id,
      heroId: heroTemplateIdByName.get(entry.heroName) ?? null,
      heroName: entry.heroName,
      emoji: entry.heroEmoji,
      rarity: entry.rarity,
    }));

  useEffect(() => {
    if (!isCinematicModalOpen) return;
    cinematicPulse.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(cinematicPulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cinematicPulse, {
          toValue: 0,
          duration: 700,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, [cinematicPulse, isCinematicModalOpen]);

  useEffect(() => {
    if (cinematicSummonPhase !== 'reveal') return;
    cinematicRevealScale.setValue(0.8);
    Animated.spring(cinematicRevealScale, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: true,
    }).start();
  }, [cinematicRevealScale, cinematicSummonPhase]);

  useEffect(() => {
    return () => {
      clearCinematicTimers();
    };
  }, []);

  useEffect(() => {
    const latest = summonHistory[0];
    if (!latest) return;
    if (lastSummonIdRef.current === latest.id) return;
    lastSummonIdRef.current = latest.id;

    if (pendingCinematicSummonRef.current) {
      pendingCinematicSummonRef.current = false;
      const results = mapLatestTen();
      queueMicrotask(() => {
        setCinematicSummonResults(results);
        setCinematicSummonPhase('reveal');
      });
      return;
    }

    if (isCinematicModalOpen) return;

    const reveal: SummonReveal = {
      id: latest.id,
      heroId: heroTemplateIdByName.get(latest.heroName) ?? null,
      heroName: latest.heroName,
      emoji: latest.heroEmoji,
      rarity: latest.rarity,
    };
    queueMicrotask(() => setSummonReveal(reveal));

    const timer = setTimeout(() => setSummonReveal(null), 2000);
    return () => clearTimeout(timer);
  }, [heroTemplateIdByName, isCinematicModalOpen, mapLatestTen, summonHistory]);

  const triggerCinematicSummon = (_featuredHeroId?: string, payWithDiamonds?: boolean) => {
    if (!canGachaX10 || activeModal === 'cinematicSummon') return;

    clearCinematicTimers();
    setCinematicSummonResults([]);
    setActiveModal('cinematicSummon');
    setCinematicSummonPhase('charge');

    const phaseWarp = setTimeout(() => {
      setCinematicSummonPhase('warp');
      pendingCinematicSummonRef.current = true;
      summonHeroX10Cinematic(featuredHeroId, payWithDiamonds);
    }, 850);

    const fallbackReveal = setTimeout(() => {
      if (!pendingCinematicSummonRef.current) return;
      pendingCinematicSummonRef.current = false;
      setCinematicSummonResults(mapLatestTen());
      setCinematicSummonPhase('reveal');
    }, 2600);

    const autoClose = setTimeout(() => {
      setActiveModal(null);
      setCinematicSummonResults([]);
      setCinematicSummonPhase('charge');
    }, 6800);

    cinematicTimersRef.current.push(phaseWarp, fallbackReveal, autoClose);
  };

  const closeCinematicSummon = () => {
    setActiveModal(null);
    setCinematicSummonResults([]);
    setCinematicSummonPhase('charge');
  };

  return {
    summonReveal,
    cinematicSummonPhase,
    cinematicSummonResults,
    cinematicPulse,
    cinematicRevealScale,
    triggerCinematicSummon,
    closeCinematicSummon,
  };
}
