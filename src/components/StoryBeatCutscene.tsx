import React, { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { Audio, ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import { Modal, View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { BREAKPOINTS } from '../gameConfig';
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
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const completionHandledRef = useRef(false);
  const [playbackBlockedBeatId, setPlaybackBlockedBeatId] = useState<string | null>(null);
  const videoUri = beatId ? getStoryCutsceneUri(beatId) : null;
  const playbackBlocked = playbackBlockedBeatId === beatId;
  const isPortraitPhone = viewportHeight > viewportWidth && viewportWidth < BREAKPOINTS.compactPhone;
  const videoResizeMode = isPortraitPhone ? ResizeMode.CONTAIN : ResizeMode.COVER;
  const webVideoStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    objectFit: isPortraitPhone ? 'contain' : 'cover',
  };

  const handlePlaybackComplete = useCallback(() => {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;
    onContinue();
  }, [onContinue]);

  const startWebPlayback = useCallback(async () => {
    const video = webVideoRef.current;
    if (!video) return;

    video.currentTime = 0;
    video.loop = false;
    video.muted = false;
    video.volume = 1;

    try {
      await video.play();
      setPlaybackBlockedBeatId(null);
    } catch {
      setPlaybackBlockedBeatId(beatId);
    }
  }, [beatId]);

  const handleNativePlaybackStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) return;
      if (status.didJustFinish) {
        handlePlaybackComplete();
      }
    },
    [handlePlaybackComplete],
  );

  useEffect(() => {
    completionHandledRef.current = false;
  }, [beatId, visible]);

  useEffect(() => {
    if (!visible || !videoUri) return;

    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
    }).catch(() => {
      // Non-critical; continue playback even if audio mode configuration fails.
    });

    if (Platform.OS !== 'web') return;

    const video = webVideoRef.current;

    return () => {
      if (!video) return;
      video.pause();
      video.currentTime = 0;
    };
  }, [startWebPlayback, videoUri, visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onContinue}>
      <View style={styles.backdrop}>
        <View style={[styles.frame, isPortraitPhone && styles.framePortrait]}>
          <View style={[styles.mediaViewport, isPortraitPhone && styles.mediaViewportPortrait]}>
            {videoUri ? (
              Platform.OS === 'web' ? (
                <video
                  key={videoUri}
                  ref={webVideoRef}
                  src={videoUri}
                  autoPlay
                  loop={false}
                  muted={false}
                  preload="auto"
                  playsInline
                  onEnded={handlePlaybackComplete}
                  onCanPlay={() => {
                    void startWebPlayback();
                  }}
                  style={webVideoStyle}
                />
              ) : (
                <Video
                  key={videoUri}
                  source={{ uri: videoUri }}
                  style={styles.media}
                  shouldPlay
                  isLooping={false}
                  isMuted={false}
                  volume={1}
                  resizeMode={videoResizeMode}
                  onPlaybackStatusUpdate={handleNativePlaybackStatus}
                />
              )
            ) : (
              <View style={styles.fallbackScene}>
                <View style={styles.fallbackGlowA} />
                <View style={styles.fallbackGlowB} />
                <Text style={styles.fallbackLabel}>Scene File Missing</Text>
              </View>
            )}
            {!isPortraitPhone && <View pointerEvents="none" style={styles.mediaScrim} />}
            <View pointerEvents="none" style={styles.edgeVignette} />
          </View>

          <View style={isPortraitPhone ? styles.textPanelStacked : styles.textPanelOverlay}>
            <View style={[styles.kickerRow, isPortraitPhone && styles.kickerRowStacked]}>
              <Text style={styles.chapter}>{chapter}</Text>
              <Text style={styles.sceneBadge}>{videoUri ? 'Cutscene' : 'Briefing'}</Text>
            </View>
            <Text style={[styles.title, isPortraitPhone && styles.titlePortrait]}>{title}</Text>
            <Text style={[styles.body, isPortraitPhone && styles.bodyPortrait]}>{body}</Text>

            <View style={[styles.footerRow, isPortraitPhone && styles.footerRowStacked]}>
              <Text style={[styles.footerHint, isPortraitPhone && styles.footerHintStacked]}>
                {playbackBlocked
                  ? 'Autoplay with sound was blocked. Start the cutscene once and it will close on its own when finished.'
                  : videoUri
                    ? 'This cutscene will close automatically when playback finishes.'
                    : 'No cutscene file found for this beat.'}
              </Text>
              {(playbackBlocked || !videoUri) && (
                <Pressable
                  style={styles.cta}
                  onPress={playbackBlocked ? () => void startWebPlayback() : onContinue}
                  accessibilityRole="button"
                  accessibilityLabel={playbackBlocked ? 'Play cutscene' : 'Continue'}
                >
                  <Text style={styles.ctaText}>{playbackBlocked ? 'Play Cutscene' : 'Continue'}</Text>
                </Pressable>
              )}
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
  framePortrait: {
    height: 'auto',
    maxWidth: 520,
  },
  mediaViewport: {
    flex: 1,
    backgroundColor: '#02050D',
    position: 'relative',
  },
  mediaViewportPortrait: {
    flex: 0,
    aspectRatio: 16 / 9,
  },
  media: {
    width: '100%',
    height: '100%',
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
  textPanelOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 22,
  },
  textPanelStacked: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: '#060A14',
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  kickerRowStacked: {
    alignItems: 'flex-start',
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
  titlePortrait: {
    fontSize: 28,
  },
  body: {
    color: '#C6D3ED',
    fontSize: 15,
    lineHeight: 23,
    maxWidth: 700,
  },
  bodyPortrait: {
    fontSize: 14,
    lineHeight: 21,
  },
  footerRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerRowStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  footerHint: {
    flex: 1,
    color: '#8EA1C8',
    fontSize: 12,
    lineHeight: 18,
  },
  footerHintStacked: {
    flex: 0,
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
