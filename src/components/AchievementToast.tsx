import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from 'react-native-reanimated';
import { ACHIEVEMENTS } from '../gameConfig.ts';

interface Props {
  achievementId: string | null;
  onDismiss: () => void;
}

export default function AchievementToast({ achievementId, onDismiss }: Props) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(40);

  useEffect(() => {
    if (!achievementId) return;
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.ease) });
    translateY.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.back(2)) });

    // Auto-dismiss after 3s
    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 400 });
      translateY.value = withDelay(200, withTiming(40, { duration: 300 }));
      setTimeout(onDismiss, 700);
    }, 3000);
    return () => clearTimeout(timer);
  }, [achievementId, onDismiss, opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!achievementId) return null;
  const ach = ACHIEVEMENTS.find(a => a.id === achievementId);
  if (!ach) return null;

  return (
    <Animated.View style={[styles.toast, style]} pointerEvents="box-none">
      <Pressable onPress={onDismiss} style={styles.inner}>
        <Text style={styles.emoji}>{ach.emoji}</Text>
        <View>
          <Text style={styles.badge}>ACHIEVEMENT UNLOCKED</Text>
          <Text style={styles.name}>{ach.name}</Text>
          <Text style={styles.desc}>{ach.description}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    zIndex: 999,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1225',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 2,
    borderColor: '#FFD700',
    gap: 12,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 10,
  },
  emoji: {
    fontSize: 36,
  },
  badge: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  name: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  desc: {
    color: '#AAAACC',
    fontSize: 12,
    marginTop: 2,
  },
});
