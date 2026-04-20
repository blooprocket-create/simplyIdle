import React, { type CSSProperties } from 'react';
import { ResizeMode, Video } from 'expo-av';
import { Modal, View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { getStoryCutsceneUri } from '../storyCutscenes';

interface StoryBeatCutsceneProps {
  visible: boolean;
  beatId: string;
  chapter: string;
  title: string;
  body: string;
  onContinue: () => void;
}

/**
 * Fullscreen story cutscene that renders video when media is available.
 */
export default function StoryBeatCutscene({
  visible,
  beatId,
  chapter,
  title,
  body,
  onContinue,
}: StoryBeatCutsceneProps) {
  if (!visible) return null;

  const videoUri = beatId ? getStoryCutsceneUri(beatId) : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onContinue}>
      <View style={styles.backdrop}>
        <View style={styles.frame}>
          <View style={styles.mediaViewport}>
            {videoUri ? (
              Platform.OS === 'web' ? (
                React.createElement('video', {
                  key: videoUri,
                  src: videoUri,
                  autoPlay: true,
                  loop: true,
                  muted: true,
                  playsInline: true,
                  style: styles.webVideo as CSSProperties,
                })
              ) : (
                <Video
                  key={videoUri}
                  source={{ uri: videoUri }}
                  style={styles.media}
                  shouldPlay
                  isLooping
                  isMuted
                  resizeMode={ResizeMode.COVER}
                />
              )
            ) : (
              <View style={styles.fallbackScene}>
                <View style={styles.fallbackGlowA} />
                <View style={styles.fallbackGlowB} />
                <Text style={styles.fallbackLabel}>Scene File Missing</Text>
              </View>
            )}
            <View pointerEvents="none" style={styles.mediaScrim} />
            <View pointerEvents="none" style={styles.edgeVignette} />
          </View>

          <View style={styles.textPanel}>
            <View style={styles.kickerRow}>
              <Text style={styles.chapter}>{chapter}</Text>
              <Text style={styles.sceneBadge}>{videoUri ? 'Cutscene' : 'Briefing'}</Text>
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>

            <View style={styles.footerRow}>
              <Text style={styles.footerHint}>
                {videoUri ? 'Continue when you are ready to enter the field.' : 'No cutscene file found for this beat.'}
              </Text>
              <Pressable
                style={styles.cta}
                onPress={onContinue}
                accessibilityRole="button"
                accessibilityLabel="Continue"
              >
                <Text style={styles.ctaText}>Continue</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 4, 10, 0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  frame: {
    width: '100%',
    maxWidth: 960,
    height: '100%',
    maxHeight: 760,
    borderWidth: 1,
    borderColor: '#2E365A',
    borderRadius: 20,
    backgroundColor: '#060A14',
    overflow: 'hidden',
  },
  mediaViewport: {
    flex: 1,
    backgroundColor: '#02050D',
    position: 'relative',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  webVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  fallbackScene: {
    flex: 1,
    backgroundColor: '#050913',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  fallbackGlowA: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(122, 90, 255, 0.22)',
    top: '16%',
    left: '12%',
  },
  fallbackGlowB: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 142, 98, 0.18)',
    bottom: '10%',
    right: '10%',
  },
  fallbackLabel: {
    color: '#D7E0F7',
    fontSize: 14,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  mediaScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '42%',
    backgroundColor: 'rgba(3, 6, 14, 0.72)',
  },
  edgeVignette: {
    position: 'absolute',
    inset: 0,
    borderWidth: 1,
    borderColor: 'rgba(122, 142, 199, 0.22)',
  },
  textPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 22,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  chapter: {
    color: '#9BB0DD',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },
  sceneBadge: {
    color: '#D9E7FF',
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(162, 184, 255, 0.4)',
    backgroundColor: 'rgba(9, 18, 36, 0.8)',
  },
  title: {
    color: '#E9EEF8',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 12,
  },
  body: {
    color: '#C6D3ED',
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 700,
  },
  footerRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerHint: {
    flex: 1,
    color: '#8EA1C8',
    fontSize: 12,
    lineHeight: 18,
  },
  cta: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#8FADFF',
    backgroundColor: '#17305E',
  },
  ctaText: {
    color: '#D9E7FF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
