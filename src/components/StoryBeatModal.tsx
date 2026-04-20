import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Animated } from 'react-native';

interface StoryBeatModalProps {
  visible: boolean;
  chapter: string;
  title: string;
  body: string;
  wave: number;
  onDismiss: () => void;
}

/**
 * Cinematic story beat presentation modal.
 * Shows chapter header, title, and body text with a typewriter-style
 * reveal animation when a new story beat unlocks.
 */
export default function StoryBeatModal({ visible, chapter, title, body, wave, onDismiss }: StoryBeatModalProps) {
  const fadeIn = useMemo(() => new Animated.Value(0), []);
  const slideUp = useMemo(() => new Animated.Value(40), []);
  const headerOpacity = useMemo(() => new Animated.Value(0), []);
  const bodyOpacity = useMemo(() => new Animated.Value(0), []);
  const ctaOpacity = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    if (!visible) {
      // Reset for next show
      fadeIn.setValue(0);
      slideUp.setValue(40);
      headerOpacity.setValue(0);
      bodyOpacity.setValue(0);
      ctaOpacity.setValue(0);
      return;
    }

    Animated.sequence([
      // Backdrop fade
      Animated.timing(fadeIn, { toValue: 1, duration: 600, useNativeDriver: true }),
      // Header slide + fade
      Animated.parallel([
        Animated.timing(headerOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(slideUp, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
      // Brief pause
      Animated.delay(400),
      // Body text reveal
      Animated.timing(bodyOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      // CTA after body
      Animated.delay(600),
      Animated.timing(ctaOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [visible, fadeIn, slideUp, headerOpacity, bodyOpacity, ctaOpacity]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.backdrop, { opacity: fadeIn }]}>
        <Animated.View
          style={[
            styles.card,
            {
              opacity: headerOpacity,
              transform: [{ translateY: slideUp }],
            },
          ]}
        >
          {/* Decorative top border */}
          <View style={styles.topBorder} />

          {/* Chapter tag */}
          <Text style={styles.chapterTag}>{chapter}</Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Body text */}
          <Animated.View style={{ opacity: bodyOpacity }}>
            <Text style={styles.body}>{body}</Text>
          </Animated.View>

          {/* Wave requirement tag */}
          <Text style={styles.waveMeta}>Wave {wave} reached</Text>

          {/* Continue button */}
          <Animated.View style={{ opacity: ctaOpacity }}>
            <Pressable
              style={styles.continueBtn}
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="Continue"
            >
              <Text style={styles.continueBtnText}>CONTINUE</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 2, 10, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#0D0B1E',
    borderRadius: 16,
    padding: 32,
    maxWidth: 480,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2450',
  },
  topBorder: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 3,
    backgroundColor: '#C77DFF',
    borderRadius: 2,
  },
  chapterTag: {
    color: '#C77DFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 5,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  divider: {
    width: 60,
    height: 1,
    backgroundColor: '#3A3560',
    marginVertical: 14,
  },
  title: {
    color: '#E8D5B5',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 20,
    textShadowColor: 'rgba(199, 125, 255, 0.3)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  body: {
    color: '#9AAABE',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  waveMeta: {
    color: '#5A5980',
    fontSize: 11,
    letterSpacing: 2,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  continueBtn: {
    borderWidth: 1,
    borderColor: '#C77DFF',
    paddingVertical: 10,
    paddingHorizontal: 40,
    borderRadius: 4,
  },
  continueBtnText: {
    color: '#C77DFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
  },
});
