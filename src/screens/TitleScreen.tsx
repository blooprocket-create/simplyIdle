import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, useWindowDimensions } from 'react-native';

interface TitleScreenProps {
  onStart: () => void;
}

const LORE_LINES = [
  'The frontier beacons relight after years of silence.',
  'Your command seal activates.',
  'Old war machines answer your name.',
];

export default function TitleScreen({ onStart }: TitleScreenProps) {
  const { width } = useWindowDimensions();
  const isPhone = width < 600;

  // Fade-in animations
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const loreOpacity = useRef(new Animated.Value(0)).current;
  const ctaOpacity = useRef(new Animated.Value(0)).current;
  const ctaPulse = useRef(new Animated.Value(1)).current;

  const [loreIndex, setLoreIndex] = useState(0);
  const loreLineOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(titleOpacity, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.timing(subtitleOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(loreOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();

    // Start CTA after lore finishes
    const ctaTimer = setTimeout(() => {
      Animated.timing(ctaOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
      // Pulsing CTA
      Animated.loop(
        Animated.sequence([
          Animated.timing(ctaPulse, { toValue: 1.06, duration: 1200, useNativeDriver: true }),
          Animated.timing(ctaPulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    }, 4000);

    return () => clearTimeout(ctaTimer);
  }, [titleOpacity, subtitleOpacity, loreOpacity, ctaOpacity, ctaPulse]);

  // Cycle lore lines
  useEffect(() => {
    const showLine = () => {
      loreLineOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(loreLineOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(loreLineOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start(() => {
        setLoreIndex(prev => (prev + 1) % LORE_LINES.length);
      });
    };

    const timer = setTimeout(showLine, 2200); // Start after title fades in
    return () => clearTimeout(timer);
  }, [loreIndex, loreLineOpacity]);

  return (
    <View style={styles.root}>
      {/* Background vignette layers */}
      <View style={styles.bgGlow} />

      <View style={styles.content}>
        {/* Title */}
        <Animated.View style={{ opacity: titleOpacity }}>
          <Text style={[styles.title, isPhone && styles.titlePhone]}>SIMPLY IDLE</Text>
          <View style={styles.titleDivider} />
        </Animated.View>

        {/* Subtitle */}
        <Animated.View style={{ opacity: subtitleOpacity }}>
          <Text style={[styles.subtitle, isPhone && styles.subtitlePhone]}>Command. Conquer. Ascend.</Text>
        </Animated.View>

        {/* Lore crawl */}
        <Animated.View style={[styles.loreContainer, { opacity: loreOpacity }]}>
          <Animated.Text style={[styles.loreText, { opacity: loreLineOpacity }]}>
            {LORE_LINES[loreIndex]}
          </Animated.Text>
        </Animated.View>

        {/* CTA */}
        <Animated.View style={{ opacity: ctaOpacity, transform: [{ scale: ctaPulse }] }}>
          <Pressable
            style={styles.startBtn}
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel="Begin campaign"
          >
            <Text style={styles.startBtnText}>BEGIN CAMPAIGN</Text>
          </Pressable>
        </Animated.View>
      </View>

      {/* Version */}
      <Text style={styles.version}>v1.0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#06050F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bgGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    // Radial glow effect simulated with border
    borderWidth: 0,
    opacity: 0.3,
  },
  content: {
    alignItems: 'center',
    gap: 24,
    paddingHorizontal: 32,
    maxWidth: 600,
  },
  title: {
    color: '#E8D5B5',
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: 8,
    textAlign: 'center',
    textShadowColor: '#C77DFF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  titlePhone: {
    fontSize: 36,
    letterSpacing: 5,
  },
  titleDivider: {
    width: 120,
    height: 2,
    backgroundColor: '#C77DFF',
    alignSelf: 'center',
    marginTop: 12,
    opacity: 0.6,
  },
  subtitle: {
    color: '#9AAABE',
    fontSize: 18,
    fontWeight: '500',
    letterSpacing: 6,
    textAlign: 'center',
    marginTop: 8,
  },
  subtitlePhone: {
    fontSize: 14,
    letterSpacing: 4,
  },
  loreContainer: {
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 16,
  },
  loreText: {
    color: '#7A8BA0',
    fontSize: 15,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 400,
  },
  startBtn: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#C77DFF',
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 4,
    marginTop: 12,
  },
  startBtnText: {
    color: '#E8D5B5',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
  },
  version: {
    position: 'absolute',
    bottom: 16,
    right: 20,
    color: '#4A4A6A',
    fontSize: 11,
    fontWeight: '500',
  },
});
