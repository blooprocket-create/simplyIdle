import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated } from 'react-native';

interface VipMilestone {
  level: number;
}

interface UseShopUiArgs {
  activeModal: string | null;
  vipLevel: number;
  vipClaimedLevels: number[];
  vipRewardMilestones: readonly VipMilestone[];
}

export function useShopUi({ activeModal, vipLevel, vipClaimedLevels, vipRewardMilestones }: UseShopUiArgs) {
  const [shopFlashActionId, setShopFlashActionId] = useState<string | null>(null);
  const [vipMilestoneIndex, setVipMilestoneIndex] = useState(0);
  const shopFlashAnim = useMemo(() => new Animated.Value(0), []);

  const triggerShopButtonFlash = useCallback(
    (actionId: string) => {
      setShopFlashActionId(actionId);
      shopFlashAnim.stopAnimation();
      shopFlashAnim.setValue(0);
      Animated.sequence([
        Animated.timing(shopFlashAnim, {
          toValue: 1,
          duration: 110,
          useNativeDriver: false,
        }),
        Animated.timing(shopFlashAnim, {
          toValue: 0,
          duration: 520,
          useNativeDriver: false,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setShopFlashActionId(prev => (prev === actionId ? null : prev));
        }
      });
    },
    [shopFlashAnim],
  );

  useEffect(() => {
    if (activeModal !== 'shop') return;

    const firstClaimable = vipRewardMilestones.findIndex(
      row => vipLevel >= row.level && !vipClaimedLevels.includes(row.level),
    );
    if (firstClaimable >= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVipMilestoneIndex(firstClaimable);
      return;
    }

    const firstUnclaimed = vipRewardMilestones.findIndex(row => !vipClaimedLevels.includes(row.level));
    if (firstUnclaimed >= 0) {
      setVipMilestoneIndex(firstUnclaimed);
      return;
    }

    setVipMilestoneIndex(vipRewardMilestones.length - 1);
  }, [activeModal, vipLevel, vipClaimedLevels, vipRewardMilestones]);

  return {
    shopFlashActionId,
    shopFlashAnim,
    vipMilestoneIndex,
    setVipMilestoneIndex,
    triggerShopButtonFlash,
  };
}
