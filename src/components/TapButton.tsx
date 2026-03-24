import React, { useRef, useCallback } from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';

interface Props {
  onAttack: () => void;
  dmgPerClick: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function AttackButton({ onAttack, dmgPerClick }: Props) {
  const scale = useSharedValue(1);
  const rotate = useSharedValue('0deg');

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: rotate.value }],
  }));

  const handlePress = useCallback(() => {
    scale.value = withSequence(
      withTiming(0.82, { duration: 70 }),
      withSpring(1, { damping: 5, stiffness: 220 }),
    );
    rotate.value = withSequence(
      withTiming('-12deg', { duration: 60 }),
      withTiming('8deg', { duration: 60 }),
      withSpring('0deg', { damping: 8, stiffness: 200 }),
    );
    onAttack();
  }, [onAttack, scale, rotate]);

  return (
    <View style={styles.wrapper}>
      <AnimatedPressable
        style={[styles.button, animStyle]}
        onPress={handlePress}
        android_ripple={{ color: 'rgba(255,255,255,0.3)', borderless: false }}
        accessibilityRole="button"
        accessibilityLabel={`Attack for ${dmgPerClick} damage`}
      >
        <Text style={styles.sword}>⚔️</Text>
        <Text style={styles.label}>ATTACK</Text>
        <Text style={styles.dmg}>-{dmgPerClick} dmg</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#8B1A1A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 3,
    borderColor: '#FF6644',
  },
  sword: { fontSize: 46, marginBottom: 2 },
  label: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: 3,
  },
  dmg: {
    color: '#FF8866',
    fontSize: 11,
    marginTop: 3,
    fontWeight: '600',
  },
});
