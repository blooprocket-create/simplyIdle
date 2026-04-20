import React from 'react';
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';

interface StoryBeatCutsceneProps {
  visible: boolean;
  chapter: string;
  title: string;
  body: string;
  onContinue: () => void;
}

/**
 * Fullscreen cutscene gate shown before the existing story modal.
 * Keeps presentation simple while enforcing sequence: cutscene -> modal.
 */
export default function StoryBeatCutscene({ visible, chapter, title, body, onContinue }: StoryBeatCutsceneProps) {
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onContinue}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.chapter}>{chapter}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <Pressable style={styles.cta} onPress={onContinue} accessibilityRole="button" accessibilityLabel="Continue">
            <Text style={styles.ctaText}>Continue</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 10, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    width: '100%',
    maxWidth: 560,
    borderWidth: 1,
    borderColor: '#2E365A',
    borderRadius: 14,
    backgroundColor: '#0B1020',
    paddingHorizontal: 24,
    paddingVertical: 26,
  },
  chapter: {
    color: '#91A3C9',
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  title: {
    color: '#E9EEF8',
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 14,
  },
  body: {
    color: '#BAC8E6',
    fontSize: 16,
    lineHeight: 25,
    marginBottom: 20,
  },
  cta: {
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6F8ED6',
    backgroundColor: '#14264F',
  },
  ctaText: {
    color: '#D9E7FF',
    fontSize: 14,
    fontWeight: '700',
  },
});
