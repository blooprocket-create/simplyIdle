import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform, useWindowDimensions } from 'react-native';
import { t } from '../i18n';
import { FeedbackPressable as Pressable } from '../components/FeedbackPressable';

interface TitleScreenProps {
  onStart: () => void;
  startLabel?: string;
  startA11yLabel?: string;
  startDisabled?: boolean;
  statusMessage?: string;
}

export default function TitleScreen({
  onStart,
  startLabel,
  startA11yLabel,
  startDisabled = false,
  statusMessage,
}: TitleScreenProps) {
  const { width } = useWindowDimensions();
  const isPhone = width < 600;
  const supportsNativeDriver = Platform.OS !== 'web';
  const loreLines = [t('title.line1'), t('title.line2'), t('title.line3')];
  const buttonLabel = startLabel ?? t('title.beginCampaign');
  const buttonA11yLabel = startA11yLabel ?? t('title.beginCampaignA11y');

  // Fade-in animations
  const titleOpacity = useMemo(() => new Animated.Value(0), []);
  const subtitleOpacity = useMemo(() => new Animated.Value(0), []);
  const loreOpacity = useMemo(() => new Animated.Value(0), []);
  const ctaOpacity = useMemo(() => new Animated.Value(0), []);
  const ctaPulse = useMemo(() => new Animated.Value(1), []);

  const [loreIndex, setLoreIndex] = useState(0);
  const loreLineOpacity = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    let pulseLoop: Animated.CompositeAnimation | null = null;

    Animated.sequence([
      Animated.timing(titleOpacity, { toValue: 1, duration: 1200, useNativeDriver: supportsNativeDriver }),
      Animated.timing(subtitleOpacity, { toValue: 1, duration: 800, useNativeDriver: supportsNativeDriver }),
      Animated.timing(loreOpacity, { toValue: 1, duration: 600, useNativeDriver: supportsNativeDriver }),
    ]).start();

    // Start CTA after lore finishes
    const ctaTimer = setTimeout(() => {
      Animated.timing(ctaOpacity, { toValue: 1, duration: 500, useNativeDriver: supportsNativeDriver }).start();
      if (!startDisabled) {
        pulseLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(ctaPulse, { toValue: 1.06, duration: 1200, useNativeDriver: supportsNativeDriver }),
            Animated.timing(ctaPulse, { toValue: 1, duration: 1200, useNativeDriver: supportsNativeDriver }),
          ]),
        );
        pulseLoop.start();
        return;
      }

      ctaPulse.setValue(1);
    }, 4000);

    return () => {
      clearTimeout(ctaTimer);
      pulseLoop?.stop();
    };
  }, [titleOpacity, subtitleOpacity, loreOpacity, ctaOpacity, ctaPulse, startDisabled, supportsNativeDriver]);

  // Cycle lore lines
  useEffect(() => {
    const showLine = () => {
      loreLineOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(loreLineOpacity, { toValue: 1, duration: 600, useNativeDriver: supportsNativeDriver }),
        Animated.delay(1800),
        Animated.timing(loreLineOpacity, { toValue: 0, duration: 400, useNativeDriver: supportsNativeDriver }),
      ]).start(() => {
        setLoreIndex(prev => (prev + 1) % loreLines.length);
      });
    };

    const timer = setTimeout(showLine, 2200); // Start after title fades in
    return () => clearTimeout(timer);
  }, [loreIndex, loreLineOpacity, loreLines.length, supportsNativeDriver]);

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
          <Text style={[styles.subtitle, isPhone && styles.subtitlePhone]}>{t('title.subtitle')}</Text>
        </Animated.View>

        {/* Lore crawl */}
        <Animated.View style={[styles.loreContainer, { opacity: loreOpacity }]}>
          <Animated.Text style={[styles.loreText, { opacity: loreLineOpacity }]}>{loreLines[loreIndex]}</Animated.Text>
        </Animated.View>

        {/* CTA */}
        <Animated.View style={[styles.ctaWrap, { opacity: ctaOpacity }]}>
          <Animated.View style={{ transform: [{ scale: startDisabled ? 1 : ctaPulse }] }}>
            <Pressable
              style={[styles.startBtn, startDisabled && styles.startBtnDisabled]}
              onPress={onStart}
              disabled={startDisabled}
              accessibilityRole="button"
              accessibilityLabel={buttonA11yLabel}
              accessibilityState={startDisabled ? { disabled: true } : undefined}
            >
              <Text style={[styles.startBtnText, startDisabled && styles.startBtnTextDisabled]}>{buttonLabel}</Text>
            </Pressable>
          </Animated.View>
          {statusMessage ? <Text style={styles.statusMessage}>{statusMessage}</Text> : null}
        </Animated.View>
      </View>

      {/* Version */}
      <Text style={styles.version}>{t('title.version', { version: '1.0' })}</Text>
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
  ctaWrap: {
    alignItems: 'center',
    gap: 12,
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
  startBtnDisabled: {
    borderColor: '#7A8BA0',
    backgroundColor: 'rgba(122, 139, 160, 0.12)',
  },
  startBtnText: {
    color: '#E8D5B5',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
  },
  startBtnTextDisabled: {
    color: '#BFC7D4',
  },
  statusMessage: {
    maxWidth: 340,
    color: '#9AAABE',
    fontSize: 13,
    lineHeight: 20,
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
