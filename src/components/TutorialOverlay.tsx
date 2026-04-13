import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';

const TUTORIAL_STEPS = [
  {
    title: 'Welcome, Commander',
    body: 'Your forces attack automatically — enemies fall, gold flows in, and your army grows stronger over time. No need to tap or click anything.',
    callout: null as string | null,
  },
  {
    title: 'The Battlefield',
    body: 'This is where combat happens. Watch your team fight wave after wave of enemies. Every kill earns gold and EXP.',
    callout: 'battle',
  },
  {
    title: 'Build Your Engine',
    body: 'Spend gold on buildings to increase your DPS. Each building type adds a different unit to your army.',
    callout: 'warroom',
  },
  {
    title: 'Recruit Heroes',
    body: 'Heroes are powerful allies with unique abilities. Summon them, add them to your active team, and equip gear to make them stronger.',
    callout: 'heroes',
  },
  {
    title: 'Ready for War',
    body: "That's all you need to get started. Push deeper, unlock new systems, and build the ultimate army. Good luck, Commander.",
    callout: null,
  },
];

interface TutorialOverlayProps {
  onComplete: () => void;
}

export default function TutorialOverlay({ onComplete }: TutorialOverlayProps) {
  const [step, setStep] = useState(0);
  const current = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Text style={styles.stepIndicator}>
          {step + 1} / {TUTORIAL_STEPS.length}
        </Text>
        <Text style={styles.title}>{current.title}</Text>
        <Text style={styles.body}>{current.body}</Text>

        {current.callout && (
          <View style={styles.calloutChip}>
            <Text style={styles.calloutText}>
              👆 Check the{' '}
              <Text style={styles.calloutBold}>
                {current.callout === 'battle'
                  ? '⚔️ Battle'
                  : current.callout === 'warroom'
                    ? '🎖️ War Room'
                    : current.callout === 'heroes'
                      ? '👥 Heroes'
                      : current.callout}
              </Text>{' '}
              tab below
            </Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          {!isFirst && (
            <Pressable style={styles.backBtn} onPress={() => setStep(s => s - 1)}>
              <Text style={styles.backBtnText}>Back</Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.nextBtn, isLast && styles.nextBtnFinal]}
            onPress={() => {
              if (isLast) {
                onComplete();
              } else {
                setStep(s => s + 1);
              }
            }}
          >
            <Text style={styles.nextBtnText}>{isLast ? 'Start Playing' : 'Next'}</Text>
          </Pressable>
        </View>

        {!isLast && (
          <Pressable style={styles.skipBtn} onPress={onComplete}>
            <Text style={styles.skipBtnText}>Skip tutorial</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const { width } = Dimensions.get('window');
const cardWidth = Math.min(400, width - 32);

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4, 8, 18, 0.88)',
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    width: cardWidth,
    backgroundColor: '#12162A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A3458',
    padding: 24,
    alignItems: 'center',
  },
  stepIndicator: {
    color: '#6B7BA0',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 12,
  },
  title: {
    color: '#F0E6D2',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  body: {
    color: '#B0BEC5',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  calloutChip: {
    backgroundColor: '#1A2040',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2A3458',
  },
  calloutText: {
    color: '#8BB8E8',
    fontSize: 14,
    textAlign: 'center',
  },
  calloutBold: {
    fontWeight: '700',
    color: '#A8D4FF',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A3458',
  },
  backBtnText: {
    color: '#8BB8E8',
    fontSize: 15,
    fontWeight: '600',
  },
  nextBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#1E3A5F',
  },
  nextBtnFinal: {
    backgroundColor: '#2B6930',
  },
  nextBtnText: {
    color: '#F0E6D2',
    fontSize: 15,
    fontWeight: '700',
  },
  skipBtn: {
    marginTop: 8,
    paddingVertical: 6,
  },
  skipBtnText: {
    color: '#5A6580',
    fontSize: 13,
  },
});
