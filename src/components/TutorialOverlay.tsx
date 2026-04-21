import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { FeedbackPressable as Pressable } from './FeedbackPressable';

// ─── Tutorial step definitions ──────────────────────────────────
// Steps auto-advance based on game state milestones.
// The component receives the computed `tutorialStep` from GameScreen.

export type TutorialStep =
  | 'welcome' // Full overlay: intro + dismiss
  | 'watch_combat' // Inline banner on Battle tab
  | 'summon_hero' // Heroes tab unlocked, prompt to summon
  | 'deploy_hero' // Prompt to add hero to active team
  | 'complete' // Brief congrats overlay
  | 'done'; // Tutorial finished (not rendered)

export function getTutorialStep(
  tutorialComplete: boolean,
  hasFreeSummon: boolean,
  hasBossTear: boolean,
  hasHero: boolean,
  hasDeployedHero: boolean,
  welcomeDismissed: boolean,
): TutorialStep {
  if (tutorialComplete) return 'done';
  if (!welcomeDismissed) return 'welcome';
  if (!hasFreeSummon && !hasBossTear && !hasHero) return 'watch_combat';
  if (!hasHero) return 'summon_hero';
  if (!hasDeployedHero) return 'deploy_hero';
  return 'complete';
}

/** Which tabs are accessible at each tutorial step */
export function getTutorialAllowedTabs(step: TutorialStep): Set<string> {
  switch (step) {
    case 'welcome':
    case 'watch_combat':
      return new Set(['battle']);
    case 'summon_hero':
    case 'deploy_hero':
      return new Set(['battle', 'heroes']);
    case 'complete':
    case 'done':
      return new Set(); // empty = all allowed
  }
}

// ─── Overlay (welcome + complete step) ──────────────────────────

interface TutorialOverlayProps {
  step: TutorialStep;
  onDismissWelcome: () => void;
  onFinishTutorial: () => void;
}

export default function TutorialOverlay({ step, onDismissWelcome, onFinishTutorial }: TutorialOverlayProps) {
  if (step === 'welcome') {
    return (
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Welcome, Commander</Text>
          <Text style={styles.body}>
            Your troops fight automatically — enemies fall, gold flows in, and your army grows stronger over time.
          </Text>
          <Text style={styles.body}>No need to tap or click. Just watch, strategize, and build.</Text>
          <Pressable style={styles.nextBtn} onPress={onDismissWelcome}>
            <Text style={styles.nextBtnText}>Enter the Battlefield</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (step === 'complete') {
    return (
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>You're Ready, Commander</Text>
          <Text style={styles.body}>
            All systems are now online. Push deeper, unlock new tabs, and build the ultimate army.
          </Text>
          <Pressable style={[styles.nextBtn, styles.nextBtnFinal]} onPress={onFinishTutorial}>
            <Text style={styles.nextBtnText}>Let's Go</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return null;
}

// ─── Inline banner (shown inside the game screen) ───────────────

interface TutorialBannerProps {
  step: TutorialStep;
}

export function TutorialBanner({ step }: TutorialBannerProps) {
  let text: string;
  switch (step) {
    case 'watch_combat':
      text =
        '⚔️ Your army is fighting! Watch them clear waves and earn gold. A free hero summon awaits after your first few kills.';
      break;
    case 'summon_hero':
      text = '🎁 You have a free hero summon! Open the 👥 Heroes tab below to recruit your first hero.';
      break;
    case 'deploy_hero':
      text = '👥 Hero recruited! Now tap your hero in the Roster and add them to your active team to boost your DPS.';
      break;
    default:
      return null;
  }

  return (
    <View style={bannerStyles.container}>
      <Text style={bannerStyles.text}>{text}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const { width } = Dimensions.get('window');
const cardWidth = Math.min(400, width - 32);

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(4, 8, 18, 0.92)',
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
    padding: 28,
    alignItems: 'center',
  },
  title: {
    color: '#F0E6D2',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  body: {
    color: '#B0BEC5',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 14,
  },
  nextBtn: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#1E3A5F',
    marginTop: 8,
  },
  nextBtnFinal: {
    backgroundColor: '#2B6930',
  },
  nextBtnText: {
    color: '#F0E6D2',
    fontSize: 16,
    fontWeight: '700',
  },
});

const bannerStyles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginBottom: 8,
    backgroundColor: '#1A2040',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2A3458',
    borderLeftWidth: 3,
    borderLeftColor: '#4A90D9',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  text: {
    color: '#C8D6E0',
    fontSize: 14,
    lineHeight: 20,
  },
});
