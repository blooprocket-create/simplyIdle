import 'react-native-reanimated';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, Animated } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import GameScreen from './src/screens/GameScreen';
import AuthScreen from './src/screens/AuthScreen';
import TitleScreen from './src/screens/TitleScreen';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { debugLog, identifyTelemetryDevice, initTelemetry, reportCrash, trackEvent, trackTelemetryHeartbeat } from './src/telemetry';
import { getValidOnlineSession, isOnlineAuthAvailable, logoutOnline } from './src/services/onlineAuth';
import { getFirebaseAuth } from './src/services/firebase';
import { markPresenceOffline, startPresenceHeartbeat } from './src/services/presence';

const LOADING_HINTS = [
  'Forging alliances…',
  'Summoning heroes…',
  'Counting gold…',
  'Sharpening swords…',
  'Consulting the oracle…',
];

function LoadingSplash() {
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const [hint, setHint] = useState(() => LOADING_HINTS[Math.floor(Math.random() * LOADING_HINTS.length)]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulseAnim]);

  useEffect(() => {
    const interval = setInterval(() => {
      setHint(LOADING_HINTS[Math.floor(Math.random() * LOADING_HINTS.length)]);
    }, 2800);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="large" color="#7B68EE" style={styles.spinner} />
      <Text style={styles.loadingTitle}>SIMPLY IDLE</Text>
      <Animated.Text style={[styles.loadingHint, { opacity: pulseAnim }]}>
        {hint}
      </Animated.Text>
    </View>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [showTitle, setShowTitle] = useState(true);

  useEffect(() => {
    initTelemetry();
    void trackEvent('app_boot', {
      platform: Platform.OS,
      source: 'App.tsx',
    });
    void trackTelemetryHeartbeat('app_boot');

    // Global unhandled error reporting
    const handler = (event: ErrorEvent) => {
      reportCrash(event.error instanceof Error ? event.error : new Error(String(event.message)), {
        label: 'global_unhandled',
      });
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('error', handler);
      return () => window.removeEventListener('error', handler);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    html.style.height = '100%';
    html.style.overflow = 'auto';
    body.style.height = '100%';
    body.style.minHeight = '100%';
    body.style.overflowX = 'hidden';
    body.style.overflowY = 'auto';
    body.style.touchAction = 'pan-y pinch-zoom';
    body.style.setProperty('-webkit-overflow-scrolling', 'touch');
    body.style.overscrollBehaviorY = 'contain';

    if (root) {
      root.style.minHeight = '100%';
      root.style.overflow = 'visible';
      root.style.touchAction = 'pan-y pinch-zoom';
    }
  }, []);

  useEffect(() => {
    if (!isOnlineAuthAvailable()) {
      setLoading(false);
      return;
    }

    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, () => {
      void (async () => {
        const online = await getValidOnlineSession();
        setAccountName(online);
      })().finally(() => setLoading(false));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (loading) return;
    debugLog('app', 'Session resolution complete', { hasAccount: !!accountName });
    void trackEvent('auth_session_resolved', {
      hasAccount: !!accountName,
      platform: Platform.OS,
    });
    void trackTelemetryHeartbeat('auth_session_resolved');
  }, [loading, accountName]);

  useEffect(() => {
    void identifyTelemetryDevice(accountName);
  }, [accountName]);

  useEffect(() => {
    if (!accountName) return;
    const uid = getFirebaseAuth()?.currentUser?.uid;
    if (!uid) return;

    const stop = startPresenceHeartbeat(uid, accountName, 1);
    return () => {
      stop();
      void markPresenceOffline(uid);
    };
  }, [accountName]);

  if (loading) {
    return <LoadingSplash />;
  }

  if (showTitle) {
    return (
      <TitleScreen onStart={() => setShowTitle(false)} />
    );
  }

  if (!accountName) {
    return (
      <ErrorBoundary label="Authentication">
        <AuthScreen onAuthenticated={setAccountName} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary label="Game">
      <GameScreen
      accountName={accountName}
      onLogout={async () => {
        const uid = getFirebaseAuth()?.currentUser?.uid;
        try {
          if (uid) {
            await markPresenceOffline(uid);
          }
        } catch (error) {
          debugLog('auth', 'Presence offline write failed during logout', {
            uid,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        try {
          if (isOnlineAuthAvailable()) {
            await logoutOnline();
          }
        } catch (error) {
          debugLog('auth', 'Firebase sign-out failed', {
            uid,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        setAccountName(null);
      }}
    />
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A18',
  },
  spinner: {
    marginBottom: 20,
  },
  loadingTitle: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 12,
  },
  loadingHint: {
    color: '#9B8FCC',
    fontSize: 14,
    fontStyle: 'italic',
  },
});
