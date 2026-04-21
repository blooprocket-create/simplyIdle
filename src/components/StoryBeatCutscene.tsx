import React, { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { Audio, ResizeMode, Video, type AVPlaybackStatus } from 'expo-av';
import { Modal, View, Text, StyleSheet, Platform } from 'react-native';
import { getStoryCutsceneUri } from '../storyCutscenes';
import { FeedbackPressable as Pressable } from './FeedbackPressable';

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
  const webVideoRef = useRef<HTMLVideoElement | null>(null);
  const completionHandledRef = useRef(false);
  const [playbackBlockedBeatId, setPlaybackBlockedBeatId] = useState<string | null>(null);
  const [playbackIssueBeatId, setPlaybackIssueBeatId] = useState<string | null>(null);
  const videoUri = beatId ? getStoryCutsceneUri(beatId) : null;
  const playbackBlocked = playbackBlockedBeatId === beatId;
  const playbackIssue = playbackIssueBeatId === beatId;

  const handlePlaybackComplete = useCallback(() => {
    if (completionHandledRef.current) return;
    completionHandledRef.current = true;
    onContinue();
  }, [onContinue]);

  const handlePlaybackProblem = useCallback(() => {
    setPlaybackIssueBeatId(beatId);
  }, [beatId]);

  const prepareWebVideo = useCallback((video: HTMLVideoElement) => {
    video.currentTime = 0;
    video.loop = false;
    video.muted = false;
    video.volume = 1;
  }, []);

  const playWebVideo = useCallback(
    async (video: HTMLVideoElement) => {
      prepareWebVideo(video);
      await video.play();
    },
    [prepareWebVideo],
  );

  const startWebPlayback = useCallback(async () => {
    const video = webVideoRef.current;
    if (!video) return;

    try {
      await playWebVideo(video);
      setPlaybackBlockedBeatId(null);
      setPlaybackIssueBeatId(null);
    } catch {
      setPlaybackBlockedBeatId(beatId);
    }
  }, [beatId, playWebVideo]);

  const handleNativePlaybackStatus = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        if (status.error) {
          handlePlaybackProblem();
        }
        return;
      }

      if (status.isPlaying || status.positionMillis > 0) {
        setPlaybackIssueBeatId(null);
      }

      if (status.didJustFinish) {
        handlePlaybackComplete();
      }
    },
    [handlePlaybackComplete, handlePlaybackProblem],
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

    const video = webVideoRef.current;
    if (Platform.OS !== 'web' || !video) return;

    let cancelled = false;

    void playWebVideo(video)
      .then(() => {
        if (cancelled) return;
        setPlaybackBlockedBeatId(null);
        setPlaybackIssueBeatId(null);
      })
      .catch(() => {
        if (cancelled) return;
        setPlaybackBlockedBeatId(beatId);
      });

    return () => {
      cancelled = true;
      if (!video) return;
      video.pause();
      video.currentTime = 0;
    };
  }, [beatId, playWebVideo, videoUri, visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onContinue}>
      <View style={styles.backdrop}>
        <View style={styles.frame}>
          <View style={styles.mediaViewport}>
            {videoUri ? (
              Platform.OS === 'web' ? (
                <video
                  key={videoUri}
                  ref={webVideoRef}
                  src={videoUri}
                  loop={false}
                  muted={false}
                  preload="auto"
                  playsInline
                  onEnded={handlePlaybackComplete}
                  onPlaying={() => {
                    setPlaybackBlockedBeatId(null);
                    setPlaybackIssueBeatId(null);
                  }}
                  onError={handlePlaybackProblem}
                  style={styles.webVideo as CSSProperties}
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
                  resizeMode={ResizeMode.COVER}
                  onPlaybackStatusUpdate={handleNativePlaybackStatus}
                  onError={handlePlaybackProblem}
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

          <View style={styles.textPanelOverlay}>
            <View style={styles.kickerRow}>
              <Text style={styles.chapter}>{chapter}</Text>
              <Text style={styles.sceneBadge}>{videoUri ? 'Cutscene' : 'Briefing'}</Text>
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.body}>{body}</Text>

            <View style={styles.footerRow}>
              <Text style={styles.footerHint}>
                {playbackBlocked
                  ? 'Autoplay with sound was blocked. Start the cutscene manually or skip it.'
                  : playbackIssue
                    ? 'The cutscene hit a playback problem. Skip it to keep the story moving.'
                    : videoUri
                      ? 'This cutscene will close automatically when playback finishes. You can also skip it at any time.'
                      : 'No cutscene file found for this beat.'}
              </Text>
              <View style={styles.footerActions}>
                {playbackBlocked && (
                  <Pressable
                    style={styles.secondaryCta}
                    onPress={() => void startWebPlayback()}
                    accessibilityRole="button"
                    accessibilityLabel="Play cutscene"
                  >
                    <Text style={styles.secondaryCtaText}>Play Cutscene</Text>
                  </Pressable>
                )}
                <Pressable
                  style={styles.cta}
                  onPress={onContinue}
                  accessibilityRole="button"
                  accessibilityLabel={videoUri && !playbackIssue ? 'Skip cutscene' : 'Continue'}
                >
                  <Text style={styles.ctaText}>{videoUri && !playbackIssue ? 'Skip Scene' : 'Continue'}</Text>
                </Pressable>
              </View>
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
  textPanelOverlay: {
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
    alignItems: 'stretch',
    gap: 12,
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
  },
  footerHint: {
    color: '#8EA1C8',
    fontSize: 12,
    lineHeight: 18,
  },
  secondaryCta: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(143, 173, 255, 0.45)',
    backgroundColor: 'rgba(10, 21, 44, 0.72)',
  },
  secondaryCtaText: {
    color: '#D9E7FF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.4,
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
